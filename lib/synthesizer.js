import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkTool, loadConfig } from './config.js';
import { PROFILE_SYSTEM_PROMPT, CHANGE_DETECTION_PROMPT } from './templates.js';

function getBackend() {
  const envBackend = process.env.VIP_AI_BACKEND?.toLowerCase();
  if (envBackend) return envBackend;

  const config = loadConfig();
  if (config.ai_backend) return config.ai_backend.toLowerCase();

  if (checkTool('claude')) return 'claude-cli';
  if (process.env.ANTHROPIC_API_KEY || config.anthropic_api_key) return 'anthropic';
  if (checkTool('gh') && copilotAvailable()) return 'copilot-cli';

  throw new Error(
    'No AI backend available. Options:\n' +
    '  1. Install Claude Code CLI\n' +
    '  2. Set ANTHROPIC_API_KEY env var\n' +
    '  3. Install GitHub Copilot CLI (gh copilot)'
  );
}

function copilotAvailable() {
  try {
    execFileSync('gh', ['copilot', '--help'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function callClaudeCli(prompt, timeout = 120000) {
  // Pipe prompt via stdin to avoid OS arg length limits on long prompts
  const result = spawnSync('claude', ['--print'], {
    input: prompt,
    encoding: 'utf-8',
    timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || 'Claude CLI failed');
  }
  return result.stdout.trim();
}

async function callAnthropicApi(prompt) {
  let anthropic;
  try {
    anthropic = await import('@anthropic-ai/sdk');
  } catch {
    throw new Error('Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || loadConfig().anthropic_api_key;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set. Run "vip init" or set the environment variable.');

  const config = loadConfig();
  const model = config.anthropic_model || 'claude-sonnet-4-20250514';

  const client = new anthropic.default({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

function callCopilotCli(prompt, timeout = 120000) {
  const result = execFileSync('gh', ['copilot', 'suggest', '-t', 'shell', prompt], {
    encoding: 'utf-8',
    timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.trim();
}

async function callBackend(prompt, backend) {
  if (backend === 'claude-cli') return callClaudeCli(prompt);
  if (backend === 'anthropic') return await callAnthropicApi(prompt);
  if (backend === 'copilot-cli') return callCopilotCli(prompt);
  throw new Error(`Unknown AI backend: ${backend}`);
}

export function getBackendName() {
  try {
    return getBackend();
  } catch {
    return 'none';
  }
}

export async function synthesizeProfile(rawData, sources) {
  const backend = getBackend();
  const prompt = `${PROFILE_SYSTEM_PROMPT}\n\nRaw data:\n${rawData}`;

  const profile = await callBackend(prompt, backend);

  const today = new Date().toISOString().slice(0, 10);
  let footer = `\n\n---\n*Last updated: ${today}*`;
  if (sources?.length) {
    footer += `\n*Sources: ${sources.slice(0, 10).join(', ')}*`;
  }

  return profile + footer;
}

export async function detectChanges(oldProfile, newData) {
  let backend;
  try {
    backend = getBackend();
  } catch {
    return null;
  }

  const prompt = CHANGE_DETECTION_PROMPT
    .replace('{old_profile}', oldProfile)
    .replace('{new_data}', newData);

  try {
    const output = await callBackend(prompt, backend);
    return output.includes('NO_SIGNIFICANT_CHANGES') ? null : output;
  } catch {
    return null;
  }
}
