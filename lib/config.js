import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const CONFIG_DIR = path.join(os.homedir(), '.vip-crm');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const CHANGELOG_FILE = path.join(CONFIG_DIR, 'changelog.jsonl');

const TRANSCRIPTS_DIR = path.join(CONFIG_DIR, 'transcripts');

const DEFAULT_CONFIG = {
  profiles_dir: path.join(os.homedir(), 'Projects', 'vip-crm', 'profiles'),
  monitor_interval_hours: 24,
  youtube_transcriber_path: path.join(os.homedir(), '.claude', 'skills', 'youtube-transcribe', 'youtube_transcriber.py'),
  whisper_model: 'base',
  transcript_max_chars: 15000,
};

export { TRANSCRIPTS_DIR };

export { CONFIG_DIR, CONFIG_FILE, CHANGELOG_FILE };

export function loadConfig() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });

  if (fs.existsSync(CONFIG_FILE)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    return { ...DEFAULT_CONFIG, ...config };
  }

  saveConfig(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getProfilesDir() {
  const config = loadConfig();
  const dir = config.profiles_dir.replace(/^~/, os.homedir());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function checkTool(name) {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
