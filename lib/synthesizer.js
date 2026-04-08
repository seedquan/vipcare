import { execSync } from 'child_process';
import { checkTool, loadConfig } from './config.js';
import { PROFILE_SYSTEM_PROMPT, CHANGE_DETECTION_PROMPT } from './templates.js';

function getBackend() {
  const envBackend = process.env.VIP_AI_BACKEND?.toLowerCase();
  if (envBackend) return envBackend;

  const config = loadConfig();
  if (config.ai_backend) return config.ai_backend.toLowerCase();

  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (checkTool('claude')) return 'claude-cli';
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
    execSync('gh copilot --help', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function callClaudeCli(prompt, timeout = 120000) {
  const result = execSync(`claude --print -p ${JSON.stringify(prompt)}`, {
    encoding: 'utf-8',
    timeout,
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10,
  });
  return result.trim();
}

async function callAnthropicApi(prompt) {
  let anthropic;
  try {
    anthropic = await import('@anthropic-ai/sdk');
  } catch {
    throw new Error('Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk');
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment variable not set.');

  const config = loadConfig();
  const model = config.anthropic_model || 'claude-sonnet-4-20250514';

  const client = new anthropic.default({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  return message.content[0].text.trim();
}

function callCopilotCli(prompt, timeout = 120000) {
  const result = execSync(`gh copilot suggest -t shell ${JSON.stringify(prompt)}`, {
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
