"""Resolve a person's name/company to social media profiles."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urlparse

from vip.fetchers.search import SearchResult, search_person


@dataclass
class ResolvedPerson:
    name: str
    twitter_handle: str | None = None
    linkedin_url: str | None = None
    other_urls: list[str] = field(default_factory=list)
    raw_snippets: list[str] = field(default_factory=list)


# Twitter handles to ignore (not real users)
_TWITTER_IGNORE = {"search", "explore", "home", "hashtag", "i", "settings", "login"}


def parse_twitter_handle(url: str) -> str | None:
    """Extract Twitter handle from a URL."""
    match = re.search(r"(?:twitter\.com|x\.com)/(@?\w+)", url)
    if match:
        handle = match.group(1).lstrip("@")
        if handle.lower() not in _TWITTER_IGNORE:
            return handle
    return None


def parse_linkedin_url(url: str) -> str | None:
    """Extract LinkedIn profile URL if valid."""
    if "linkedin.com/in/" in url:
        # Normalize to just the profile path
        match = re.search(r"(https?://[^/]*linkedin\.com/in/[^/?#]+)", url)
        if match:
            return match.group(1)
    return None


def resolve_from_url(url: str) -> ResolvedPerson:
    """Resolve a person from a direct social media URL."""
    person = ResolvedPerson(name="")

    twitter_handle = parse_twitter_handle(url)
    if twitter_handle:
        person.twitter_handle = twitter_handle
        person.name = twitter_handle
        return person

    linkedin_url = parse_linkedin_url(url)
    if linkedin_url:
        person.linkedin_url = linkedin_url
        # Extract name from LinkedIn URL slug
        match = re.search(r"/in/([^/?#]+)", linkedin_url)
        if match:
            person.name = match.group(1).replace("-", " ").title()
        return person

    # Unknown URL - store it anyway
    person.other_urls.append(url)
    return person


def resolve_from_name(name: str, company: str | None = None) -> ResolvedPerson:
    """Resolve a person from name and optional company via web search."""
    results = search_person(name, company)

    person = ResolvedPerson(name=name)

    for r in results:
        # Find Twitter handle
        if person.twitter_handle is None:
            handle = parse_twitter_handle(r.url)
            if handle:
                person.twitter_handle = handle

        # Find LinkedIn URL
        if person.linkedin_url is None:
            linkedin = parse_linkedin_url(r.url)
            if linkedin:
                person.linkedin_url = linkedin

        # Collect all URLs
        person.other_urls.append(r.url)

        # Collect snippets for synthesis
        person.raw_snippets.append(f"{r.title}\n{r.body}")

    return person


def is_url(text: str) -> bool:
    """Check if text looks like a URL."""
    return text.startswith(("http://", "https://", "twitter.com", "x.com", "linkedin.com"))
