"""Fetch Twitter data using the bird CLI tool."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field

from vip.config import check_tool


@dataclass
class TwitterData:
    handle: str
    bio: str = ""
    display_name: str = ""
    tweets: list[str] = field(default_factory=list)
    raw_output: str = ""


def is_available() -> bool:
    """Check if bird CLI is installed."""
    return check_tool("bird")


def fetch_profile(handle: str) -> TwitterData | None:
    """Fetch a Twitter profile and recent tweets using bird CLI.

    Args:
        handle: Twitter handle without @ prefix
    """
    if not is_available():
        return None

    handle = handle.lstrip("@")
    data = TwitterData(handle=handle)

    # Search for recent tweets from this user
    try:
        result = subprocess.run(
            ["bird", "search", f"from:{handle}", "--count", "10"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            data.raw_output = result.stdout
            # Parse tweets from output
            for line in result.stdout.strip().split("\n"):
                line = line.strip()
                if line and not line.startswith("─"):
                    data.tweets.append(line)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return data


def fetch_tweets_by_url(url: str) -> str | None:
    """Read a specific tweet thread using bird CLI."""
    if not is_available():
        return None

    try:
        result = subprocess.run(
            ["bird", "read", url],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            return result.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return None
