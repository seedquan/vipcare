import fs from 'fs';
import { CHANGELOG_FILE, getProfilesDir } from './config.js';
import { searchPerson } from './fetchers/search.js';
import * as twitter from './fetchers/twitter.js';
import { listProfiles, loadProfile, saveProfile } from './profile.js';
import { synthesizeProfile, detectChanges } from './synthesizer.js';

export function extractMetadata(content) {
  const meta = { twitterHandle: null, linkedinUrl: null, name: null };

  const nameMatch = content.match(/^# (.+)$/m);
  if (nameMatch) meta.name = nameMatch[1];

  let twMatch = content.match(/twitter\.com\/(\w+)/i);
  if (!twMatch) twMatch = content.match(/x\.com\/(\w+)/i);
  if (twMatch) meta.twitterHandle = twMatch[1];

  const liMatch = content.match(/(https?:\/\/[^/]*linkedin\.com\/in\/[^\s)]+)/);
  if (liMatch) meta.linkedinUrl = liMatch[1];

  return meta;
}

function gatherFreshData(meta) {
  const rawParts = [];
  const sources = [];

  if (meta.twitterHandle) {
    const data = twitter.fetchProfile(meta.twitterHandle);
    if (data?.rawOutput) {
      rawParts.push(`=== Twitter (@${meta.twitterHandle}) ===\n${data.rawOutput}`);
      sources.push(`https://twitter.com/${meta.twitterHandle}`);
    }
  }

  if (meta.name) {
    const results = searchPerson(meta.name);
    for (const r of results) {
      rawParts.push(`${r.title}\n${r.body}`);
      sources.push(r.url);
    }
  }

  return [rawParts.join('\n\n'), sources];
}

export function appendChangelog(entry) {
  const dir = CHANGELOG_FILE.substring(0, CHANGELOG_FILE.lastIndexOf('/'));
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(CHANGELOG_FILE, JSON.stringify(entry) + '\n');
}

export function readChangelog(days = 30) {
  if (!fs.existsSync(CHANGELOG_FILE)) return [];

  const cutoff = Date.now() - days * 86400000;
  const lines = fs.readFileSync(CHANGELOG_FILE, 'utf-8').split('\n').filter(Boolean);

  return lines
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(e => e && new Date(e.timestamp).getTime() >= cutoff);
}

export function unreadCount() {
  return readChangelog(7).length;
}

export async function runMonitor(profilesDir, verbose = false) {
  const dir = profilesDir || getProfilesDir();
  const changes = [];
  const profiles = listProfiles(dir);

  for (const p of profiles) {
    if (verbose) console.log(`  Checking ${p.name}...`);

    const oldContent = loadProfile(p.slug, dir);
    if (!oldContent) continue;

    const meta = extractMetadata(oldContent);
    const [newData, sources] = gatherFreshData(meta);

    if (!newData.trim()) {
      if (verbose) console.log('    No new data found, skipping.');
      continue;
    }

    const changeSummary = await detectChanges(oldContent, newData);

    if (changeSummary) {
      const newProfile = await synthesizeProfile(newData, sources);
      saveProfile(p.name, newProfile, dir);

      const entry = {
        timestamp: new Date().toISOString(),
        name: p.name,
        slug: p.slug,
        summary: changeSummary,
      };
      appendChangelog(entry);
      changes.push(entry);

      if (verbose) console.log(`    Changes detected: ${changeSummary}`);
    } else if (verbose) {
      console.log('    No significant changes.');
    }
  }

  return changes;
}
