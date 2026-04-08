# VIPCare

Auto-build VIP person profiles from Twitter/LinkedIn public data.

## Features

- **Auto profile building** — Give a name or Twitter URL, get a structured profile
- **Multi-source data** — Twitter (via bird CLI), LinkedIn, web search (DuckDuckGo)
- **AI synthesis** — Claude CLI, Anthropic API, or GitHub Copilot CLI
- **Auto monitoring** — Scheduled profile refresh with change detection (macOS launchd)
- **Markdown output** — One `.md` file per person, easy to read and edit

## Install

```bash
cd ~/Projects/vip-crm
pip install -e .
```

## Quick Start

```bash
# Add a person by name
vip add "Sam Altman" --company "OpenAI"

# Add from Twitter URL
vip add https://twitter.com/sama

# List all profiles
vip list

# Show a profile
vip show sam-altman

# Search across profiles
vip search "AI"

# Edit a profile
vip edit sam-altman --note "Met at conference"

# Delete a profile
vip rm sam-altman

# Refresh a profile
vip update sam-altman
```

## AI Backend

Auto-detected in this order:

| Backend | Setup |
|---------|-------|
| Anthropic API | Set `ANTHROPIC_API_KEY` env var |
| Claude CLI | Install [Claude Code](https://claude.ai/code) |
| GitHub Copilot | Install `gh copilot` |

Override with `VIP_AI_BACKEND=anthropic` or set `ai_backend` in config.

## Monitoring

```bash
vip monitor start    # Start auto-refresh (launchd, every 24h)
vip monitor stop     # Stop
vip monitor status   # Check status
vip monitor run      # Run once now
vip digest           # View recent changes
```

## Config

```bash
vip config           # View and edit settings
```

Settings stored in `~/.vip-crm/config.json`. Profiles in `~/Projects/vip-crm/profiles/`.

## Dependencies

- `click` — CLI framework
- `ddgs` — DuckDuckGo search (no API key)
- `requests` — HTTP
- [bird CLI](https://github.com/steipete/bird) — Twitter data (optional)
