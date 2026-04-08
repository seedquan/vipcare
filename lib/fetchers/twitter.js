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

