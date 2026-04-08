import { describe, it, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import _realFs from 'fs';

// Save original fs functions before mocking
const originalExistsSync = _realFs.existsSync.bind(_realFs);
const originalReadFileSync = _realFs.readFileSync.bind(_realFs);
const originalWriteFileSync = _realFs.writeFileSync.bind(_realFs);
const originalMkdirSync = _realFs.mkdirSync.bind(_realFs);

// Set up mocks at module level, before any imports of search.js
const execFileSyncMock = mock.fn(() => { throw new Error('not found'); });
const existsSyncMock = mock.fn((...args) => originalExistsSync(...args));

mock.module('child_process', {
  namedExports: {
    execFileSync: execFileSyncMock,
  },
});

mock.module('fs', {
  defaultExport: {
    existsSync: (...args) => existsSyncMock(...args),
    readFileSync: (...args) => originalReadFileSync(...args),
    writeFileSync: (...args) => originalWriteFileSync(...args),
    mkdirSync: (...args) => originalMkdirSync(...args),
  },
});

// Now import the modules that depend on child_process and fs
const { search, searchPerson } = await import('../lib/fetchers/search.js');

describe('search', () => {
  beforeEach(() => {
    // Reset mock to default (throw) before each test
    execFileSyncMock.mock.resetCalls();
    execFileSyncMock.mock.mockImplementation(() => { throw new Error('not found'); });
    // Restore original existsSync before each test
    existsSyncMock.mock.resetCalls();
    existsSyncMock.mock.mockImplementation((...args) => originalExistsSync(...args));
  });

  describe('search()', () => {
    it('returns empty array on failure when execFileSync throws', () => {
      const results = search('test query');
      assert.ok(Array.isArray(results), 'should return an array');
      assert.strictEqual(results.length, 0, 'should return empty array on failure');
    });

    it('parses ddgs JSON output correctly', () => {
      const fakeResults = [
        { title: 'Result 1', href: 'https://example.com/1', body: 'Body 1' },
        { title: 'Result 2', href: 'https://example.com/2', body: 'Body 2' },
      ];

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'ddgs') return '/usr/local/bin/ddgs';
        if (cmd === 'ddgs') return JSON.stringify(fakeResults);
        throw new Error('not found');
      });

      const results = search('test query', 5);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].title, 'Result 1');
      assert.strictEqual(results[0].url, 'https://example.com/1');
      assert.strictEqual(results[0].body, 'Body 1');
      assert.strictEqual(results[1].title, 'Result 2');
      assert.strictEqual(results[1].url, 'https://example.com/2');
    });

    it('handles ddgs returning non-array JSON', () => {
      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'ddgs') return '/usr/local/bin/ddgs';
        if (cmd === 'ddgs') return '{"error": "no results"}';
        throw new Error('failed');
      });

      const results = search('test query');
      assert.ok(Array.isArray(results), 'should return an array');
    });

    it('falls back to curl when ddgs not available', () => {
      // Ensure findDdgs() returns null: mock both `which ddgs` and fs.existsSync for ddgs paths
      existsSyncMock.mock.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('ddgs')) return false;
        return originalExistsSync(p);
      });

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'ddgs') throw new Error('not found');
        if (cmd === 'which') return '/usr/bin/' + args[0];
        if (cmd === 'curl') {
          // DDG Instant Answer API returns JSON with an abstract result
          return JSON.stringify({
            Heading: 'Example',
            Abstract: 'A snippet',
            AbstractURL: 'https://example.com',
          });
        }
        throw new Error('not found');
      });

      const results = search('test query');
      assert.ok(Array.isArray(results));
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Example');
      assert.strictEqual(results[0].url, 'https://example.com');
      assert.strictEqual(results[0].body, 'A snippet');
    });

    it('respects maxResults parameter for ddgs', () => {
      let capturedArgs;
      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'ddgs') return '/usr/local/bin/ddgs';
        if (cmd === 'ddgs') {
          capturedArgs = args;
          return '[]';
        }
        throw new Error('not found');
      });

      search('test', 3);
      assert.ok(capturedArgs.includes('3'), 'should pass maxResults to ddgs -m flag');
    });
  });

  describe('searchPerson()', () => {
    it('deduplicates URLs', () => {
      const fakeResult = { title: 'Duplicate', href: 'https://example.com/same', body: 'body' };

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'ddgs') return '/usr/local/bin/ddgs';
        if (cmd === 'ddgs') return JSON.stringify([fakeResult]);
        throw new Error('not found');
      });

      const results = searchPerson('John Doe');
      const urls = results.map(r => r.url);
      const uniqueUrls = [...new Set(urls)];
      assert.strictEqual(urls.length, uniqueUrls.length, 'should not have duplicate URLs');
      assert.strictEqual(results.length, 1, 'same URL from multiple queries should appear once');
    });

    it('builds correct queries without company', () => {
      const capturedQueries = [];

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'ddgs') return '/usr/local/bin/ddgs';
        if (cmd === 'ddgs') {
          capturedQueries.push(args[1]);
          return '[]';
        }
        throw new Error('not found');
      });

      searchPerson('John Doe');

      assert.ok(capturedQueries.some(q => q === '"John Doe"'), 'should search for quoted name');
      assert.ok(capturedQueries.some(q => q.includes('site:twitter.com') || q.includes('site:x.com')),
        'should search twitter');
      assert.ok(capturedQueries.some(q => q.includes('site:linkedin.com/in')), 'should search linkedin');
      assert.strictEqual(capturedQueries.length, 3, 'should make 3 queries without company');
    });

    it('builds correct queries with company', () => {
      const capturedQueries = [];

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'ddgs') return '/usr/local/bin/ddgs';
        if (cmd === 'ddgs') {
          capturedQueries.push(args[1]);
          return '[]';
        }
        throw new Error('not found');
      });

      searchPerson('John Doe', 'Acme Corp');

      assert.ok(capturedQueries.some(q => q === '"John Doe"'), 'should search for quoted name');
      assert.ok(capturedQueries.some(q => q === '"John Doe" "Acme Corp"'),
        'should include company-specific query');
      assert.ok(capturedQueries.some(q => q.includes('site:linkedin.com/in')), 'should search linkedin');
      assert.strictEqual(capturedQueries.length, 4, 'should make 4 queries with company');
    });

    it('aggregates results from multiple queries', () => {
      let callCount = 0;

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'ddgs') return '/usr/local/bin/ddgs';
        if (cmd === 'ddgs') {
          callCount++;
          return JSON.stringify([
            { title: `Result ${callCount}`, href: `https://example.com/${callCount}`, body: `Body ${callCount}` },
          ]);
        }
        throw new Error('not found');
      });

      const results = searchPerson('Jane Smith');
      assert.strictEqual(results.length, 3, 'should aggregate results from all 3 queries');
    });
  });
});
