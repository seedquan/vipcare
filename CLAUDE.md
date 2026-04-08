# VIPCare

## What is this?
CLI tool that auto-builds VIP person profiles from Twitter, LinkedIn, and web search data, synthesized by AI into structured Markdown files.

## Tech Stack
- Node.js ESM, commander CLI
- No build step, no bundler
- Single dependency: commander

## Project Structure
```
bin/vip.js              — CLI entry point, all command definitions
lib/
  config.js             — Config loading (~/.vip-crm/config.json), tool checks
  profile.js            — CRUD for profile Markdown files in profiles/
  resolver.js           — Parse input (name vs URL) into person object
  fetchers/
    twitter.js          — Twitter data via bird CLI
    search.js           — Web search for person info
    youtube.js          — YouTube transcript via yt-dlp + whisper
  synthesizer.js        — AI synthesis (Claude CLI / Anthropic API / GitHub Copilot)
  monitor.js            — Change detection and changelog
  scheduler.js          — macOS launchd for auto-refresh
  card.js               — H5 baseball card generator
  templates.js          — Profile templates
tests/                  — One test file per module
profiles/               — Generated profile Markdown files
web/                    — Card HTML output
skill/                  — Claude Code slash command
```

## Dev Commands
- `npm test` — run all tests (uses node:test with --experimental-test-module-mocks)
- `npm publish` — publish to npm (requires npm auth token)
- `node bin/vip.js <command>` — run CLI locally without installing

## Architecture
Input flows through a pipeline: **resolver** parses the input (name or URL) into a person object, **fetchers** (twitter, search, youtube) gather raw data from external sources, **synthesizer** sends the raw data to an AI backend to produce structured fields, **profile** saves the result as a Markdown file, and **card** can render profiles into an H5 baseball card page.

## Conventions
- All shell commands use `execFileSync` with arg arrays (never `execSync` with string interpolation) for security
- ESM modules (`"type": "module"` in package.json)
- Tests use node:test built-in runner with assert
- Profile data stored as Markdown files in profiles/
- Config at ~/.vip-crm/config.json
- AI backends: Claude CLI, Anthropic API, GitHub Copilot (auto-detected in that order)

## Adding a New Command
1. Add command definition in bin/vip.js using commander
2. Use existing helpers from lib/profile.js, lib/config.js
3. Add --json flag for scripting support
4. Add tests in tests/

## Common Pitfalls
- Must use --experimental-test-module-mocks flag for tests that mock modules
- YouTube transcription requires Python + yt-dlp + whisper (optional dependency)
- The `slugify` function returns 'unnamed' for empty/special-char-only inputs
