import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { loadConfig } from './config.js';

const PLIST_NAME = 'com.vipcare.monitor';
const PLIST_PATH = path.join(os.homedir(), 'Library', 'LaunchAgents', `${PLIST_NAME}.plist`);

function getVipPath() {
  try {
    return execFileSync('which', ['vip'], { encoding: 'utf-8' }).trim();
  } catch {
    const candidates = [
      path.join(os.homedir(), '.npm-global', 'bin', 'vip'),
      '/opt/homebrew/bin/vip',
      '/usr/local/bin/vip',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    throw new Error("Cannot find 'vip' executable. Is it installed?");
  }
}

export function createPlist(intervalHours) {
  if (!intervalHours) {
    const config = loadConfig();
    intervalHours = config.monitor_interval_hours || 24;
  }

  const vipPath = getVipPath();
  const intervalSeconds = intervalHours * 3600;
  const logDir = path.join(os.homedir(), '.vip');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${vipPath}</string>
        <string>monitor</string>
        <string>run</string>
    </array>
    <key>StartInterval</key>
    <integer>${intervalSeconds}</integer>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${logDir}/monitor.log</string>
    <key>StandardErrorPath</key>
    <string>${logDir}/monitor-error.log</string>
</dict>
</plist>
`;
}

export function install() {
  const plist = createPlist();
  fs.mkdirSync(path.dirname(PLIST_PATH), { recursive: true });
  fs.writeFileSync(PLIST_PATH, plist);
  execFileSync('launchctl', ['load', PLIST_PATH]);
}

export function uninstall() {
  if (fs.existsSync(PLIST_PATH)) {
    try { execFileSync('launchctl', ['unload', PLIST_PATH]); } catch { /* ignore */ }
    fs.unlinkSync(PLIST_PATH);
  }
}

export function isRunning() {
  try {
    const output = execFileSync('launchctl', ['list'], { encoding: 'utf-8' });
    return output.includes(PLIST_NAME);
  } catch {
    return false;
  }
}

export function status() {
  const config = loadConfig();
  return {
    installed: fs.existsSync(PLIST_PATH),
    running: isRunning(),
    intervalHours: config.monitor_interval_hours || 24,
    plistPath: PLIST_PATH,
  };
}
