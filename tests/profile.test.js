import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { slugify, validateName, saveProfile, loadProfile, listProfiles, searchProfiles, profileExists, deleteProfile, parseTags } from '../lib/profile.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vip-test-'));
});

describe('slugify', () => {
  it('basic name', () => assert.strictEqual(slugify('Sam Altman'), 'sam-altman'));
  it('special chars', () => assert.strictEqual(slugify("Dr. John O'Brien"), 'dr-john-obrien'));
  it('extra spaces', () => assert.strictEqual(slugify('  Elon   Musk  '), 'elon-musk'));
});

describe('validateName', () => {
  it('accepts valid names', () => {
    assert.ok(validateName('Sam Altman'));
    assert.ok(validateName('Elon Musk'));
  });

  it('rejects empty/null/undefined', () => {
    assert.ok(!validateName(''));
    assert.ok(!validateName(null));
    assert.ok(!validateName(undefined));
  });

  it('rejects non-strings', () => {
    assert.ok(!validateName(123));
    assert.ok(!validateName({}));
  });

  it('rejects names that slugify to unnamed', () => {
    assert.ok(!validateName('!!!'));
    assert.ok(!validateName('   '));
  });
});

describe('save and load', () => {
  it('round-trips content', () => {
    saveProfile('Test Person', '# Test\nContent', tmpDir);
    assert.strictEqual(loadProfile('Test Person', tmpDir), '# Test\nContent');
  });

  it('returns null for missing', () => {
    assert.strictEqual(loadProfile('Nobody', tmpDir), null);
  });

  it('fuzzy matches', () => {
    saveProfile('Sam Altman', '# Sam Altman\nContent', tmpDir);
    const result = loadProfile('sam', tmpDir);
    assert.ok(result?.includes('Sam Altman'));
  });
});

describe('listProfiles', () => {
  it('empty dir', () => assert.deepStrictEqual(listProfiles(tmpDir), []));

  it('lists profiles', () => {
    saveProfile('Sam Altman', '# Sam Altman\n\n> CEO of OpenAI', tmpDir);
    saveProfile('Elon Musk', '# Elon Musk\n\n> CEO of Tesla', tmpDir);
    const profiles = listProfiles(tmpDir);
    assert.strictEqual(profiles.length, 2);
    assert.ok(profiles.some(p => p.name === 'Sam Altman'));
    assert.ok(profiles.some(p => p.name === 'Elon Musk'));
  });

  it('extracts summary', () => {
    saveProfile('Test', '# Test\n\n> Summary here', tmpDir);
    assert.strictEqual(listProfiles(tmpDir)[0].summary, 'Summary here');
  });
});

describe('searchProfiles', () => {
  it('finds matches', () => {
    saveProfile('Sam', '# Sam\nOpenAI CEO', tmpDir);
    saveProfile('Elon', '# Elon\nTesla CEO', tmpDir);
    assert.strictEqual(searchProfiles('OpenAI', tmpDir).length, 1);
  });

  it('case insensitive', () => {
    saveProfile('Sam', '# Sam\nOpenAI', tmpDir);
    assert.strictEqual(searchProfiles('openai', tmpDir).length, 1);
  });

  it('no match', () => {
    saveProfile('Sam', '# Sam\nOpenAI', tmpDir);
    assert.strictEqual(searchProfiles('nonexistent', tmpDir).length, 0);
  });
});

describe('profileExists / deleteProfile', () => {
  it('exists check', () => {
    saveProfile('Test', 'content', tmpDir);
    assert.ok(profileExists('Test', tmpDir));
    assert.ok(!profileExists('Nobody', tmpDir));
  });

  it('delete', () => {
    saveProfile('Test', 'content', tmpDir);
    assert.ok(deleteProfile('Test', tmpDir));
    assert.ok(!profileExists('Test', tmpDir));
  });

  it('delete missing returns false', () => {
    assert.ok(!deleteProfile('Nobody', tmpDir));
  });
});

describe('parseTags', () => {
  it('parses tags from content', () => {
    const content = '# Test\n\n## Tags\n- investor\n- AI\n- founder\n\n---\n';
    const tags = parseTags(content);
    assert.deepStrictEqual(tags, ['investor', 'AI', 'founder']);
  });

  it('returns empty array for empty content', () => {
    assert.deepStrictEqual(parseTags(''), []);
  });

  it('returns empty array when no tags section exists', () => {
    const content = '# Test\n\n## Notes\n- some note\n';
    assert.deepStrictEqual(parseTags(content), []);
  });
});
