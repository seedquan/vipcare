import { execSync } from 'child_process';
import { checkTool } from '../config.js';

export function search(query, maxResults = 5) {
  // Use ddgs CLI (installed via npm or pip)
  if (checkTool('ddgs')) {
    try {
      const output = execSync(
        `ddgs text "${query.replace(/"/g, '\\"')}" -m ${maxResults} -o json`,
        { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
      );

      const results = JSON.parse(output);
      return results.map(r => ({
        title: r.title || '',
        url: r.href || r.url || '',
        body: r.body || '',
      }));
    } catch {
      // fall through
    }
  }

  // Fallback: use curl with DuckDuckGo lite
  try {
    const encoded = encodeURIComponent(query);
    const output = execSync(
      `curl -s "https://lite.duckduckgo.com/lite/?q=${encoded}" -H "User-Agent: VIPCare/0.1"`,
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    );

    // Basic parsing of DDG lite HTML results
    const results = [];
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*class="result-link"[^>]*>([^<]+)<\/a>/g;
    const snippetRegex = /<td class="result-snippet">([^<]+)<\/td>/g;

    let match;
    while ((match = linkRegex.exec(output)) && results.length < maxResults) {
      results.push({ title: match[2].trim(), url: match[1], body: '' });
    }

    let i = 0;
    while ((match = snippetRegex.exec(output)) && i < results.length) {
      results[i].body = match[1].trim();
      i++;
    }

    return results;
  } catch {
    return [];
  }
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
