import { search, searchPerson } from './fetchers/search.js';

const TWITTER_IGNORE = new Set(['search', 'explore', 'home', 'hashtag', 'i', 'settings', 'login']);

export function parseTwitterHandle(url) {
  const match = url.match(/(?:twitter\.com|x\.com)\/(@?\w+)/);
  if (match) {
    const handle = match[1].replace(/^@/, '');
    if (!TWITTER_IGNORE.has(handle.toLowerCase())) return handle;
  }
  return null;
}

export function parseLinkedinUrl(url) {
  if (!url.includes('linkedin.com/in/')) return null;
  const match = url.match(/(https?:\/\/[^/]*linkedin\.com\/in\/[^/?#]+)/);
  return match ? match[1] : null;
}

function linkedinMatchesPerson(snippetTitle, snippetBody, personName) {
  const parts = personName.toLowerCase().split(/\s+/);
  if (parts.length < 2) return true;
  const text = (snippetTitle + ' ' + snippetBody).toLowerCase();
  return text.includes(parts[0]) && text.includes(parts[parts.length - 1]);
}

function extractRealName(snippets, handle) {
  for (const snippet of snippets) {
    const re1 = new RegExp(`([A-Z][a-z]+ [A-Z][a-z]+(?:\\s[A-Z][a-z]+)?)\\s*(?:\\(|[-–—/|,])\\s*@?${handle}`, '');
    const m1 = snippet.match(re1);
    if (m1) return m1[1];

    const re2 = new RegExp(`@?${handle}\\s*(?:\\)|[-–—/|,])\\s*([A-Z][a-z]+ [A-Z][a-z]+)`, '');
    const m2 = snippet.match(re2);
    if (m2) return m2[1];
  }
  return null;
}

export function resolveFromUrl(url) {
  const person = { name: '', twitterHandle: null, linkedinUrl: null, otherUrls: [], rawSnippets: [] };

  const handle = parseTwitterHandle(url);
  if (handle) {
    person.twitterHandle = handle;

    const results = search(`@${handle} twitter`, 5);
    const snippets = results.map(r => `${r.title}\n${r.body}`);

    person.name = extractRealName(snippets, handle) || handle;
    person.rawSnippets = snippets;
    return person;
  }

  const linkedin = parseLinkedinUrl(url);
  if (linkedin) {
    person.linkedinUrl = linkedin;
    const match = linkedin.match(/\/in\/([^/?#]+)/);
    if (match) person.name = match[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return person;
  }

  person.otherUrls.push(url);
  return person;
}

export function resolveFromName(name, company) {
  const results = searchPerson(name, company);
  const person = { name, twitterHandle: null, linkedinUrl: null, otherUrls: [], rawSnippets: [] };

  for (const r of results) {
    if (!person.twitterHandle) {
      const handle = parseTwitterHandle(r.url);
      if (handle) person.twitterHandle = handle;
    }

    if (!person.linkedinUrl) {
      const linkedin = parseLinkedinUrl(r.url);
      if (linkedin && linkedinMatchesPerson(r.title, r.body, name)) {
        person.linkedinUrl = linkedin;
      }
    }

    if (!person.otherUrls.includes(r.url)) person.otherUrls.push(r.url);

    const snippet = `${r.title}\n${r.body}`;
    if (!person.rawSnippets.includes(snippet)) person.rawSnippets.push(snippet);
  }

  return person;
}

export function isUrl(text) {
  return /^(https?:\/\/|twitter\.com|x\.com|linkedin\.com)/.test(text);
}
