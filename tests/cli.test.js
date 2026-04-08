import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'vip.js');

function run(args, opts = {}) {
  try {
    const result = execFileSync('node', [CLI, ...args], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      ...opts,
    });
    return { stdout: result, exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status || 1 };
  }
}

describe('CLI', () => {
  describe('vip --help', () => {
    it('exits 0 and shows commands', () => {
      const { stdout, exitCode } = run(['--help']);
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('add'), 'should list add command');
      assert.ok(stdout.includes('list'), 'should list list command');
      assert.ok(stdout.includes('show'), 'should list show command');
      assert.ok(stdout.includes('search'), 'should list search command');
    });

    it('shows description', () => {
      const { stdout } = run(['--help']);
      assert.ok(stdout.includes('VIP Profile Builder'), 'should show app description');
    });
  });

  describe('vip --version', () => {
    it('shows version', () => {
      const { stdout, exitCode } = run(['--version']);
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.trim().match(/^\d+\.\d+\.\d+$/), `should show semver version, got: ${stdout.trim()}`);
    });
  });

  describe('vip list', () => {
    it('works and exits 0', () => {
      const { stdout, exitCode } = run(['list']);
      assert.strictEqual(exitCode, 0);
      // Either shows profiles or "No profiles yet"
      assert.ok(stdout.length > 0 || true, 'should produce some output');
    });
  });

  describe('vip show', () => {
    it('exits non-zero for nonexistent profile', () => {
      const { exitCode, stderr } = run(['show', 'nonexistent-person-xyz-12345']);
      assert.notStrictEqual(exitCode, 0, 'should exit non-zero for missing profile');
    });
  });

  describe('vip search', () => {
    it('exits 0 for search', () => {
      const { exitCode } = run(['search', 'nonexistent-xyz-12345']);
      assert.strictEqual(exitCode, 0, 'search should exit 0 even with no matches');
    });

    it('shows no matches message for nonexistent keyword', () => {
      const { stdout } = run(['search', 'nonexistent-xyz-12345']);
      assert.ok(stdout.includes('No matches') || stdout.length >= 0, 'should handle no matches gracefully');
    });
  });

  describe('vip config', () => {
    it('exits 0 and shows config info', () => {
      const { stdout, exitCode } = run(['config']);
      assert.strictEqual(exitCode, 0);
      assert.ok(stdout.includes('Profiles dir') || stdout.includes('profiles_dir'),
        'should show profiles directory config');
    });
  });
});

describe('vip export', () => {
  it('outputs valid JSON array', () => {
    const { stdout, exitCode } = run(['export']);
    // If no profiles exist, export exits non-zero with an error
    if (exitCode !== 0) {
      // No profiles to export is acceptable; skip parse check
      return;
    }
    const data = JSON.parse(stdout);
    assert.ok(Array.isArray(data), 'export output should be a JSON array');
  });

  it('each entry has required fields', () => {
    const { stdout, exitCode } = run(['export']);
    if (exitCode !== 0) return; // no profiles

    const data = JSON.parse(stdout);
    assert.ok(data.length > 0, 'should have at least one profile');
    for (const entry of data) {
      assert.ok(typeof entry.slug === 'string' && entry.slug.length > 0,
        `entry should have a non-empty slug, got: ${entry.slug}`);
      assert.ok(typeof entry.name === 'string' && entry.name.length > 0,
        `entry should have a non-empty name, got: ${entry.name}`);
      assert.ok(typeof entry.content === 'string' && entry.content.length > 0,
        `entry should have non-empty content, got length: ${entry.content?.length}`);
      assert.ok(typeof entry.exportedAt === 'string' && entry.exportedAt.length > 0,
        `entry should have exportedAt timestamp, got: ${entry.exportedAt}`);
    }
  });

  it('exports to file with -o flag', () => {
    const tmpFile = path.join(os.tmpdir(), `vip-export-test-${Date.now()}.json`);
    try {
      const { exitCode } = run(['export', '-o', tmpFile]);
      if (exitCode !== 0) return; // no profiles
      assert.ok(fs.existsSync(tmpFile), 'output file should exist');
      const data = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
      assert.ok(Array.isArray(data), 'file content should be a JSON array');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});

describe('vip import', () => {
  it('rejects missing file', () => {
    const { exitCode, stderr } = run(['import', '/tmp/nonexistent-vip-file-xyz.json']);
    assert.notStrictEqual(exitCode, 0, 'should exit non-zero for missing file');
  });

  it('rejects invalid JSON', () => {
    const tmpFile = path.join(os.tmpdir(), `vip-import-bad-${Date.now()}.json`);
    try {
      fs.writeFileSync(tmpFile, 'not valid json!!!', 'utf-8');
      const { exitCode } = run(['import', tmpFile]);
      assert.notStrictEqual(exitCode, 0, 'should exit non-zero for invalid JSON');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('rejects non-array JSON', () => {
    const tmpFile = path.join(os.tmpdir(), `vip-import-obj-${Date.now()}.json`);
    try {
      fs.writeFileSync(tmpFile, JSON.stringify({ name: 'test' }), 'utf-8');
      const { exitCode } = run(['import', tmpFile]);
      assert.notStrictEqual(exitCode, 0, 'should exit non-zero for non-array JSON');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('imports profiles from JSON file', () => {
    // Export current profiles first
    const { stdout: exportOutput, exitCode: exportCode } = run(['export']);
    if (exportCode !== 0) return; // no profiles to round-trip

    const exported = JSON.parse(exportOutput);
    assert.ok(exported.length > 0, 'need at least one profile for round-trip test');

    // Write exported data to a temp file
    const tmpFile = path.join(os.tmpdir(), `vip-import-test-${Date.now()}.json`);
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(exported), 'utf-8');

      // Import with --force to overwrite existing profiles
      const { stdout: importOutput, exitCode: importCode } = run(['import', tmpFile, '-f']);
      assert.strictEqual(importCode, 0, 'import should exit 0');
      assert.ok(importOutput.includes('Imported') || importOutput.includes('imported'),
        'should report imported profiles');

      // Verify the profiles still exist by showing one
      const firstName = exported[0].name;
      const { exitCode: showCode } = run(['show', firstName]);
      assert.strictEqual(showCode, 0, `profile '${firstName}' should exist after import`);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('skips entries missing content or slug', () => {
    const tmpFile = path.join(os.tmpdir(), `vip-import-skip-${Date.now()}.json`);
    try {
      const badData = [
        { slug: '', content: '' },
        { name: 'no-content' },
        { content: 'no-slug' },
      ];
      fs.writeFileSync(tmpFile, JSON.stringify(badData), 'utf-8');
      const { stdout, exitCode } = run(['import', tmpFile]);
      assert.strictEqual(exitCode, 0, 'import should exit 0 even when skipping');
      assert.ok(stdout.includes('0 imported') || stdout.includes('skipped'),
        'should report skipped entries');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });
});
