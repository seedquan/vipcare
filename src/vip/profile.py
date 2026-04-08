"""Profile file management - read, write, list, search Markdown files."""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from vip.config import get_profiles_dir


def slugify(name: str) -> str:
    """Convert a name to a filesystem-safe slug.

    "Sam Altman" → "sam-altman"
    "Elon Musk" → "elon-musk"
    """
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug


def save_profile(name: str, content: str, profiles_dir: Path | None = None) -> Path:
    """Save profile content to a Markdown file. Returns the file path."""
    if profiles_dir is None:
        profiles_dir = get_profiles_dir()
    slug = slugify(name)
    filepath = profiles_dir / f"{slug}.md"
    filepath.write_text(content, encoding="utf-8")
    return filepath


def load_profile(name_or_slug: str, profiles_dir: Path | None = None) -> str | None:
    """Load profile content by name or slug. Returns None if not found."""
    if profiles_dir is None:
        profiles_dir = get_profiles_dir()

    slug = slugify(name_or_slug)
    filepath = profiles_dir / f"{slug}.md"
    if filepath.exists():
        return filepath.read_text(encoding="utf-8")

    # Try exact filename match
    filepath = profiles_dir / name_or_slug
    if filepath.exists():
        return filepath.read_text(encoding="utf-8")

    # Fuzzy match: find profiles containing the search term
    matches = []
    for f in profiles_dir.glob("*.md"):
        if slug in f.stem:
            matches.append(f)
    if len(matches) == 1:
        return matches[0].read_text(encoding="utf-8")

    return None


def list_profiles(profiles_dir: Path | None = None) -> list[dict]:
    """List all profiles with name and summary."""
    if profiles_dir is None:
        profiles_dir = get_profiles_dir()

    profiles = []
    for f in sorted(profiles_dir.glob("*.md")):
        content = f.read_text(encoding="utf-8")
        # Extract name from first H1
        name = f.stem.replace("-", " ").title()
        name_match = re.search(r"^# (.+)$", content, re.MULTILINE)
        if name_match:
            name = name_match.group(1)

        # Extract summary from blockquote
        summary = ""
        summary_match = re.search(r"^> (.+)$", content, re.MULTILINE)
        if summary_match:
            summary = summary_match.group(1)

        # Get last modified time
        mtime = datetime.fromtimestamp(f.stat().st_mtime)

        profiles.append({
            "slug": f.stem,
            "name": name,
            "summary": summary,
            "updated": mtime.strftime("%Y-%m-%d"),
            "path": str(f),
        })

    return profiles


def search_profiles(keyword: str, profiles_dir: Path | None = None) -> list[dict]:
    """Search across all profiles for a keyword."""
    if profiles_dir is None:
        profiles_dir = get_profiles_dir()

    keyword_lower = keyword.lower()
    results = []

    for f in sorted(profiles_dir.glob("*.md")):
        content = f.read_text(encoding="utf-8")
        if keyword_lower in content.lower():
            # Find matching lines for context
            matches = []
            for line in content.split("\n"):
                if keyword_lower in line.lower():
                    matches.append(line.strip())

            name = f.stem.replace("-", " ").title()
            name_match = re.search(r"^# (.+)$", content, re.MULTILINE)
            if name_match:
                name = name_match.group(1)

            results.append({
                "slug": f.stem,
                "name": name,
                "matches": matches[:3],  # Show up to 3 matching lines
                "path": str(f),
            })

    return results


def profile_exists(name: str, profiles_dir: Path | None = None) -> bool:
    """Check if a profile already exists."""
    if profiles_dir is None:
        profiles_dir = get_profiles_dir()
    slug = slugify(name)
    return (profiles_dir / f"{slug}.md").exists()


def get_profile_path(name: str, profiles_dir: Path | None = None) -> Path:
    """Get the path for a profile file."""
    if profiles_dir is None:
        profiles_dir = get_profiles_dir()
    slug = slugify(name)
    return profiles_dir / f"{slug}.md"


def delete_profile(name: str, profiles_dir: Path | None = None) -> bool:
    """Delete a profile file. Returns True if deleted."""
    if profiles_dir is None:
        profiles_dir = get_profiles_dir()
    slug = slugify(name)
    filepath = profiles_dir / f"{slug}.md"
    if filepath.exists():
        filepath.unlink()
        return True
    return False
