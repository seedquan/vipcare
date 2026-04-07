"""AI synthesis using local Claude CLI."""

from __future__ import annotations

import subprocess
from datetime import date

from vip.config import check_tool
from vip.templates import PROFILE_SYSTEM_PROMPT, CHANGE_DETECTION_PROMPT


def synthesize_profile(raw_data: str, sources: list[str] | None = None) -> str:
    """Generate a structured Markdown profile from raw data using Claude CLI.

    Args:
        raw_data: All gathered text about the person
        sources: List of source URLs used

    Returns:
        Structured Markdown profile string
    """
    if not check_tool("claude"):
        raise RuntimeError(
            "claude CLI not found. Install Claude Code: https://claude.ai/code"
        )

    prompt = f"{PROFILE_SYSTEM_PROMPT}\n\nRaw data:\n{raw_data}"

    result = subprocess.run(
        ["claude", "--print", "-p", prompt],
        capture_output=True, text=True, timeout=120,
    )

    if result.returncode != 0:
        raise RuntimeError(f"Claude CLI error: {result.stderr.strip()}")

    profile = result.stdout.strip()

    # Append metadata footer
    today = date.today().isoformat()
    footer = f"\n\n---\n*Last updated: {today}*"
    if sources:
        source_list = ", ".join(sources[:10])
        footer += f"\n*Sources: {source_list}*"

    return profile + footer


def detect_changes(old_profile: str, new_data: str) -> str | None:
    """Compare old profile with new data to detect significant changes.

    Returns:
        Change summary string, or None if no significant changes.
    """
    if not check_tool("claude"):
        return None

    prompt = CHANGE_DETECTION_PROMPT.format(
        old_profile=old_profile,
        new_data=new_data,
    )

    try:
        result = subprocess.run(
            ["claude", "--print", "-p", prompt],
            capture_output=True, text=True, timeout=60,
        )

        if result.returncode != 0:
            return None

        output = result.stdout.strip()
        if "NO_SIGNIFICANT_CHANGES" in output:
            return None

        return output
    except subprocess.TimeoutExpired:
        return None
