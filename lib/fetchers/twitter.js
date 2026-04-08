import { execFileSync } from 'child_process';
import { checkTool } from '../config.js';

export function isAvailable() {
  return checkTool('bird');
}

export function parseTweets(output) {
  const tweets = [];
  let current = [];

  for (const line of output.split('\n')) {
    const stripped = line.trim();

    if (/^[─━═]+$/.test(stripped) || !stripped) {
      if (current.length) {
        const text = current.join(' ').trim();
        if (text.length > 5) tweets.push(text);
        current = [];
      }
      continue;
    }

    if (/^\d+ (retweets?|likes?|replies|views)/i.test(stripped)) continue;
    if (/^\d{4}-\d{2}-\d{2}/.test(stripped)) continue;

    current.push(stripped);
  }

  if (current.length) {
    const text = current.join(' ').trim();
    if (text.length > 5) tweets.push(text);
  }

  return tweets;
}

export function parseProfilePage(html) {
  if (!html || typeof html !== 'string') return null;

  const data = { displayName: '', bio: '', location: '', website: '', joinDate: '', tweets: [] };

  // Nitter format
  const nameMatch = html.match(/<a[^>]*class="profile-card-fullname"[^>]*>([^<]+)/);
  if (nameMatch) data.displayName = nameMatch[1].trim();

  const bioMatch = html.match(/<p[^>]*class="profile-bio"[^>]*>([\s\S]*?)<\/p>/);
  if (bioMatch) data.bio = bioMatch[1].replace(/<[^>]+>/g, '').trim();

  const locMatch = html.match(/<span[^>]*class="profile-location"[^>]*>([\s\S]*?)<\/span>/);
  if (locMatch) data.location = locMatch[1].replace(/<[^>]+>/g, '').trim();

  const webMatch = html.match(/<a[^>]*class="profile-website"[^>]*[^>]*>([\s\S]*?)<\/a>/);
  if (webMatch) data.website = webMatch[1].replace(/<[^>]+>/g, '').trim();

  const joinMatch = html.match(/<span[^>]*class="profile-joindate"[^>]*>([\s\S]*?)<\/span>/);
  if (joinMatch) data.joinDate = joinMatch[1].replace(/<[^>]+>/g, '').trim();

  // Extract tweet text from nitter timeline items
  const tweetMatches = html.matchAll(/<div[^>]*class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/g);
  for (const m of tweetMatches) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 5) data.tweets.push(text);
  }

  // Syndication format fallback — different HTML structure
  if (!data.displayName) {
    const synNameMatch = html.match(/<div[^>]*data-testid="UserName"[^>]*>[\s\S]*?<span[^>]*>([^<]+)/);
    if (synNameMatch) data.displayName = synNameMatch[1].trim();
  }
  if (!data.bio) {
    const synBioMatch = html.match(/<div[^>]*data-testid="UserDescription"[^>]*>([\s\S]*?)<\/div>/);
    if (synBioMatch) data.bio = synBioMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  // Only return if we got at least something useful
  const hasContent = data.displayName || data.bio || data.tweets.length > 0;
  return hasContent ? data : null;
}

export function fetchProfilePage(handle) {
  if (!handle) return null;
  handle = handle.replace(/^@/, '');

  // Try nitter.net first (public Twitter frontend)
  try {
    const output = execFileSync('curl', [
      '-s', '-L',
      `https://nitter.net/${handle}`,
      '-H', 'User-Agent: Mozilla/5.0'
    ], { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });

    const parsed = parseProfilePage(output);
    if (parsed) return parsed;
  } catch {
    // nitter failed, try syndication
  }

  // Fallback: Twitter syndication API
  try {
    const output = execFileSync('curl', [
      '-s', '-L',
      `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`,
      '-H', 'User-Agent: Mozilla/5.0'
    ], { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] });

    const parsed = parseProfilePage(output);
    if (parsed) return parsed;
  } catch {
    // syndication also failed
  }

  return null;
}

export function fetchProfile(handle) {
  if (!isAvailable()) return null;

  handle = handle.replace(/^@/, '');
  const data = { handle, bio: '', displayName: '', tweets: [], rawOutput: '' };

  try {
    const output = execFileSync('bird', ['search', `from:${handle}`, '--count', '10'], {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (output.trim()) {
      data.rawOutput = output;
      data.tweets = parseTweets(output);
    }
  } catch {
    // timeout or not found
  }

  return data;
}

