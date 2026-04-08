#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline/promises';
import { execFileSync } from 'child_process';
import { checkTool, getProfilesDir, loadConfig, saveConfig } from '../lib/config.js';
import { deleteProfile, getProfilePath, listProfiles, loadProfile, parseTags, profileExists, saveProfile, searchProfiles, slugify } from '../lib/profile.js';
import { isUrl, resolveFromName, resolveFromUrl } from '../lib/resolver.js';
import * as twitter from '../lib/fetchers/twitter.js';
import { searchPerson } from '../lib/fetchers/search.js';
import { synthesizeProfile, getBackendName } from '../lib/synthesizer.js';
import { appendChangelog, readChangelog, runMonitor, unreadCount } from '../lib/monitor.js';
import { install, uninstall, status } from '../lib/scheduler.js';
import * as youtube from '../lib/fetchers/youtube.js';
import { generateCards, extractVipData } from '../lib/card.js';

// Colors
const c = {
  cyan: s => `\x1b[36m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  dim: s => `\x1b[90m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
};

function spinner(msg) {
  const chars = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const id = setInterval(() => {
    process.stdout.write(`\r${chars[i++ % chars.length]} ${msg}`);
  }, 100);
  return () => { clearInterval(id); process.stdout.write(`\r${' '.repeat(msg.length + 4)}\r`); };
}

function saveRawSource(personSlug, sourceName, content) {
  const rawDir = path.join(getProfilesDir(), '.raw', personSlug);
  fs.mkdirSync(rawDir, { recursive: true });
  const safeName = sourceName.replace(/[^\w.-]/g, '_').substring(0, 80);
  const filePath = path.join(rawDir, `${safeName}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function gatherData(person) {
  const rawParts = [];
  const sources = [];
  const personSlug = slugify(person.name || 'unknown');

  if (person.twitterHandle) {
    console.log(c.dim(`  Fetching Twitter @${person.twitterHandle}...`));
    const data = twitter.fetchProfile(person.twitterHandle);
    if (data?.rawOutput) {
      rawParts.push(`=== Twitter (@${person.twitterHandle}) ===\n${data.rawOutput}`);
      sources.push(`https://twitter.com/${person.twitterHandle}`);
      saveRawSource(personSlug, `twitter_${person.twitterHandle}`, `# Twitter @${person.twitterHandle}\n\nSource: https://twitter.com/${person.twitterHandle}\nFetched: ${new Date().toISOString()}\n\n${data.rawOutput}`);
    } else if (!twitter.isAvailable()) {
      console.log(c.yellow('  (bird CLI not found, skipping Twitter)'));
    }
  }

  if (person.linkedinUrl) sources.push(person.linkedinUrl);

  // Collect all search results into one consolidated file
  const searchEntries = [];

  if (person.rawSnippets.length) {
    rawParts.push('=== Web Search Results ===');
    person.rawSnippets.forEach((snippet, i) => {
      if (!snippet.trim()) return; // skip empty
      rawParts.push(snippet);
      const url = person.otherUrls?.[i] || '';
      if (url) searchEntries.push({ url, snippet });
    });
  }

  if (rawParts.length < 2 && person.name) {
    console.log(c.dim(`  Searching the web for ${person.name}...`));
    const results = searchPerson(person.name);
    for (const r of results) {
      if (!r.body?.trim() && !r.title?.trim()) continue; // skip empty
      rawParts.push(`${r.title}\n${r.body}`);
      if (!sources.includes(r.url)) sources.push(r.url);
      searchEntries.push({ url: r.url, snippet: `${r.title}\n${r.body}` });
    }
  }

  // Save all search results in ONE file
  if (searchEntries.length) {
    const timestamp = new Date().toISOString();
    const content = `# Web Search Results\n\nFetched: ${timestamp}\nQuery: ${person.name}\n\n` +
      searchEntries
        .filter(e => e.snippet.trim())
        .map(e => `---\n\n**Source:** ${e.url}\n\n${e.snippet}`)
        .join('\n\n');
    saveRawSource(personSlug, 'web_search', content);
  }

  console.log(c.dim(`  Raw data saved to ${path.join(getProfilesDir(), '.raw', personSlug)}/`));
  return [rawParts.join('\n\n'), sources];
}

// Show unread count
try {
  const count = unreadCount();
  if (count > 0) console.error(c.yellow(`[${count} new change(s) - run 'vip digest' to view]`));
} catch {}

const program = new Command();
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
program.name('vip').description('VIP Profile Builder - Auto-build VIP person profiles from public data').version(pkg.version, '-v, --version');

// --- add ---
program.command('add')
  .description('Add a new VIP profile')
  .argument('<query...>', 'Name (multiple words) or URL')
  .option('-c, --company <company>', 'Company name')
  .option('--dry-run', 'Print without saving')
  .option('--no-ai', 'Skip AI synthesis')
  .option('-f, --force', 'Overwrite existing')
  .option('-y, --youtube <urls...>', 'YouTube video URLs to transcribe')
  .action(async (queryParts, opts) => {
    const query = queryParts.join(' ');
    console.log(c.cyan(`Resolving ${query}...`));

    let person;
    if (isUrl(query)) {
      const stop = spinner('Searching for profile...');
      person = resolveFromUrl(query);
      stop();
      if (person.name) {
        console.log(c.green(`  Found: ${person.name}`));
        if (person.twitterHandle) console.log(`  Twitter: @${person.twitterHandle}`);
        const stop2 = spinner('Enriching profile data...');
        const enriched = resolveFromName(person.name);
        stop2();
        person.linkedinUrl = person.linkedinUrl || enriched.linkedinUrl;
        const existing = new Set(person.rawSnippets);
        for (const s of enriched.rawSnippets) if (!existing.has(s)) person.rawSnippets.push(s);
        for (const u of enriched.otherUrls) if (!person.otherUrls.includes(u)) person.otherUrls.push(u);
      }
    } else {
      const stop = spinner('Searching for profile...');
      person = resolveFromName(query, opts.company);
      stop();
    }

    if (!person.name) { console.error(c.red('Could not identify person.')); process.exit(1); }

    console.log(c.green(`  Name: ${person.name}`));
    if (person.twitterHandle) console.log(`  Twitter: @${person.twitterHandle}`);
    if (person.linkedinUrl) console.log(`  LinkedIn: ${person.linkedinUrl}`);

    if (!opts.force && profileExists(person.name)) {
      console.log(`Profile for '${person.name}' already exists. Use -f to overwrite.`);
      return;
    }

    console.log(c.cyan('Gathering data...'));
    let [rawData, sources] = gatherData(person);

    // YouTube transcription
    if (opts.youtube?.length) {
      if (!youtube.isAvailable()) {
        console.log(c.yellow('YouTube transcriber not available. Skipping videos.'));
      } else {
        for (const ytUrl of opts.youtube) {
          const stop = spinner(`Transcribing video: ${ytUrl}...`);
          try {
            const yt = youtube.transcribeVideo(ytUrl);
            stop();
            console.log(c.green(`  Transcribed: ${yt.title}`));
            rawData += `\n\n=== YouTube Video: ${yt.title} (${yt.url}) ===\n${yt.transcript}`;
            sources.push(yt.url);
          } catch (e) {
            stop();
            console.log(c.yellow(`  Failed: ${e.message}`));
          }
        }
      }
    }

    if (!rawData.trim()) { console.error(c.red('No data found.')); process.exit(1); }

    let profile;
    if (opts.ai === false) {
      profile = `# ${person.name}\n\n## Raw Data\n\n${rawData}`;
    } else {
      const stop = spinner('Synthesizing profile with AI...');
      try {
        profile = await synthesizeProfile(rawData, sources);
      } catch (e) {
        console.error(c.red(`AI synthesis failed: ${e.message}`));
        console.error(c.dim('Use --no-ai to save raw data without synthesis.'));
        process.exit(1);
      } finally { stop(); }
    }

    if (opts.dryRun) {
      console.log('\n' + '='.repeat(60));
      console.log(profile);
    } else {
      const filepath = saveProfile(person.name, profile);
      console.log(c.green(`\nProfile saved: ${filepath}`));
      appendChangelog({
        timestamp: new Date().toISOString(),
        name: person.name,
        slug: slugify(person.name),
        type: 'created',
        summary: `Profile created for ${person.name}`,
      });
    }
  });

// --- list ---
program.command('list')
  .description('List all VIP profiles')
  .option('--json', 'Output as JSON')
  .option('--tag <tag>', 'Filter by tag')
  .action((opts) => {
    let profiles = listProfiles();

    if (opts.tag) {
      profiles = profiles.filter(p => {
        const content = loadProfile(p.slug);
        if (!content) return false;
        const tags = parseTags(content);
        return tags.includes(opts.tag);
      });
    }

    if (opts.json) {
      const data = profiles.map(p => ({ slug: p.slug, name: p.name, summary: p.summary, updated: p.updated, path: p.path }));
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (!profiles.length) { console.log(c.dim('No profiles yet. Use "vip add" to create one.')); return; }

    const cols = process.stdout.columns || 80;
    const nameW = Math.min(30, Math.max(15, cols / 4 | 0));
    const dateW = 12;
    const sumW = Math.max(20, cols - nameW - dateW - 4);

    console.log(c.bold(c.cyan(`\n${'Name'.padEnd(nameW)} ${'Summary'.padEnd(sumW)} ${'Updated'.padEnd(dateW)}`)));
    console.log('─'.repeat(nameW + sumW + dateW + 2));
    for (const p of profiles) {
      const name = p.name.slice(0, nameW - 1).padEnd(nameW);
      const summary = c.dim(p.summary.slice(0, sumW - 1).padEnd(sumW));
      console.log(`${name} ${summary} ${p.updated}`);
    }
    console.log(`\nTotal: ${profiles.length} profile(s)`);
  });

// --- show ---
program.command('show')
  .description('Show a VIP profile')
  .argument('<name>')
  .option('--json', 'Output as JSON')
  .action((name, opts) => {
    const content = loadProfile(name);
    if (!content) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }

    if (opts.json) {
      const slug = slugify(name);
      const nameMatch = content.match(/^# (.+)$/m);
      const profileName = nameMatch ? nameMatch[1] : name;
      const vipData = extractVipData(content);
      const data = { slug, name: profileName, content, vipData: vipData || null };
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    for (const line of content.split('\n')) {
      if (line.startsWith('# ')) console.log(c.bold(c.cyan(line)));
      else if (line.startsWith('## ')) console.log(c.bold(c.green(line)));
      else if (line.startsWith('> ')) console.log(c.yellow(line));
      else if (line.startsWith('---') || line.startsWith('*Last') || line.startsWith('*Sources')) console.log(c.dim(line));
      else console.log(line);
    }
  });

// --- search ---
program.command('search')
  .description('Search across all profiles')
  .argument('<keyword>')
  .option('--json', 'Output as JSON')
  .action((keyword, opts) => {
    const results = searchProfiles(keyword);
    if (opts.json) {
      const data = results.map(r => ({ slug: r.slug, name: r.name, matches: r.matches }));
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    if (!results.length) { console.log(c.dim(`No matches for '${keyword}'.`)); return; }

    console.log(c.green(`Found ${results.length} profile(s) matching '${keyword}':\n`));
    for (const r of results) {
      console.log(c.bold(c.cyan(`  ${r.name}`)));
      for (const m of r.matches) console.log(`    > ${m}`);
      console.log();
    }
  });

// --- open ---
program.command('open')
  .description('Open a profile in editor')
  .argument('<name>')
  .action((name) => {
    const p = getProfilePath(name);
    if (!fs.existsSync(p)) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }
    const editor = process.env.EDITOR || 'open';
    execFileSync(editor, [p], { stdio: 'inherit' });
  });

// --- update ---
program.command('update')
  .description('Refresh an existing profile')
  .argument('<name>')
  .option('--no-ai', 'Skip AI synthesis')
  .action(async (name, opts) => {
    const content = loadProfile(name);
    if (!content) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }

    const { extractMetadata } = await import('../lib/monitor.js');
    const meta = extractMetadata(content);
    const personName = meta.name || name;

    console.log(c.cyan(`Refreshing profile for ${personName}...`));
    const stop = spinner('Resolving...');
    const person = resolveFromName(personName);
    stop();

    if (meta.twitterHandle) person.twitterHandle = person.twitterHandle || meta.twitterHandle;
    if (meta.linkedinUrl) person.linkedinUrl = person.linkedinUrl || meta.linkedinUrl;

    const [rawData, sources] = gatherData(person);
    if (!rawData.trim()) { console.log(c.yellow('No new data found.')); return; }

    let profile;
    if (opts.ai === false) {
      profile = `# ${personName}\n\n## Raw Data\n\n${rawData}`;
    } else {
      const stop2 = spinner('Re-synthesizing profile...');
      try {
        profile = await synthesizeProfile(rawData, sources);
      } catch (e) {
        console.error(c.red(`AI synthesis failed: ${e.message}`));
        console.error(c.dim('Use --no-ai to save raw data without synthesis.'));
        process.exit(1);
      } finally { stop2(); }
    }

    const filepath = saveProfile(personName, profile);
    console.log(c.green(`Profile updated: ${filepath}`));
  });

// --- rm ---
program.command('rm')
  .description('Delete a VIP profile')
  .argument('<name>')
  .option('-y, --yes', 'Skip confirmation')
  .action((name, opts) => {
    if (!loadProfile(name)) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }
    if (!opts.yes) { console.log('Use -y to confirm deletion.'); return; }
    deleteProfile(name);
    console.log(c.green(`Profile deleted: ${name}`));
  });

function appendNote(content, note) {
  if (content.includes('## Notes')) {
    return content.replace('## Notes\n', `## Notes\n- ${note}\n`);
  } else if (content.includes('\n---\n')) {
    return content.replace('\n---\n', `\n## Notes\n- ${note}\n\n---\n`);
  } else {
    return content.trimEnd() + `\n\n## Notes\n- ${note}\n`;
  }
}

// --- edit ---
program.command('edit')
  .description('Edit profile fields')
  .argument('<name>')
  .option('--title <title>', 'Set job title')
  .option('--company <company>', 'Set company')
  .option('--twitter <handle>', 'Set Twitter handle')
  .option('--linkedin <url>', 'Set LinkedIn URL')
  .option('--note <note>', 'Append a note')
  .action((name, opts) => {
    let content = loadProfile(name);
    if (!content) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }

    let modified = false;

    if (opts.title) {
      const before = content;
      content = content.replace(/(\*\*Title:\*\*) .+/, `$1 ${opts.title}`);
      if (content === before) {
        console.log(c.yellow(`  Warning: Could not find Title field to update. Adding to notes instead.`));
        content = appendNote(content, `Title: ${opts.title}`);
      }
      modified = true;
    }
    if (opts.company) {
      const before = content;
      content = content.replace(/(\*\*Company:\*\*) .+/, `$1 ${opts.company}`);
      if (content === before) {
        console.log(c.yellow(`  Warning: Could not find Company field to update. Adding to notes instead.`));
        content = appendNote(content, `Company: ${opts.company}`);
      }
      modified = true;
    }
    if (opts.twitter) {
      const handle = opts.twitter.replace(/^@/, '');
      const before = content;
      content = content.replace(/(Twitter:) .+/, `$1 https://twitter.com/${handle}`);
      if (content === before) {
        console.log(c.yellow(`  Warning: Could not find Twitter field to update. Adding to notes instead.`));
        content = appendNote(content, `Twitter: https://twitter.com/${handle}`);
      }
      modified = true;
    }
    if (opts.linkedin) {
      const before = content;
      content = content.replace(/(LinkedIn:) .+/, `$1 ${opts.linkedin}`);
      if (content === before) {
        console.log(c.yellow(`  Warning: Could not find LinkedIn field to update. Adding to notes instead.`));
        content = appendNote(content, `LinkedIn: ${opts.linkedin}`);
      }
      modified = true;
    }
    if (opts.note) {
      content = appendNote(content, opts.note);
      modified = true;
    }

    if (modified) { saveProfile(name, content); console.log(c.green('Profile updated.')); }
    else console.log(c.yellow('No changes. Use --title, --company, --twitter, --linkedin, or --note.'));
  });

// --- youtube ---
program.command('youtube')
  .description('Add YouTube video transcript to existing profile')
  .argument('<name>', 'Profile name')
  .argument('<url>', 'YouTube video URL')
  .option('--no-ai', 'Skip AI synthesis')
  .action(async (name, url, opts) => {
    const content = loadProfile(name);
    if (!content) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }

    if (!youtube.isAvailable()) {
      console.error(c.red('YouTube transcriber not available.'));
      process.exit(1);
    }

    const stop = spinner(`Transcribing: ${url}...`);
    let yt;
    try { yt = youtube.transcribeVideo(url); } finally { stop(); }
    console.log(c.green(`  Transcribed: ${yt.title}`));

    const { extractMetadata } = await import('../lib/monitor.js');
    const meta = extractMetadata(content);

    // Combine existing profile data with new transcript
    const rawData = content + `\n\n=== YouTube Video: ${yt.title} (${yt.url}) ===\n${yt.transcript}`;
    const sources = [yt.url];

    let profile;
    if (opts.ai === false) {
      profile = `# ${meta.name || name}\n\n## Raw Data\n\n${rawData}`;
    } else {
      const stop2 = spinner('Re-synthesizing profile...');
      try {
        profile = await synthesizeProfile(rawData, sources);
      } catch (e) {
        console.error(c.red(`AI synthesis failed: ${e.message}`));
        console.error(c.dim('Use --no-ai to save raw data without synthesis.'));
        process.exit(1);
      } finally { stop2(); }
    }

    const filepath = saveProfile(meta.name || name, profile);
    console.log(c.green(`Profile updated: ${filepath}`));
  });

// --- youtube-search ---
program.command('youtube-search')
  .description('Find YouTube videos for a person')
  .argument('<name>', 'Person name')
  .option('-n, --count <n>', 'Max results', '5')
  .action((name, opts) => {
    console.log(c.cyan(`Searching YouTube for ${name}...`));
    const results = youtube.searchYouTubeVideos(name, parseInt(opts.count));

    if (!results.length) { console.log(c.dim('No YouTube videos found.')); return; }

    console.log(c.green(`Found ${results.length} video(s):\n`));
    results.forEach((r, i) => {
      console.log(`  ${c.bold(c.cyan(`${i + 1}.`))} ${r.title}`);
      console.log(c.dim(`     ${r.url}`));
      if (r.body) console.log(c.dim(`     ${r.body.slice(0, 100)}`));
      console.log();
    });
    console.log(c.dim('Use: vip youtube <name> <url> to transcribe and add to profile'));
  });

// --- card ---
program.command('card')
  .description('Generate and serve H5 baseball card page')
  .option('-o, --output <path>', 'Output HTML file', path.join(os.homedir(), '.vip', 'cards', 'index.html'))
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-w, --watch', 'Watch profile files and auto-regenerate')
  .option('--no-serve', 'Only generate, do not start server')
  .action(async (opts) => {
    function regenerate() {
      const profiles = listProfiles();
      if (!profiles.length) return null;
      return generateCards(profiles, opts.output);
    }

    console.log(c.cyan('Generating baseball cards...'));
    const outputPath = regenerate();
    if (!outputPath) { console.log(c.dim('No profiles. Use "vip add" first.')); return; }
    console.log(c.green(`Cards generated: ${outputPath}`));

    if (opts.serve === false) {
      console.log(c.dim(`Open in browser: open ${outputPath}`));
      return;
    }

    const http = await import('http');
    const port = parseInt(opts.port);
    const dir = path.dirname(outputPath);
    const file = path.basename(outputPath);

    const server = http.createServer(async (req, res) => {
      // API: regenerate a profile
      if (req.url.startsWith('/api/regenerate/')) {
        const slug = req.url.replace('/api/regenerate/', '').replace(/\//g, '');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');

        console.log(c.cyan(`  Regenerating ${slug}...`));
        try {
          const content = loadProfile(slug);
          if (!content) { res.writeHead(404); res.end(JSON.stringify({ error: 'Profile not found' })); return; }

          const { extractMetadata } = await import('../lib/monitor.js');
          const meta = extractMetadata(content);
          const personName = meta.name || slug;

          const person = resolveFromName(personName);
          if (meta.twitterHandle) person.twitterHandle = person.twitterHandle || meta.twitterHandle;
          if (meta.linkedinUrl) person.linkedinUrl = person.linkedinUrl || meta.linkedinUrl;

          const [rawData, sources] = gatherData(person);
          if (!rawData.trim()) { res.writeHead(400); res.end(JSON.stringify({ error: 'No data found' })); return; }

          const profile = await synthesizeProfile(rawData, sources);
          saveProfile(personName, profile);

          // Regenerate cards
          regenerate();

          console.log(c.green(`  ${personName} regenerated.`));
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, name: personName }));
        } catch (e) {
          console.error(c.red(`  Error: ${e.message}`));
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      // Static files
      const filePath = req.url === '/' ? path.join(dir, file) : path.join(dir, req.url);
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      res.end(fs.readFileSync(filePath));
    });

    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(c.green(`\nServer running at ${c.bold(url)}`));

      // Watch profiles dir for changes
      if (opts.watch) {
        const profilesDir = getProfilesDir();
        console.log(c.dim(`Watching ${profilesDir} for changes...`));
        fs.watch(profilesDir, { recursive: false }, (event, filename) => {
          if (!filename?.endsWith('.md')) return;
          console.log(c.dim(`  ${filename} changed, regenerating...`));
          regenerate();
        });
        console.log(c.dim('Edit a .md profile file and the cards will auto-update.'));
      }

      console.log(c.dim('Press Ctrl+C to stop\n'));
      try { execFileSync('open', [url], { stdio: 'ignore' }); } catch {}
    });
  });

// --- digest ---
program.command('digest')
  .description('Show recent changes')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const entries = readChangelog(30);
    if (opts.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }
    if (!entries.length) { console.log(c.dim('No recent changes.')); return; }

    console.log(c.bold(c.cyan('Changes in the last 30 days:\n')));
    for (const e of entries.reverse()) {
      const label = e.type === 'created' ? c.cyan('[created]') : c.green('[updated]');
      console.log(`  ${label} [${(e.timestamp || '').slice(0, 10)}] ${e.name}`);
      console.log(`    ${e.summary}`);
      console.log();
    }
  });

// --- monitor ---
const mon = program.command('monitor').description('Manage automatic monitoring');

mon.command('start').description('Start monitoring').action(() => {
  try { install(); const s = status(); console.log(c.green(`Monitor started (every ${s.intervalHours}h)`)); }
  catch (e) { console.error(c.red(e.message)); process.exit(1); }
});

mon.command('stop').description('Stop monitoring').action(() => { uninstall(); console.log(c.green('Monitor stopped.')); });

mon.command('status').description('Show status').action(() => {
  const s = status();
  console.log(`Status: ${s.running ? c.green('running') : c.red('stopped')}`);
  console.log(`Interval: every ${s.intervalHours}h`);
  console.log(`Installed: ${s.installed}`);
  if (s.installed) console.log(`Plist: ${s.plistPath}`);
});

mon.command('run').description('Run monitoring now').option('-v, --verbose', 'Verbose').action(async (opts) => {
  console.log(c.cyan('Running monitor...'));
  const changes = await runMonitor(null, opts.verbose);
  if (changes.length) {
    console.log(c.green(`\n${changes.length} profile(s) updated:`));
    for (const ch of changes) console.log(`  - ${ch.name}: ${ch.summary}`);
  } else console.log(c.dim('No significant changes detected.'));
});

// --- compare ---
program.command('compare')
  .description('Compare two VIP profiles side by side')
  .argument('<name1>', 'First profile name')
  .argument('<name2>', 'Second profile name')
  .option('--json', 'Output as JSON')
  .action((name1, name2, opts) => {
    const content1 = loadProfile(name1);
    if (!content1) { console.error(c.red(`Profile not found: ${name1}`)); process.exit(1); }
    const content2 = loadProfile(name2);
    if (!content2) { console.error(c.red(`Profile not found: ${name2}`)); process.exit(1); }

    function parseProfile(content) {
      const vip = extractVipData(content);
      if (vip) return vip;

      const nameMatch = content.match(/^# (.+)$/m);
      const titleMatch = content.match(/\*\*Title:\*\*\s*(.+)/);
      const companyMatch = content.match(/\*\*Company:\*\*\s*(.+)/);
      const locationMatch = content.match(/\*\*Location:\*\*\s*(.+)/);
      const discMatch = content.match(/\*\*DISC:\*\*\s*(.+)/);
      const mbtiMatch = content.match(/\*\*MBTI:\*\*\s*(.+)/);
      const industryMatch = content.match(/\*\*Industry:\*\*\s*(.+)/);

      const tags = parseTags(content);
      if (industryMatch && !tags.length) tags.push(industryMatch[1].trim());

      return {
        name: nameMatch ? nameMatch[1] : '',
        title: titleMatch ? titleMatch[1].trim() : '',
        company: companyMatch ? companyMatch[1].trim() : '',
        location: locationMatch ? locationMatch[1].trim() : '',
        disc: discMatch ? discMatch[1].trim() : '',
        mbti: mbtiMatch ? mbtiMatch[1].trim() : '',
        tags,
      };
    }

    const p1 = parseProfile(content1);
    const p2 = parseProfile(content2);

    const name1Display = p1.name || name1;
    const name2Display = p2.name || name2;

    const tags1 = (p1.tags || []).map(t => t.toLowerCase());
    const tags2 = (p2.tags || []).map(t => t.toLowerCase());
    const shared = tags1.filter(t => tags2.includes(t));
    const unique1 = tags1.filter(t => !tags2.includes(t));
    const unique2 = tags2.filter(t => !tags1.includes(t));

    if (opts.json) {
      console.log(JSON.stringify({
        profile1: { name: name1Display, title: p1.title, company: p1.company, location: p1.location, disc: p1.disc, mbti: p1.mbti, tags: p1.tags },
        profile2: { name: name2Display, title: p2.title, company: p2.company, location: p2.location, disc: p2.disc, mbti: p2.mbti, tags: p2.tags },
        shared,
        uniqueToFirst: unique1,
        uniqueToSecond: unique2,
      }, null, 2));
      return;
    }

    const col1W = Math.max(20, name1Display.length + 4);
    const col2W = Math.max(20, name2Display.length + 4);
    const labelW = 16;

    console.log();
    console.log(c.bold(c.cyan(`${name1Display} vs ${name2Display}`)));
    console.log('═'.repeat(labelW + col1W + col2W));

    console.log(`${''.padEnd(labelW)}${c.bold(name1Display.padEnd(col1W))}${c.bold(name2Display.padEnd(col2W))}`);

    const fields = [
      ['Title:', p1.title, p2.title],
      ['Company:', p1.company, p2.company],
      ['Location:', p1.location, p2.location],
      ['DISC:', p1.disc, p2.disc],
      ['MBTI:', p1.mbti, p2.mbti],
    ];

    for (const [label, v1, v2] of fields) {
      if (!v1 && !v2) continue;
      console.log(`${c.dim(label.padEnd(labelW))}${(v1 || c.dim('—')).toString().padEnd(col1W)}${(v2 || c.dim('—')).toString().padEnd(col2W)}`);
    }

    console.log();
    if (shared.length) console.log(`${c.green('Shared interests:')} ${shared.join(', ')}`);
    if (unique1.length) console.log(`${c.cyan(`Unique to ${name1Display}:`)} ${unique1.join(', ')}`);
    if (unique2.length) console.log(`${c.cyan(`Unique to ${name2Display}:`)} ${unique2.join(', ')}`);
    if (!shared.length && !unique1.length && !unique2.length) console.log(c.dim('No tags to compare.'));
    console.log();
  });

// --- tag ---
program.command('tag')
  .description('Add a tag to a profile')
  .argument('<name>', 'Profile name')
  .argument('<tag>', 'Tag to add')
  .action((name, tag) => {
    let content = loadProfile(name);
    if (!content) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }

    const tagLine = `- ${tag}`;
    const tagsMatch = content.match(/## Tags\n([\s\S]*?)(?=\n##|\n---|$)/);

    if (tagsMatch) {
      const existingTags = parseTags(content);
      if (existingTags.includes(tag)) {
        console.log(c.yellow(`Tag '${tag}' already exists on ${name}.`));
        return;
      }
      content = content.replace(tagsMatch[0], tagsMatch[0].trimEnd() + '\n' + tagLine);
    } else if (content.includes('\n---\n')) {
      content = content.replace('\n---\n', `\n## Tags\n${tagLine}\n\n---\n`);
    } else {
      content = content.trimEnd() + `\n\n## Tags\n${tagLine}\n`;
    }

    saveProfile(name, content);
    console.log(c.green(`Tagged ${name} with '${tag}'.`));
  });

// --- untag ---
program.command('untag')
  .description('Remove a tag from a profile')
  .argument('<name>', 'Profile name')
  .argument('<tag>', 'Tag to remove')
  .action((name, tag) => {
    let content = loadProfile(name);
    if (!content) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }

    const tagsMatch = content.match(/## Tags\n([\s\S]*?)(?=\n##|\n---|$)/);
    if (!tagsMatch) {
      console.log(c.yellow(`No tags found on ${name}.`));
      return;
    }

    const lines = tagsMatch[1].split('\n').filter(l => l.match(/^- /));
    const remaining = lines.filter(l => l.replace(/^- /, '').trim() !== tag);

    if (remaining.length === lines.length) {
      console.log(c.yellow(`Tag '${tag}' not found on ${name}.`));
      return;
    }

    if (remaining.length === 0) {
      // Remove the entire Tags section
      content = content.replace(/\n?## Tags\n[\s\S]*?(?=\n##|\n---|$)/, '');
    } else {
      content = content.replace(tagsMatch[0], '## Tags\n' + remaining.join('\n'));
    }

    saveProfile(name, content);
    console.log(c.green(`Removed tag '${tag}' from ${name}.`));
  });

// --- tags ---
program.command('tags')
  .description('List tags across profiles or for a specific profile')
  .argument('[name]', 'Profile name (optional)')
  .option('--json', 'Output as JSON')
  .action((name, opts) => {
    if (name) {
      const content = loadProfile(name);
      if (!content) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }

      const tags = parseTags(content);
      if (opts.json) {
        console.log(JSON.stringify(tags, null, 2));
        return;
      }
      if (!tags.length) { console.log(c.dim(`No tags on ${name}.`)); return; }
      console.log(c.bold(c.cyan(`Tags for ${name}:\n`)));
      for (const t of tags) console.log(`  - ${t}`);
      console.log();
    } else {
      const profiles = listProfiles();
      const counts = {};
      for (const p of profiles) {
        const content = loadProfile(p.slug);
        if (!content) continue;
        for (const t of parseTags(content)) {
          counts[t] = (counts[t] || 0) + 1;
        }
      }

      if (opts.json) {
        console.log(JSON.stringify(counts, null, 2));
        return;
      }

      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (!entries.length) { console.log(c.dim('No tags found across any profiles.')); return; }
      console.log(c.bold(c.cyan('All tags:\n')));
      for (const [tag, count] of entries) {
        console.log(`  ${tag.padEnd(30)} ${c.dim(`(${count})`)}`);
      }
      console.log();
    }
  });

// --- reset ---
program.command('reset')
  .description('Delete all profiles, config, and changelog data')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (opts) => {
    if (!opts.yes) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await rl.question(c.red('This will delete ALL profiles, config, and changelog. Are you sure? (type "yes") > '));
        if (answer.trim().toLowerCase() !== 'yes') {
          console.log('Aborted.');
          return;
        }
      } finally { rl.close(); }
    }

    const { CONFIG_DIR } = await import('../lib/config.js');
    const profilesDir = getProfilesDir();

    // Delete profiles
    if (fs.existsSync(profilesDir)) {
      const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.md'));
      for (const f of files) fs.unlinkSync(path.join(profilesDir, f));
      console.log(c.green(`  Deleted ${files.length} profile(s)`));
    }

    // Delete config and changelog
    if (fs.existsSync(CONFIG_DIR)) {
      const configFiles = fs.readdirSync(CONFIG_DIR);
      for (const f of configFiles) {
        const fp = path.join(CONFIG_DIR, f);
        if (fs.statSync(fp).isFile()) fs.unlinkSync(fp);
      }
      console.log(c.green('  Deleted config and changelog'));
    }

    // Delete generated web files
    const webDir = path.join(CONFIG_DIR, 'cards');
    if (fs.existsSync(webDir)) {
      const webFiles = fs.readdirSync(webDir).filter(f => f.endsWith('.html'));
      for (const f of webFiles) fs.unlinkSync(path.join(webDir, f));
      if (webFiles.length) console.log(c.green(`  Deleted ${webFiles.length} card page(s)`));
    }

    console.log(c.green('\nAll data cleared. Run "vip init" to start fresh.'));
  });

// --- annotate ---
program.command('annotate')
  .description('Add a personal annotation/comment to a profile')
  .argument('<name>', 'Profile name')
  .argument('<note...>', 'Your annotation')
  .action((name, noteParts) => {
    const content = loadProfile(name);
    if (!content) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }

    const note = noteParts.join(' ');
    const personSlug = slugify(name);
    const rawDir = path.join(getProfilesDir(), '.raw', personSlug);
    fs.mkdirSync(rawDir, { recursive: true });

    const annotationFile = path.join(rawDir, 'user_annotations.md');
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const entry = `\n- [${timestamp}] ${note}\n`;

    if (fs.existsSync(annotationFile)) {
      fs.appendFileSync(annotationFile, entry);
    } else {
      fs.writeFileSync(annotationFile, `# User Annotations for ${name}\n\nPersonal notes, observations, and meeting history.\n${entry}`);
    }

    // Also add to profile's Notes section
    const updatedContent = loadProfile(name);
    if (updatedContent) {
      let newContent;
      if (updatedContent.includes('## Notes')) {
        newContent = updatedContent.replace('## Notes\n', `## Notes\n- [${timestamp}] ${note}\n`);
      } else if (updatedContent.includes('\n---\n')) {
        newContent = updatedContent.replace('\n---\n', `\n## Notes\n- [${timestamp}] ${note}\n\n---\n`);
      } else {
        newContent = updatedContent.trimEnd() + `\n\n## Notes\n- [${timestamp}] ${note}\n`;
      }
      saveProfile(name, newContent);
    }

    console.log(c.green(`Annotation added to ${name}`));
    console.log(c.dim(`  Saved to: ${annotationFile}`));
  });

// --- upgrade ---
program.command('upgrade')
  .description('Update vipcare to the latest version')
  .action(() => {
    console.log(c.cyan(`Current version: ${pkg.version}`));
    console.log(c.dim('Checking for updates...'));
    try {
      const latest = execFileSync('npm', ['view', 'vipcare', 'version'], {
        encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      if (latest === pkg.version) {
        console.log(c.green(`Already up to date (${pkg.version}).`));
        return;
      }

      console.log(c.yellow(`New version available: ${latest}`));
      console.log(c.dim('Installing...'));
      execFileSync('npm', ['install', '-g', `vipcare@${latest}`], {
        stdio: 'inherit', timeout: 60000,
      });
      console.log(c.green(`Updated to ${latest}!`));
    } catch (e) {
      console.error(c.red(`Upgrade failed: ${e.message}`));
      console.log(c.dim('Try manually: npm install -g vipcare@latest'));
      process.exit(1);
    }
  });

// --- config ---
program.command('config')
  .description('View/edit settings')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const cfg = loadConfig();

    const toolStatus = {
      bird: checkTool('bird'),
      ddgs: (() => { try { execFileSync('python3', ['-c', 'import ddgs'], { stdio: 'ignore', timeout: 5000 }); return true; } catch { return checkTool('ddgs'); } })(),
      claude: checkTool('claude'),
      'yt-dlp': checkTool('yt-dlp'),
      whisper: (() => { try { execFileSync('python3', ['-c', 'import whisper'], { stdio: 'ignore', timeout: 5000 }); return true; } catch { return checkTool('whisper'); } })(),
      ai_backend: getBackendName(),
    };

    if (opts.json) {
      console.log(JSON.stringify({ ...cfg, tools: toolStatus }, null, 2));
      return;
    }
    console.log(c.bold(c.cyan('Current config:')));
    console.log(`  Profiles dir: ${cfg.profiles_dir}`);
    console.log(`  Monitor interval: ${cfg.monitor_interval_hours}h`);
    console.log();
    const ok = (v) => v ? c.green('available') : c.red('not found');
    console.log(`  Bird CLI:       ${ok(toolStatus.bird)}`);
    console.log(`  DDGS:           ${ok(toolStatus.ddgs)}`);
    console.log(`  Claude CLI:     ${ok(toolStatus.claude)}`);
    console.log(`  yt-dlp:         ${ok(toolStatus['yt-dlp'])}`);
    console.log(`  Whisper:        ${ok(toolStatus.whisper)}`);
    console.log(`  AI backend:     ${toolStatus.ai_backend !== 'none' ? c.green(toolStatus.ai_backend) : c.red('not found')}`);
  });

// --- init ---
program.command('init')
  .description('Interactive first-time setup for VIPCare')
  .action(async () => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    try {
      console.log(c.bold(c.cyan('\nWelcome to VIPCare!\n')));

      const defaultHome = path.join(os.homedir(), '.vip');
      const homeAnswer = await rl.question(`VIPCare home directory (all data stored here):\n  (default: ${defaultHome}) > `);
      const homeDir = (homeAnswer.trim() || defaultHome).replace(/^~/, os.homedir());

      const profilesDir = path.join(homeDir, 'profiles');

      console.log(`\n${c.cyan('AI backend preference:')}`);
      console.log('  1. Claude CLI (recommended)');
      console.log('  2. Anthropic API');
      console.log('  3. GitHub Copilot CLI');
      console.log('  4. Auto-detect');
      const backendAnswer = await rl.question('  (default: 1) > ');
      const backendChoice = backendAnswer.trim() || '1';

      const backendMap = { '1': 'claude-cli', '2': 'anthropic', '3': 'copilot-cli', '4': 'auto' };
      const aiBackend = backendMap[backendChoice] || 'claude-cli';

      const config = {
        profiles_dir: profilesDir.replace(/^~/, os.homedir()),
        ai_backend: aiBackend,
      };

      if (backendChoice === '2' || aiBackend === 'anthropic') {
        const apiKey = await rl.question('\nAnthropic API key: ');
        if (apiKey.trim()) {
          config.anthropic_api_key = apiKey.trim();
        }
      }

      // Merge with existing config to preserve other settings
      let existing = {};
      try {
        const { loadConfig: lc } = await import('../lib/config.js');
        existing = lc();
      } catch {}
      saveConfig({ ...existing, ...config });

      const { CONFIG_FILE: cfgPath } = await import('../lib/config.js');
      console.log(c.green(`\nConfig saved to ${cfgPath}`));

      // --- Check & install dependencies ---
      console.log(c.bold(c.cyan('\nChecking dependencies...\n')));

      const deps = [
        { name: 'bird', label: 'Bird CLI (Twitter data)', install: 'npm install -g @steipete/bird', check: () => checkTool('bird') },
        { name: 'ddgs', label: 'DDGS (web search)', install: 'pip3 install ddgs', check: () => {
          if (checkTool('ddgs')) return true;
          // Check common Python bin paths
          const pyDirs = fs.readdirSync(path.join(os.homedir(), 'Library', 'Python')).catch?.(() => []);
          try {
            for (const d of fs.readdirSync(path.join(os.homedir(), 'Library', 'Python'))) {
              if (fs.existsSync(path.join(os.homedir(), 'Library', 'Python', d, 'bin', 'ddgs'))) return true;
            }
          } catch {}
          try { execFileSync('python3', ['-c', 'import ddgs'], { stdio: 'ignore', timeout: 5000 }); return true; } catch {}
          return false;
        }},
        { name: 'claude', label: 'Claude Code CLI (AI synthesis)', install: 'npm install -g @anthropic-ai/claude-code', check: () => checkTool('claude') },
        { name: 'yt-dlp', label: 'yt-dlp (YouTube download)', install: 'pip3 install yt-dlp', check: () => checkTool('yt-dlp') },
        { name: 'whisper', label: 'Whisper (YouTube transcription)', install: 'pip3 install openai-whisper', check: () => {
          if (checkTool('whisper')) return true;
          try { execFileSync('python3', ['-c', 'import whisper'], { stdio: 'ignore', timeout: 5000 }); return true; } catch {}
          return false;
        }},
      ];

      const missing = [];
      for (const dep of deps) {
        const ok = dep.check();
        console.log(`  ${ok ? c.green('✓') : c.red('✗')} ${dep.label}`);
        if (!ok) missing.push(dep);
      }

      if (missing.length > 0) {
        console.log(`\n${c.yellow(`${missing.length} optional dependency(ies) not found.`)}`);
        const installAnswer = await rl.question('  Install missing dependencies? (Y/n) > ');
        if (!installAnswer.trim() || installAnswer.trim().toLowerCase().startsWith('y')) {
          for (const dep of missing) {
            console.log(c.dim(`  Installing ${dep.name}...`));
            try {
              const [cmd, ...args] = dep.install.split(' ');
              execFileSync(cmd, args, { stdio: 'inherit', timeout: 120000 });
              console.log(c.green(`  ✓ ${dep.name} installed`));
            } catch {
              console.log(c.yellow(`  ✗ Failed to install ${dep.name}. Install manually: ${dep.install}`));
            }
          }
        } else {
          console.log(c.dim('  Skipped. Install later with:'));
          for (const dep of missing) {
            console.log(c.dim(`    ${dep.install}`));
          }
        }
      } else {
        console.log(c.green('\n  All dependencies available!'));
      }

      // Install Claude Code skill by default
      const skillSrc = new URL('../skill/vip.md', import.meta.url);
      const skillDest = path.join(os.homedir(), '.claude', 'commands', 'vip.md');

      if (fs.existsSync(new URL(skillSrc).pathname)) {
        fs.mkdirSync(path.dirname(skillDest), { recursive: true });
        fs.copyFileSync(new URL(skillSrc).pathname, skillDest);
        console.log(c.green(`\n/vip skill installed: ${skillDest}`));
        console.log(c.dim('  Use /vip in Claude Code to manage profiles with natural language'));
      }

      console.log(`\nYou're ready! Try: ${c.cyan('vip add "Sam Altman" --company "OpenAI"')}\n`);
    } finally {
      rl.close();
    }
  });

// --- export ---
program.command('export')
  .description('Export all profiles as JSON')
  .option('-o, --output <file>', 'Write JSON to file instead of stdout')
  .action((opts) => {
    const profiles = listProfiles();
    if (!profiles.length) { console.error(c.red('No profiles to export.')); process.exit(1); }

    const exported = profiles.map(p => {
      const content = loadProfile(p.slug);
      const vipData = content ? extractVipData(content) : null;
      return {
        slug: p.slug,
        filePath: p.path,
        name: p.name,
        summary: p.summary,
        updated: p.updated,
        vipData: vipData || null,
        content: content || '',
        exportedAt: new Date().toISOString(),
      };
    });

    const json = JSON.stringify(exported, null, 2);

    if (opts.output) {
      fs.writeFileSync(opts.output, json, 'utf-8');
      console.log(c.green(`Exported ${exported.length} profile(s) to ${opts.output}`));
    } else {
      process.stdout.write(json + '\n');
    }
  });

// --- import ---
program.command('import')
  .description('Import profiles from a JSON export file')
  .argument('<file>', 'JSON file to import')
  .option('-f, --force', 'Overwrite existing profiles')
  .action((file, opts) => {
    if (!fs.existsSync(file)) { console.error(c.red(`File not found: ${file}`)); process.exit(1); }

    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      console.error(c.red(`Invalid JSON: ${e.message}`));
      process.exit(1);
    }

    if (!Array.isArray(data)) { console.error(c.red('Expected a JSON array of profiles.')); process.exit(1); }

    let imported = 0;
    let skipped = 0;
    for (const entry of data) {
      if (!entry.content || !entry.slug) {
        console.log(c.yellow(`  Skipping entry: missing content or slug`));
        skipped++;
        continue;
      }

      const name = entry.name || entry.slug;
      if (!opts.force && profileExists(name)) {
        console.log(c.yellow(`  Skipping '${name}': already exists (use -f to overwrite)`));
        skipped++;
        continue;
      }

      saveProfile(name, entry.content);
      imported++;
      console.log(c.green(`  Imported: ${name}`));
    }

    console.log(`\nDone: ${imported} imported, ${skipped} skipped.`);
  });

// --- stats ---
program.command('stats')
  .description('Show dashboard overview')
  .option('--json', 'Output as JSON')
  .action((opts) => {
    const profiles = listProfiles();
    const activity = readChangelog(7);
    const backend = getBackendName();
    const birdAvailable = checkTool('bird');

    // Find most recently updated profile
    let lastUpdated = null;
    let lastUpdatedName = null;
    for (const p of profiles) {
      if (!lastUpdated || p.updated > lastUpdated) {
        lastUpdated = p.updated;
        lastUpdatedName = p.name;
      }
    }

    if (opts.json) {
      const data = {
        profileCount: profiles.length,
        lastUpdated: lastUpdated ? { date: lastUpdated, name: lastUpdatedName } : null,
        aiBackend: backend,
        birdCli: birdAvailable ? 'available' : 'not found',
        recentActivity: activity.map(e => ({
          date: (e.timestamp || '').slice(0, 10),
          name: e.name,
          type: e.type,
          summary: e.summary,
        })),
      };
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log(c.bold(c.cyan('\nVIPCare Stats')));
    console.log('─'.repeat(15));
    console.log(`  Profiles:     ${c.green(String(profiles.length))}`);
    if (lastUpdated) {
      console.log(`  Last updated: ${c.green(lastUpdated)} (${lastUpdatedName})`);
    } else {
      console.log(`  Last updated: ${c.dim('n/a')}`);
    }
    console.log(`  AI backend:   ${backend !== 'none' ? c.green(backend) : c.dim('not found')}`);
    console.log(`  Bird CLI:     ${birdAvailable ? c.green('available') : c.dim('not found')}`);

    if (activity.length) {
      console.log(`\n  Recent activity (7 days):`);
      for (const e of activity) {
        const date = (e.timestamp || '').slice(0, 10);
        const label = e.summary || (e.type === 'created' ? 'Profile created' : 'Profile updated');
        console.log(`    [${date}] ${e.name} — ${label}`);
      }
    } else {
      console.log(`\n  ${c.dim('No recent activity (7 days)')}`);
    }
    console.log();
  });

// --- regenerate ---
program.command('regenerate')
  .description('Re-synthesize all profiles with current AI template')
  .option('--dry-run', 'Show what would be regenerated without doing it')
  .option('--no-ai', 'Skip AI synthesis (raw data only)')
  .action(async (opts) => {
    const profiles = listProfiles();
    if (!profiles.length) {
      console.log(c.dim('No profiles to regenerate. Use "vip add" to create one.'));
      return;
    }

    if (opts.dryRun) {
      console.log(c.cyan('Dry run — would regenerate:\n'));
      profiles.forEach((p, i) => {
        console.log(`  [${i + 1}/${profiles.length}] ${p.name}`);
      });
      console.log(`\n${profiles.length} profile(s) would be regenerated.`);
      return;
    }

    console.log(c.cyan('Regenerating all profiles with current template...'));
    let count = 0;

    for (let i = 0; i < profiles.length; i++) {
      const p = profiles[i];
      const prefix = `  [${i + 1}/${profiles.length}] ${p.name}`;
      const stop = spinner(`${prefix}...`);

      try {
        const content = loadProfile(p.slug);
        if (!content) {
          stop();
          console.log(`${prefix}... ${c.yellow('skipped (not found)')}`);
          continue;
        }

        const { extractMetadata } = await import('../lib/monitor.js');
        const meta = extractMetadata(content);
        const personName = meta.name || p.name;

        const person = resolveFromName(personName);
        if (meta.twitterHandle) person.twitterHandle = person.twitterHandle || meta.twitterHandle;
        if (meta.linkedinUrl) person.linkedinUrl = person.linkedinUrl || meta.linkedinUrl;

        const [rawData, sources] = gatherData(person);
        if (!rawData.trim()) {
          stop();
          console.log(`${prefix}... ${c.yellow('skipped (no data)')}`);
          continue;
        }

        let profile;
        if (opts.ai === false) {
          profile = `# ${personName}\n\n## Raw Data\n\n${rawData}`;
        } else {
          profile = await synthesizeProfile(rawData, sources);
        }

        saveProfile(personName, profile);
        stop();
        console.log(`${prefix}... ${c.green('done')}`);

        appendChangelog({
          timestamp: new Date().toISOString(),
          name: personName,
          slug: p.slug,
          type: 'updated',
          summary: `Profile regenerated with current template`,
        });

        count++;
      } catch (e) {
        stop();
        console.log(`${prefix}... ${c.red(`error: ${e.message}`)}`);
      }
    }

    console.log(`\n${count} profile(s) regenerated.`);
  });

program.parseAsync();
