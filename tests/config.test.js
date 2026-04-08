import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

// config.js uses hardcoded paths, so we test the functions that accept
// or work with the filesystem. For loadConfig/saveConfig we test the
// actual config directory behavior. For checkTool we test real tools.

// We import the individual exported functions.
import { checkTool } from '../lib/config.js';

describe('config', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vip-config-test-'));
  });

  describe('loadConfig()', () => {
    it('creates default config when none exists', async () => {
      // We test by importing and calling — config.js creates ~/.vip-crm/config.json
      const { loadConfig, CONFIG_DIR, CONFIG_FILE } = await import('../lib/config.js');
      const config = loadConfig();

      // Should return an object with default keys
      assert.ok(config, 'should return a config object');
      assert.ok('profiles_dir' in config, 'should have profiles_dir');
      assert.ok('monitor_interval_hours' in config, 'should have monitor_interval_hours');
      assert.strictEqual(typeof config.profiles_dir, 'string');
      assert.strictEqual(typeof config.monitor_interval_hours, 'number');

      // Config dir should exist
      assert.ok(fs.existsSync(CONFIG_DIR), 'config dir should exist');
    });

    it('reads existing config file', async () => {
      const { loadConfig, saveConfig, CONFIG_FILE } = await import('../lib/config.js');

      // Write a custom config
      saveConfig({ profiles_dir: '/tmp/custom-profiles', monitor_interval_hours: 48, custom_key: 'test' });

      const config = loadConfig();
      assert.strictEqual(config.custom_key, 'test', 'should read custom key from saved config');
      assert.strictEqual(config.monitor_interval_hours, 48, 'should read custom interval');
    });

    it('merges defaults with saved config', async () => {
      const { loadConfig, saveConfig } = await import('../lib/config.js');

      // Save partial config
      saveConfig({ custom_only: true });

      const config = loadConfig();
      // Should have both custom and default keys
      assert.ok(config.custom_only, 'should have custom key');
      assert.ok('profiles_dir' in config, 'should have default profiles_dir');
      assert.ok('whisper_model' in config, 'should have default whisper_model');
    });
  });

  describe('saveConfig()', () => {
    it('writes config to disk', async () => {
      const { saveConfig, CONFIG_FILE } = await import('../lib/config.js');

      const testConfig = { profiles_dir: '/tmp/test-profiles', monitor_interval_hours: 12 };
      saveConfig(testConfig);

      assert.ok(fs.existsSync(CONFIG_FILE), 'config file should exist');
      const written = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      assert.strictEqual(written.profiles_dir, '/tmp/test-profiles');
      assert.strictEqual(written.monitor_interval_hours, 12);
    });

    it('writes valid JSON', async () => {
      const { saveConfig, CONFIG_FILE } = await import('../lib/config.js');

      saveConfig({ test: true, nested: { a: 1 } });
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      assert.doesNotThrow(() => JSON.parse(content), 'should write valid JSON');
    });
  });

  describe('getProfilesDir()', () => {
    it('creates directory if needed', async () => {
      const { getProfilesDir } = await import('../lib/config.js');
      const dir = getProfilesDir();
      assert.ok(fs.existsSync(dir), 'profiles dir should exist after calling getProfilesDir');
      assert.ok(fs.statSync(dir).isDirectory(), 'should be a directory');
    });

    it('returns a string path', async () => {
      const { getProfilesDir } = await import('../lib/config.js');
      const dir = getProfilesDir();
      assert.strictEqual(typeof dir, 'string');
      assert.ok(path.isAbsolute(dir), 'should return absolute path');
    });
  });

  describe('checkTool()', () => {
    it('returns true for existing tool (node)', () => {
      assert.strictEqual(checkTool('node'), true, 'node should be available');
    });

    it('returns true for existing tool (which)', () => {
      assert.strictEqual(checkTool('which'), true, 'which should be available');
    });

    it('returns false for nonexistent tool', () => {
      assert.strictEqual(checkTool('this-tool-definitely-does-not-exist-xyz123'), false);
    });

    it('returns false for empty string', () => {
      assert.strictEqual(checkTool(''), false);
    });
  });
});
