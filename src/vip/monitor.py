"""Monitor VIP profiles for changes."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from vip.config import get_profiles_dir, CHANGELOG_FILE
from vip.fetchers import search as search_fetcher
from vip.fetchers import twitter as twitter_fetcher
from vip.profile import list_profiles, load_profile, save_profile
from vip.resolver import parse_twitter_handle, parse_linkedin_url
from vip.synthesizer import synthesize_profile, detect_changes


def _extract_metadata(content: str) -> dict:
    """Extract metadata (links, name) from existing profile Markdown."""
    import re
    metadata = {"twitter_handle": None, "linkedin_url": None, "name": None}

    name_match = re.search(r"^# (.+)$", content, re.MULTILINE)
    if name_match:
        metadata["name"] = name_match.group(1)

    twitter_match = re.search(r"twitter\.com/(\w+)", content, re.IGNORECASE)
    if not twitter_match:
        twitter_match = re.search(r"x\.com/(\w+)", content, re.IGNORECASE)
    if twitter_match:
        metadata["twitter_handle"] = twitter_match.group(1)

    linkedin_match = re.search(r"(https?://[^/]*linkedin\.com/in/[^\s)]+)", content)
    if linkedin_match:
        metadata["linkedin_url"] = linkedin_match.group(1)

    return metadata


def _gather_fresh_data(metadata: dict) -> tuple[str, list[str]]:
    """Re-fetch data for a person based on profile metadata."""
    raw_parts = []
    sources = []

    name = metadata.get("name", "")

    # Twitter data via bird CLI
    handle = metadata.get("twitter_handle")
    if handle:
        twitter_data = twitter_fetcher.fetch_profile(handle)
        if twitter_data and twitter_data.raw_output:
            raw_parts.append(f"=== Twitter (@{handle}) ===\n{twitter_data.raw_output}")
            sources.append(f"https://twitter.com/{handle}")

    # Web search
    if name:
        results = search_fetcher.search_person(name)
        for r in results:
            raw_parts.append(f"{r.title}\n{r.body}")
            sources.append(r.url)

    return "\n\n".join(raw_parts), sources


def append_changelog(entry: dict) -> None:
    """Append an entry to the changelog file."""
    CHANGELOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CHANGELOG_FILE, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def read_changelog(days: int = 30) -> list[dict]:
    """Read recent changelog entries."""
    if not CHANGELOG_FILE.exists():
        return []

    entries = []
    cutoff = datetime.now().timestamp() - (days * 86400)

    with open(CHANGELOG_FILE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                ts = datetime.fromisoformat(entry.get("timestamp", "2000-01-01")).timestamp()
                if ts >= cutoff:
                    entries.append(entry)
            except (json.JSONDecodeError, ValueError):
                continue

    return entries


def unread_count() -> int:
    """Count changelog entries from the last 7 days."""
    return len(read_changelog(days=7))


def run_monitor(profiles_dir: Path | None = None, verbose: bool = False) -> list[dict]:
    """Run a full monitoring cycle: check all profiles for updates.

    Returns list of change entries.
    """
    if profiles_dir is None:
        profiles_dir = get_profiles_dir()

    changes = []
    profiles = list_profiles(profiles_dir)

    for p in profiles:
        name = p["name"]
        slug = p["slug"]

        if verbose:
            print(f"  Checking {name}...")

        old_content = load_profile(slug, profiles_dir)
        if not old_content:
            continue

        metadata = _extract_metadata(old_content)
        new_data, sources = _gather_fresh_data(metadata)

        if not new_data.strip():
            if verbose:
                print(f"    No new data found, skipping.")
            continue

        # Detect changes
        change_summary = detect_changes(old_content, new_data)

        if change_summary:
            # Re-synthesize profile
            new_profile = synthesize_profile(new_data, sources)
            save_profile(name, new_profile, profiles_dir)

            entry = {
                "timestamp": datetime.now().isoformat(),
                "name": name,
                "slug": slug,
                "summary": change_summary,
            }
            append_changelog(entry)
            changes.append(entry)

            if verbose:
                print(f"    Changes detected: {change_summary}")
        elif verbose:
            print(f"    No significant changes.")

    return changes
