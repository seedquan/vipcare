import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { checkTool, loadConfig, TRANSCRIPTS_DIR } from '../config.js';
import { search } from './search.js';

export function isAvailable() {
  if (!checkTool('python3')) return false;

  const config = loadConfig();
  return fs.existsSync(config.youtube_transcriber_path);
}

function isYouTubeUrl(url) {
  return /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/.test(url);
}

export function transcribeVideo(url) {
  if (!isYouTubeUrl(url)) {
    throw new Error(`Not a YouTube URL: ${url}`);
  }

  if (!isAvailable()) {
    throw new Error(
      'YouTube transcriber not available. Requires:\n' +
      '  - python3\n' +
      '  - yt-dlp (pip install yt-dlp)\n' +
      '  - whisper (pip install openai-whisper)\n' +
      '  - Transcriber script at ~/.claude/skills/youtube-transcribe/youtube_transcriber.py'
    );
  }

  const config = loadConfig();
  const transcriptDir = TRANSCRIPTS_DIR;
  fs.mkdirSync(transcriptDir, { recursive: true });

  // Run the Python transcriber
  try {
    execSync(
      `python3 "${config.youtube_transcriber_path}" "${url}"`,
      {
        encoding: 'utf-8',
        timeout: 600000, // 10 minutes
        cwd: transcriptDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
  } catch (e) {
    throw new Error(`Transcription failed: ${e.stderr || e.message}`);
  }

  // Find the most recent transcript and metadata files
  const files = fs.readdirSync(path.join(transcriptDir, 'downloads'))
    .filter(f => f.endsWith('_transcript.txt'))
    .map(f => ({
      name: f,
      path: path.join(transcriptDir, 'downloads', f),
      mtime: fs.statSync(path.join(transcriptDir, 'downloads', f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (!files.length) {
    throw new Error('No transcript file generated.');
  }

  const transcriptFile = files[0].path;
  const metadataFile = transcriptFile.replace('_transcript.txt', '_metadata.json');

  let transcript = fs.readFileSync(transcriptFile, 'utf-8');
  let metadata = {};

  if (fs.existsSync(metadataFile)) {
    metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
  }

  // Truncate transcript if too long
  const maxChars = config.transcript_max_chars || 15000;
  if (transcript.length > maxChars) {
    transcript = transcript.slice(0, maxChars) + `\n\n[Transcript truncated at ${maxChars} characters. Full transcript: ${transcriptFile}]`;
  }

  // Clean up the MP3 to save space
  const mp3File = transcriptFile.replace('_transcript.txt', '.mp3');
  if (fs.existsSync(mp3File)) {
    try { fs.unlinkSync(mp3File); } catch { /* ignore */ }
  }

  return {
    title: metadata.title || 'Unknown Video',
    url,
    uploader: metadata.uploader || '',
    duration: metadata.duration || 0,
    transcript,
    transcriptFile,
  };
}

export function searchYouTubeVideos(personName, maxResults = 5) {
  const query = `"${personName}" interview OR talk OR keynote OR podcast site:youtube.com`;
  const results = search(query, maxResults);

  return results
    .filter(r => /youtube\.com|youtu\.be/.test(r.url))
    .map(r => ({ title: r.title, url: r.url, body: r.body }));
}
