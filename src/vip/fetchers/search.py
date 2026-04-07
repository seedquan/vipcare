"""DuckDuckGo web search fetcher."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SearchResult:
    title: str
    url: str
    body: str


def search(query: str, max_results: int = 5) -> list[SearchResult]:
    """Search DuckDuckGo and return results."""
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        return []

    results = []
    try:
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append(SearchResult(
                    title=r.get("title", ""),
                    url=r.get("href", ""),
                    body=r.get("body", ""),
                ))
    except Exception:
        pass

    return results


def search_person(name: str, company: str | None = None) -> list[SearchResult]:
    """Search for a person across multiple queries."""
    queries = [f'"{name}"']
    if company:
        queries.append(f'"{name}" "{company}"')
    queries.append(f'"{name}" site:twitter.com OR site:x.com')
    queries.append(f'"{name}" site:linkedin.com/in')

    all_results = []
    seen_urls = set()

    for q in queries:
        for r in search(q, max_results=5):
            if r.url not in seen_urls:
                seen_urls.add(r.url)
                all_results.append(r)

    return all_results
