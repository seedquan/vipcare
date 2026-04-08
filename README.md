# VIPCare

Auto-build VIP person profiles from Twitter/LinkedIn public data.

## Install

```bash
npm install -g vipcare
```

Or run directly:

```bash
npx vipcare --help
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
vip rm sam-altman -y

# Refresh a profile
vip update sam-altman
```

## Commands

| Command | Description |
|---------|-------------|
| `vip add <name-or-url>` | Add a new profile (`-c` company, `-f` force, `--no-ai`, `--dry-run`, `-y` YouTube URLs) |
| `vip list` | List all profiles |
| `vip show <name>` | Display a profile |
| `vip search <keyword>` | Search across all profiles |
| `vip edit <name>` | Edit profile fields (`--title`, `--company`, `--twitter`, `--linkedin`, `--note`) |
| `vip rm <name>` | Delete a profile (`-y` to confirm) |
| `vip update <name>` | Refresh a profile with latest data |
| `vip open <name>` | Open a profile in your editor |
| `vip youtube <name> <url>` | Add YouTube video transcript to a profile |
| `vip youtube-search <name>` | Search YouTube for a person's talks (`-n` max results) |
| `vip card` | Generate H5 baseball card page (`-o` output path) |
| `vip export` | Export all profiles for backup |
| `vip import` | Restore profiles from backup |
| `vip digest` | Show recent profile changes |
| `vip monitor start\|stop\|status\|run` | Manage automatic profile refresh |
| `vip config` | View settings |

## Features

- **Auto profile building** — Give a name or URL, get a structured profile
- **Multi-source data** — Twitter (via [bird CLI](https://github.com/nickytonline/bird)), LinkedIn, web search
- **AI synthesis** — Claude CLI, Anthropic API, or GitHub Copilot CLI
- **Auto monitoring** — Scheduled profile refresh with change detection (macOS launchd)
- **Markdown output** — One `.md` file per person

## AI Backend

Auto-detected in this order:

| Backend | Setup |
|---------|-------|
| Anthropic API | Set `ANTHROPIC_API_KEY` env var |
| Claude CLI | Install [Claude Code](https://claude.ai/code) |
| GitHub Copilot | Install `gh copilot` |

Override: `VIP_AI_BACKEND=anthropic vip add "Name"`

## Claude Code Skill

Install the `/vip` slash command for Claude Code:

```bash
cp skill/vip.md ~/.claude/commands/vip.md
```

Then use natural language:

```
/vip add Jensen Huang from NVIDIA
/vip who works in AI?
/vip compare Sam Altman and Elon Musk
/vip add a note to sam: met at dinner
```

## Monitoring

```bash
vip monitor start    # Start auto-refresh (every 24h)
vip monitor stop     # Stop
vip monitor status   # Check status
vip monitor run      # Run once now
vip digest           # View recent changes
```

## Config

```bash
vip config           # View settings
```

Settings: `~/.vip-crm/config.json` | Profiles: `~/Projects/vip-crm/profiles/`
