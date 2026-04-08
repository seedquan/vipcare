#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import { checkTool, getProfilesDir, loadConfig, saveConfig } from '../lib/config.js';
import { deleteProfile, getProfilePath, listProfiles, loadProfile, profileExists, saveProfile, searchProfiles } from '../lib/profile.js';
import { isUrl, resolveFromName, resolveFromUrl } from '../lib/resolver.js';
import * as twitter from '../lib/fetchers/twitter.js';
import { searchPerson } from '../lib/fetchers/search.js';
import { synthesizeProfile, getBackendName } from '../lib/synthesizer.js';
import { readChangelog, runMonitor, unreadCount } from '../lib/monitor.js';
import { install, uninstall, status } from '../lib/scheduler.js';
import * as youtube from '../lib/fetchers/youtube.js';
import { generateCards } from '../lib/card.js';

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

function gatherData(person) {
  const rawParts = [];
  const sources = [];

  if (person.twitterHandle) {
    console.log(c.dim(`  Fetching Twitter @${person.twitterHandle}...`));
    const data = twitter.fetchProfile(person.twitterHandle);
    if (data?.rawOutput) {
      rawParts.push(`=== Twitter (@${person.twitterHandle}) ===\n${data.rawOutput}`);
      sources.push(`https://twitter.com/${person.twitterHandle}`);
    } else if (!twitter.isAvailable()) {
      console.log(c.yellow('  (bird CLI not found, skipping Twitter)'));
    }
  }

  if (person.linkedinUrl) sources.push(person.linkedinUrl);

  if (person.rawSnippets.length) {
    rawParts.push('=== Web Search Results ===');
    rawParts.push(...person.rawSnippets);
  }

  if (rawParts.length < 2 && person.name) {
    console.log(c.dim(`  Searching the web for ${person.name}...`));
    const results = searchPerson(person.name);
    for (const r of results) {
      rawParts.push(`${r.title}\n${r.body}`);
      if (!sources.includes(r.url)) sources.push(r.url);
    }
  }

  return [rawParts.join('\n\n'), sources];
}

// Show unread count
try {
  const count = unreadCount();
  if (count > 0) console.log(c.yellow(`[${count} new change(s) - run 'vip digest' to view]`));
} catch {}

const program = new Command();
program.name('vip').description('VIP Profile Builder - Auto-build VIP person profiles from public data').version('0.1.0');

// --- add ---
program.command('add')
  .description('Add a new VIP profile')
  .argument('<query>', 'Name or URL')
  .option('-c, --company <company>', 'Company name')
  .option('--dry-run', 'Print without saving')
  .option('--no-ai', 'Skip AI synthesis')
  .option('-f, --force', 'Overwrite existing')
  .option('-y, --youtube <urls...>', 'YouTube video URLs to transcribe')
  .action(async (query, opts) => {
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
      } finally { stop(); }
    }

    if (opts.dryRun) {
      console.log('\n' + '='.repeat(60));
      console.log(profile);
    } else {
      const filepath = saveProfile(person.name, profile);
      console.log(c.green(`\nProfile saved: ${filepath}`));
    }
  });

// --- list ---
program.command('list')
  .description('List all VIP profiles')
  .action(() => {
    const profiles = listProfiles();
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
  .action((name) => {
    const content = loadProfile(name);
    if (!content) { console.error(c.red(`Profile not found: ${name}`)); process.exit(1); }

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
  .action((keyword) => {
    const results = searchProfiles(keyword);
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
      try { profile = await synthesizeProfile(rawData, sources); } finally { stop2(); }
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
      if (content.includes('## Notes')) {
        content = content.replace('## Notes\n', `## Notes\n- ${opts.note}\n`);
      } else if (content.includes('\n---\n')) {
        content = content.replace('\n---\n', `\n## Notes\n- ${opts.note}\n\n---\n`);
      } else {
        content = content.trimEnd() + `\n\n## Notes\n- ${opts.note}\n`;
      }
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
  .action(async (name, url) => {
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

    const stop2 = spinner('Re-synthesizing profile...');
    let profile;
    try { profile = await synthesizeProfile(rawData, sources); } finally { stop2(); }

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
  .description('Generate H5 baseball card page from all profiles')
  .option('-o, --output <path>', 'Output HTML file', 'web/index.html')
  .action((opts) => {
    console.log(c.cyan('Generating baseball cards...'));
    const profiles = listProfiles();
    if (!profiles.length) { console.log(c.dim('No profiles. Use "vip add" first.')); return; }

    const outputPath = generateCards(profiles, opts.output);
    console.log(c.green(`Cards generated: ${outputPath}`));
    console.log(c.dim(`Open in browser: open ${outputPath}`));
  });

// --- digest ---
program.command('digest')
  .description('Show recent changes')
  .action(() => {
    const entries = readChangelog(30);
    if (!entries.length) { console.log(c.dim('No recent changes.')); return; }

    console.log(c.bold(c.cyan('Changes in the last 30 days:\n')));
    for (const e of entries.reverse()) {
      console.log(c.green(`  [${(e.timestamp || '').slice(0, 10)}] ${e.name}`));
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

// --- config ---
program.command('config')
  .description('View/edit settings')
  .action(() => {
    const cfg = loadConfig();
    console.log(c.bold(c.cyan('Current config:')));
    console.log(`  Profiles dir: ${cfg.profiles_dir}`);
    console.log(`  Monitor interval: ${cfg.monitor_interval_hours}h`);
    console.log(`  Bird CLI: ${checkTool('bird') ? c.green('available') : c.red('not found')}`);
    console.log(`  AI backend: ${(() => { const b = getBackendName(); return b !== 'none' ? c.green(b) : c.red('not found'); })()}`);
  });

program.parseAsync();
