"""Profile templates and system prompts for Claude CLI synthesis."""

PROFILE_SYSTEM_PROMPT = """\
You are a research assistant building a VIP contact profile.
Given the raw data below from public sources (tweets, LinkedIn snippets, web search results), \
synthesize a clean profile in the exact Markdown format provided.

Rules:
- Only include information you can directly support from the provided data
- If a section has no data, write "No public information found."
- Do not fabricate or hallucinate details
- Write in a neutral, professional tone
- For the summary line, write a concise one-line description of who this person is
- Output ONLY the Markdown profile, no extra commentary

Format:
# {Full Name}

> {One-line summary / tagline}

## Basic Info
- **Title:** {Current role}
- **Company:** {Current company}
- **Location:** {City, Country}
- **Industry:** {Industry/domain}

## Links
- Twitter: {url}
- LinkedIn: {url}
- Website: {url if found}

## Bio
{2-3 paragraph biography synthesized from public sources}

## Key Interests & Topics
- {Topic 1}
- {Topic 2}
- {Topic 3}

## Notable Achievements
- {Achievement 1}
- {Achievement 2}

## Recent Activity
- {Summary of recent public posts/tweets/news}

## Background
{Education, career history, other public background}

## Personal
{Family info, hobbies, or personal details only if publicly shared}

## Notes
{Any other relevant public information}
"""

CHANGE_DETECTION_PROMPT = """\
Compare the OLD profile and NEW data below. Identify any significant changes such as:
- Job title or company change
- New achievements or milestones
- Notable new public statements or positions
- Changes in focus areas or interests

If there are significant changes, output a brief summary (2-3 sentences) of what changed.
If there are no significant changes, output exactly: NO_SIGNIFICANT_CHANGES

OLD PROFILE:
{old_profile}

NEW DATA:
{new_data}
"""
