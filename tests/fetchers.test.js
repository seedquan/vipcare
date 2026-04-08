import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTweets } from '../lib/fetchers/twitter.js';

describe('parseTweets', () => {
  it('filters separators and metadata', () => {
    const output = 'Hello world tweet\n─────────\n2024-01-01\n5 likes\nAnother tweet here\n';
    const tweets = parseTweets(output);
    assert.ok(tweets.includes('Hello world tweet'));
    assert.ok(tweets.includes('Another tweet here'));
    assert.strictEqual(tweets.length, 2);
  });

  it('empty input', () => {
    assert.deepStrictEqual(parseTweets(''), []);
  });

  it('short lines ignored', () => {
    assert.deepStrictEqual(parseTweets('hi\n'), []);
  });
});
