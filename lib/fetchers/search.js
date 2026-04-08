import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkTool } from '../config.js';

function findDdgs() {
  if (checkTool('ddgs')) return 'ddgs';

  const candidates = [
    path.join(os.homedir(), 'Library', 'Python', '3.9', 'bin', 'ddgs'),
    path.join(os.homedir(), 'Library', 'Python', '3.10', 'bin', 'ddgs'),
    path.join(os.homedir(), 'Library', 'Python', '3.11', 'bin', 'ddgs'),
    path.join(os.homedir(), 'Library', 'Python', '3.12', 'bin', 'ddgs'),
    path.join(os.homedir(), 'Library', 'Python', '3.13', 'bin', 'ddgs'),
    path.join(os.homedir(), '.local', 'bin', 'ddgs'),
    '/opt/homebrew/bin/ddgs',
    '/usr/local/bin/ddgs',
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

function searchViaDdgs(query, maxResults) {
  const ddgsPath = findDdgs();
  if (!ddgsPath) return null;

  try {
    const output = execFileSync(ddgsPath, ['text', query, '-m', String(maxResults), '-o', 'json'], {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const parsed = JSON.parse(output);
    if (!Array.isArray(parsed)) return null;
    return parsed.map(r => ({
      title: String(r.title || ''),
      url: String(r.href || r.url || ''),
      body: String(r.body || ''),
    }));
  } catch {
    return null;
  }
}

function searchViaDdgApi(query) {
  // DuckDuckGo Instant Answer API — always works, no bot detection
  try {
    const encoded = encodeURIComponent(query);
    const output = execFileSync('curl', [
      '-s', `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1`,
    ], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const data = JSON.parse(output);
    const results = [];

    // Main abstract
    if (data.Abstract) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL || '',
        body: data.Abstract,
      });
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (topic.Text && topic.FirstURL) {
          // Skip DDG category pages (e.g. duckduckgo.com/c/SpaceX_people)
          if (topic.FirstURL.includes('duckduckgo.com/c/')) continue;
          const title = topic.Text.substring(0, 80);
          // Skip entries where title and body are identical (just a category name)
          if (title === topic.Text && topic.Text.length < 20) continue;
          // Skip entries with body too short to be useful
          if (topic.Text.length < 20) continue;
          results.push({
            title,
            url: topic.FirstURL,
            body: topic.Text,
          });
        }
        // Subtopics
        if (topic.Topics) {
          for (const sub of topic.Topics) {
            if (sub.Text && sub.FirstURL) {
              // Skip DDG category pages
              if (sub.FirstURL.includes('duckduckgo.com/c/')) continue;
              const subTitle = sub.Text.substring(0, 80);
              // Skip entries where title and body are identical
              if (subTitle === sub.Text && sub.Text.length < 20) continue;
              // Skip entries with body too short to be useful
              if (sub.Text.length < 20) continue;
              results.push({
                title: subTitle,
                url: sub.FirstURL,
                body: sub.Text,
              });
            }
          }
        }
      }
    }

    // Infobox
    if (data.Infobox?.content) {
      for (const item of data.Infobox.content) {
        if (item.label && item.value) {
          results.push({
            title: `${item.label}: ${item.value}`,
            url: '',
            body: `${item.label}: ${item.value}`,
          });
        }
      }
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

function searchViaCurl(query, maxResults) {
  // Fallback: DuckDuckGo HTML search
  try {
    const encoded = encodeURIComponent(query);
    const output = execFileSync('curl', [
      '-s', '-L',
      `https://html.duckduckgo.com/html/?q=${encoded}`,
      '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    ], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const results = [];
    const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/a>/g;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([^<]*(?:<[^>]+>[^<]*)*)<\/a>/g;

    let match;
    while ((match = resultRegex.exec(output)) && results.length < maxResults) {
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      let url = match[1];
      const uddg = url.match(/uddg=([^&]+)/);
      if (uddg) url = decodeURIComponent(uddg[1]);
      results.push({ title, url, body: '' });
    }

    let i = 0;
    while ((match = snippetRegex.exec(output)) && i < results.length) {
      results[i].body = match[1].replace(/<[^>]+>/g, '').trim();
      i++;
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

export function search(query, maxResults = 5) {
  // Try ddgs CLI first (best results)
  const ddgsResults = searchViaDdgs(query, maxResults);
  if (ddgsResults?.length) return ddgsResults;

  // Try DDG Instant Answer API (always works, but limited)
  const apiResults = searchViaDdgApi(query);
  if (apiResults?.length) return apiResults;

  // Last resort: DDG HTML (may be blocked by CAPTCHA)
  const curlResults = searchViaCurl(query, maxResults);
  if (curlResults?.length) return curlResults;

  return [];
}

export function searchPerson(name, company) {
  const queries = [`"${name}"`];
  if (company) queries.push(`"${name}" "${company}"`);
  queries.push(`"${name}" site:twitter.com OR site:x.com`);
  queries.push(`"${name}" site:linkedin.com/in`);

  const allResults = [];
  const seenUrls = new Set();

  for (const q of queries) {
    for (const r of search(q, 5)) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        allResults.push(r);
      }
    }
  }

  return allResults;
}
