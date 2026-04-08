import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';

// Set up the mock once at module level before importing synthesizer
const execFileSyncMock = mock.fn(() => { throw new Error('not found'); });

mock.module('child_process', {
  namedExports: {
    execFileSync: execFileSyncMock,
  },
});

const { getBackendName, synthesizeProfile, detectChanges } = await import('../lib/synthesizer.js');

describe('synthesizer', () => {
  let savedEnv;

  beforeEach(() => {
    savedEnv = { ...process.env };
    execFileSyncMock.mock.resetCalls();
    execFileSyncMock.mock.mockImplementation(() => { throw new Error('not found'); });
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  describe('getBackendName()', () => {
    it('returns "none" when no backend available', () => {
      delete process.env.VIP_AI_BACKEND;
      delete process.env.ANTHROPIC_API_KEY;

      const result = getBackendName();
      assert.strictEqual(result, 'none');
    });

    it('returns correct backend when VIP_AI_BACKEND env var is set', () => {
      process.env.VIP_AI_BACKEND = 'anthropic';
      const result = getBackendName();
      assert.strictEqual(result, 'anthropic');
    });

    it('returns VIP_AI_BACKEND case-insensitively', () => {
      process.env.VIP_AI_BACKEND = 'CLAUDE-CLI';
      const result = getBackendName();
      assert.strictEqual(result, 'claude-cli');
    });

    it('auto-detects anthropic when ANTHROPIC_API_KEY is set', () => {
      delete process.env.VIP_AI_BACKEND;
      process.env.ANTHROPIC_API_KEY = 'sk-test-key-123';

      const result = getBackendName();
      assert.strictEqual(result, 'anthropic');
    });

    it('auto-detects claude-cli when claude tool exists', () => {
      delete process.env.VIP_AI_BACKEND;
      delete process.env.ANTHROPIC_API_KEY;

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'claude') return '/usr/local/bin/claude';
        throw new Error('not found');
      });

      const result = getBackendName();
      assert.strictEqual(result, 'claude-cli');
    });

    it('auto-detects copilot-cli when gh copilot available', () => {
      delete process.env.VIP_AI_BACKEND;
      delete process.env.ANTHROPIC_API_KEY;

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'claude') throw new Error('not found');
        if (cmd === 'which' && args[0] === 'gh') return '/usr/local/bin/gh';
        if (cmd === 'gh' && args[0] === 'copilot') return 'ok';
        throw new Error('not found');
      });

      const result = getBackendName();
      assert.strictEqual(result, 'copilot-cli');
    });

    it('priority: ANTHROPIC_API_KEY before claude-cli', () => {
      delete process.env.VIP_AI_BACKEND;
      process.env.ANTHROPIC_API_KEY = 'sk-test';

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'which' && args[0] === 'claude') return '/usr/local/bin/claude';
        throw new Error('not found');
      });

      const result = getBackendName();
      assert.strictEqual(result, 'anthropic');
    });
  });

  describe('synthesizeProfile()', () => {
    it('appends footer with date and sources', async () => {
      process.env.VIP_AI_BACKEND = 'claude-cli';

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'claude') return '# Test Person\n\n> A test profile';
        if (cmd === 'which') return '/usr/local/bin/' + args[0];
        throw new Error('not found');
      });

      const result = await synthesizeProfile('raw data here', ['https://example.com', 'https://twitter.com/test']);

      const today = new Date().toISOString().slice(0, 10);
      assert.ok(result.includes(`*Last updated: ${today}*`), 'should include last updated date');
      assert.ok(result.includes('*Sources: https://example.com, https://twitter.com/test*'), 'should include sources');
      assert.ok(result.includes('# Test Person'), 'should include AI-generated content');
    });

    it('without sources omits Sources line', async () => {
      process.env.VIP_AI_BACKEND = 'claude-cli';

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'claude') return '# Test Person\n\n> A test profile';
        if (cmd === 'which') return '/usr/local/bin/' + args[0];
        throw new Error('not found');
      });

      const result = await synthesizeProfile('raw data here', []);

      const today = new Date().toISOString().slice(0, 10);
      assert.ok(result.includes(`*Last updated: ${today}*`), 'should include last updated date');
      assert.ok(!result.includes('*Sources:'), 'should not include Sources line when empty array');
    });

    it('without sources param omits Sources line', async () => {
      process.env.VIP_AI_BACKEND = 'claude-cli';

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'claude') return '# No Sources Person';
        if (cmd === 'which') return '/usr/local/bin/' + args[0];
        throw new Error('not found');
      });

      const result = await synthesizeProfile('raw data', undefined);
      assert.ok(!result.includes('*Sources:'), 'should not include Sources when undefined');
    });
  });

  describe('detectChanges()', () => {
    it('returns null for NO_SIGNIFICANT_CHANGES', async () => {
      process.env.VIP_AI_BACKEND = 'claude-cli';

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'claude') return 'NO_SIGNIFICANT_CHANGES';
        if (cmd === 'which') return '/usr/local/bin/' + args[0];
        throw new Error('not found');
      });

      const result = await detectChanges('old profile content', 'new data content');
      assert.strictEqual(result, null);
    });

    it('returns summary string for real changes', async () => {
      process.env.VIP_AI_BACKEND = 'claude-cli';

      execFileSyncMock.mock.mockImplementation((cmd, args, opts) => {
        if (cmd === 'claude') return 'Changed job title from CTO to CEO. New company announced.';
        if (cmd === 'which') return '/usr/local/bin/' + args[0];
        throw new Error('not found');
      });

      const result = await detectChanges('old profile', 'new data');
      assert.strictEqual(result, 'Changed job title from CTO to CEO. New company announced.');
    });

    it('returns null when no backend available', async () => {
      delete process.env.VIP_AI_BACKEND;
      delete process.env.ANTHROPIC_API_KEY;

      // Default mock throws for everything — no backend available
      const result = await detectChanges('old profile', 'new data');
      assert.strictEqual(result, null);
    });
  });
});
