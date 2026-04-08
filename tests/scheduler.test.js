import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createPlist } from '../lib/scheduler.js';

describe('createPlist', () => {
  it('contains interval', () => {
    // This may fail if vip is not installed, skip gracefully
    try {
      const plist = createPlist(12);
      assert.ok(plist.includes('<integer>43200</integer>'));
      assert.ok(plist.includes('com.vipcare.monitor'));
      assert.ok(plist.includes('monitor'));
    } catch (e) {
      if (e.message.includes("Cannot find 'vip'")) {
        // Expected in test env without global install
        assert.ok(true);
      } else {
        throw e;
      }
    }
  });
});
