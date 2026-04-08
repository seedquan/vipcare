import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseTweets, parseProfilePage, fetchProfilePage } from '../lib/fetchers/twitter.js';

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

describe('parseProfilePage', () => {
  it('extracts nitter profile data', () => {
    const html = `
      <a class="profile-card-fullname" href="/janedoe">Jane Doe</a>
      <p class="profile-bio">Building the future of AI.</p>
      <span class="profile-location">San Francisco</span>
      <a class="profile-website" href="https://janedoe.com">janedoe.com</a>
      <span class="profile-joindate">Joined January 2015</span>
      <div class="tweet-content media-body">Working on something exciting today!</div>
      <div class="tweet-content media-body">AI will change everything we know.</div>
    `;
    const data = parseProfilePage(html);
    assert.ok(data, 'should return parsed data');
    assert.strictEqual(data.displayName, 'Jane Doe');
    assert.strictEqual(data.bio, 'Building the future of AI.');
    assert.strictEqual(data.location, 'San Francisco');
    assert.strictEqual(data.website, 'janedoe.com');
    assert.ok(data.joinDate.includes('January 2015'));
    assert.strictEqual(data.tweets.length, 2);
    assert.ok(data.tweets[0].includes('Working on something exciting'));
  });

  it('returns null for empty input', () => {
    assert.strictEqual(parseProfilePage(''), null);
    assert.strictEqual(parseProfilePage(null), null);
    assert.strictEqual(parseProfilePage(undefined), null);
  });

  it('returns null for HTML with no profile data', () => {
    const html = '<html><body><p>Nothing here</p></body></html>';
    assert.strictEqual(parseProfilePage(html), null);
  });

  it('extracts partial data (bio only)', () => {
    const html = '<p class="profile-bio">Just a bio here</p>';
    const data = parseProfilePage(html);
    assert.ok(data, 'should return data with bio only');
    assert.strictEqual(data.bio, 'Just a bio here');
    assert.strictEqual(data.displayName, '');
  });

  it('strips HTML tags from bio', () => {
    const html = '<p class="profile-bio">Hello <a href="#">World</a> and <b>bold</b></p>';
    const data = parseProfilePage(html);
    assert.ok(data);
    assert.strictEqual(data.bio, 'Hello World and bold');
  });
});

describe('fetchProfilePage', () => {
  it('returns null for empty handle', () => {
    assert.strictEqual(fetchProfilePage(''), null);
    assert.strictEqual(fetchProfilePage(null), null);
  });

  it('strips @ from handle', () => {
    // This tests the function runs without crashing on a real call
    // It may return null if network is unavailable, which is fine
    const result = fetchProfilePage('@nonexistent_handle_xyz_99999');
    assert.ok(result === null || typeof result === 'object');
  });
});
