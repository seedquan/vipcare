"""Fetch Twitter data using the bird CLI tool."""

from __future__ import annotations

import json
import re
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


def _parse_tweets(output: str) -> list[str]:
    """Parse bird CLI output into individual tweets, filtering decorators."""
    tweets = []
    current = []

    for line in output.split("\n"):
        stripped = line.strip()
        # Skip separator lines and empty lines between tweets
        if re.match(r"^[─━═]+$", stripped) or not stripped:
            if current:
                tweet_text = " ".join(current).strip()
                if tweet_text and len(tweet_text) > 5:
                    tweets.append(tweet_text)
                current = []
            continue
        # Skip metadata lines (timestamps, retweet counts, etc.)
        if re.match(r"^\d+ (retweets?|likes?|replies|views)", stripped, re.IGNORECASE):
            continue
        if re.match(r"^\d{4}-\d{2}-\d{2}", stripped):
            continue
        current.append(stripped)

    # Don't forget last tweet
    if current:
        tweet_text = " ".join(current).strip()
        if tweet_text and len(tweet_text) > 5:
            tweets.append(tweet_text)

    return tweets


def fetch_profile(handle: str) -> TwitterData | None:
    """Fetch a Twitter profile and recent tweets using bird CLI."""
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
            data.tweets = _parse_tweets(result.stdout)
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
