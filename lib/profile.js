import fs from 'fs';
import path from 'path';
import { getProfilesDir } from './config.js';

export function slugify(name) {
  let slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!slug) slug = 'unnamed';
  return slug;
}

export function validateName(name) {
  if (!name || typeof name !== 'string') return false;
  const slug = slugify(name);
  return slug !== 'unnamed' && slug.length > 0;
}

export function saveProfile(name, content, profilesDir) {
  const dir = profilesDir || getProfilesDir();
  const slug = slugify(name);
  const filepath = path.join(dir, `${slug}.md`);
  fs.writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

export function loadProfile(nameOrSlug, profilesDir) {
  const dir = profilesDir || getProfilesDir();
  const slug = slugify(nameOrSlug);
  const filepath = path.join(dir, `${slug}.md`);

  if (fs.existsSync(filepath)) {
    return fs.readFileSync(filepath, 'utf-8');
  }

  // Fuzzy match
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
  const matches = files.filter(f => f.replace('.md', '').includes(slug));
  if (matches.length === 1) {
    return fs.readFileSync(path.join(dir, matches[0]), 'utf-8');
  }

  return null;
}

export function listProfiles(profilesDir) {
  const dir = profilesDir || getProfilesDir();
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  return files.map(f => {
    const filepath = path.join(dir, f);
    const content = fs.readFileSync(filepath, 'utf-8');

    const nameMatch = content.match(/^# (.+)$/m);
    const name = nameMatch ? nameMatch[1] : f.replace('.md', '').replace(/-/g, ' ');

    const summaryMatch = content.match(/^> (.+)$/m);
    const summary = summaryMatch ? summaryMatch[1] : '';

    const stat = fs.statSync(filepath);
    const updated = stat.mtime.toISOString().slice(0, 10);

    return { slug: f.replace('.md', ''), name, summary, updated, path: filepath };
  });
}

export function searchProfiles(keyword, profilesDir) {
  const dir = profilesDir || getProfilesDir();
  if (!fs.existsSync(dir)) return [];
  const kw = keyword.toLowerCase();
  const results = [];

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  for (const f of files) {
    const content = fs.readFileSync(path.join(dir, f), 'utf-8');
    if (content.toLowerCase().includes(kw)) {
      const nameMatch = content.match(/^# (.+)$/m);
      const name = nameMatch ? nameMatch[1] : f.replace('.md', '');

      const matches = content.split('\n')
        .filter(line => line.toLowerCase().includes(kw))
        .slice(0, 3)
        .map(line => line.trim());

      results.push({ slug: f.replace('.md', ''), name, matches, path: path.join(dir, f) });
    }
  }

  return results;
}

export function profileExists(name, profilesDir) {
  const dir = profilesDir || getProfilesDir();
  return fs.existsSync(path.join(dir, `${slugify(name)}.md`));
}

export function getProfilePath(name, profilesDir) {
  const dir = profilesDir || getProfilesDir();
  return path.join(dir, `${slugify(name)}.md`);
}

export function deleteProfile(name, profilesDir) {
  const dir = profilesDir || getProfilesDir();
  const filepath = path.join(dir, `${slugify(name)}.md`);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
    return true;
  }
  return false;
}
