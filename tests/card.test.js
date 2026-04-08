import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractVipData } from '../lib/card.js';

describe('card', () => {
  it('extracts VIP_DATA from markdown', () => {
    const content = `# Test Person\n\nSome content\n\n<!-- VIP_DATA\n{"name":"Test","disc":"D","mbti":"ENTJ","scores":{"openness":4},"tags":["AI"]}\n-->`;
    const data = extractVipData(content);
    assert.strictEqual(data.name, 'Test');
    assert.strictEqual(data.disc, 'D');
    assert.strictEqual(data.scores.openness, 4);
  });

  it('returns null for no VIP_DATA', () => {
    assert.strictEqual(extractVipData('# Test\nNo data here'), null);
  });

  it('returns null for invalid JSON', () => {
    const content = '<!-- VIP_DATA\n{invalid json}\n-->';
    assert.strictEqual(extractVipData(content), null);
  });
});
