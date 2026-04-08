"""Resolve a person's name/company to social media profiles."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

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


def _linkedin_matches_person(linkedin_url: str, snippet_title: str, snippet_body: str, person_name: str) -> bool:
    """Check if a LinkedIn result actually matches the person we're looking for."""
    name_parts = person_name.lower().split()
    if len(name_parts) < 2:
        return True  # Can't validate with a single name

    text = (snippet_title + " " + snippet_body).lower()

    # Check if at least first AND last name appear in the snippet
    first = name_parts[0]
    last = name_parts[-1]
    return first in text and last in text


def _extract_real_name_from_snippets(snippets: list[str], handle: str) -> str | None:
    """Try to extract a person's real name from search snippets about their handle."""
    for snippet in snippets:
        # Common patterns: "Sam Altman (@sama)", "Sam Altman - sama"
        # Look for "Firstname Lastname" near the handle
        pattern = rf"([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*(?:\(|[-–—/|,])\s*@?{re.escape(handle)}"
        match = re.search(pattern, snippet)
        if match:
            return match.group(1)

        # Also try: "@handle - Firstname Lastname" or "handle | Firstname Lastname"
        pattern2 = rf"@?{re.escape(handle)}\s*(?:\)|[-–—/|,])\s*([A-Z][a-z]+ [A-Z][a-z]+)"
        match2 = re.search(pattern2, snippet)
        if match2:
            return match2.group(1)

    return None


def resolve_from_url(url: str) -> ResolvedPerson:
    """Resolve a person from a direct social media URL."""
    person = ResolvedPerson(name="")

    twitter_handle = parse_twitter_handle(url)
    if twitter_handle:
        person.twitter_handle = twitter_handle

        # Search for the real name behind this handle
        from vip.fetchers.search import search
        results = search(f"@{twitter_handle} twitter", max_results=5)
        snippets = [f"{r.title}\n{r.body}" for r in results]

        real_name = _extract_real_name_from_snippets(snippets, twitter_handle)
        if real_name:
            person.name = real_name
        else:
            person.name = twitter_handle

        person.raw_snippets = snippets
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

        # Find LinkedIn URL — validate it actually matches the person
        if person.linkedin_url is None:
            linkedin = parse_linkedin_url(r.url)
            if linkedin and _linkedin_matches_person(linkedin, r.title, r.body, name):
                person.linkedin_url = linkedin

        # Collect all URLs
        if r.url not in person.other_urls:
            person.other_urls.append(r.url)

        # Collect snippets for synthesis
        snippet = f"{r.title}\n{r.body}"
        if snippet not in person.raw_snippets:
            person.raw_snippets.append(snippet)

    return person


def is_url(text: str) -> bool:
    """Check if text looks like a URL."""
    return text.startswith(("http://", "https://", "twitter.com", "x.com", "linkedin.com"))
