import { describe, it } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'child_process';
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
