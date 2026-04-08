import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { extractMetadata } from '../lib/monitor.js';

describe('extractMetadata', () => {
  it('extracts twitter', () => {
    const meta = extractMetadata('# Test\n\n- Twitter: https://twitter.com/testuser\n');
    assert.strictEqual(meta.twitterHandle, 'testuser');
    assert.strictEqual(meta.name, 'Test');
  });

  it('extracts x.com', () => {
    const meta = extractMetadata('# Test\n\n- Twitter: https://x.com/testuser\n');
    assert.strictEqual(meta.twitterHandle, 'testuser');
  });

  it('extracts linkedin', () => {
    const meta = extractMetadata('# Test\n\n- LinkedIn: https://linkedin.com/in/test-user\n');
    assert.strictEqual(meta.linkedinUrl, 'https://linkedin.com/in/test-user');
  });

  it('handles empty', () => {
    const meta = extractMetadata('No links here');
    assert.strictEqual(meta.twitterHandle, null);
    assert.strictEqual(meta.linkedinUrl, null);
    assert.strictEqual(meta.name, null);
  });
});
