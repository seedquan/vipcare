import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTwitterHandle, parseLinkedinUrl, isUrl, resolveFromUrl } from '../lib/resolver.js';

describe('parseTwitterHandle', () => {
  it('twitter.com', () => assert.strictEqual(parseTwitterHandle('https://twitter.com/elonmusk'), 'elonmusk'));
  it('x.com', () => assert.strictEqual(parseTwitterHandle('https://x.com/sama'), 'sama'));
  it('with @', () => assert.strictEqual(parseTwitterHandle('https://twitter.com/@test'), 'test'));
  it('ignores search', () => assert.strictEqual(parseTwitterHandle('https://twitter.com/search'), null));
  it('ignores explore', () => assert.strictEqual(parseTwitterHandle('https://twitter.com/explore'), null));
  it('no match', () => assert.strictEqual(parseTwitterHandle('https://example.com'), null));
});

describe('parseLinkedinUrl', () => {
  it('valid profile', () => {
    assert.strictEqual(parseLinkedinUrl('https://www.linkedin.com/in/samaltman'), 'https://www.linkedin.com/in/samaltman');
  });
  it('with params', () => {
    assert.strictEqual(parseLinkedinUrl('https://linkedin.com/in/samaltman?trk=x'), 'https://linkedin.com/in/samaltman');
  });
  it('not profile', () => {
    assert.strictEqual(parseLinkedinUrl('https://linkedin.com/company/openai'), null);
  });
});

describe('isUrl', () => {
  it('https', () => assert.ok(isUrl('https://twitter.com/test')));
  it('http', () => assert.ok(isUrl('http://example.com')));
  it('twitter.com', () => assert.ok(isUrl('twitter.com/test')));
  it('not url', () => assert.ok(!isUrl('Sam Altman')));
  it('email not url', () => assert.ok(!isUrl('test@email.com')));
});

describe('resolveFromUrl', () => {
  it('unknown URL', () => {
    const p = resolveFromUrl('https://example.com/unknown');
    assert.strictEqual(p.name, '');
    assert.strictEqual(p.otherUrls.length, 1);
  });
});
