"""Tests for person resolution."""

from __future__ import annotations

from vip.resolver import (
    is_url,
    parse_linkedin_url,
    parse_twitter_handle,
    resolve_from_url,
)


def test_parse_twitter_handle():
    assert parse_twitter_handle("https://twitter.com/elonmusk") == "elonmusk"


def test_parse_twitter_handle_x_domain():
    assert parse_twitter_handle("https://x.com/sama") == "sama"


def test_parse_twitter_handle_with_at():
    assert parse_twitter_handle("https://twitter.com/@test") == "test"


def test_parse_twitter_handle_ignore_search():
    assert parse_twitter_handle("https://twitter.com/search") is None


def test_parse_twitter_handle_ignore_explore():
    assert parse_twitter_handle("https://twitter.com/explore") is None


def test_parse_linkedin_url():
    url = "https://www.linkedin.com/in/samaltman"
    assert parse_linkedin_url(url) == url


def test_parse_linkedin_url_with_params():
    url = "https://linkedin.com/in/samaltman?trk=something"
    result = parse_linkedin_url(url)
    assert result == "https://linkedin.com/in/samaltman"


def test_parse_linkedin_url_not_profile():
    assert parse_linkedin_url("https://linkedin.com/company/openai") is None


def test_resolve_from_twitter_url():
    person = resolve_from_url("https://twitter.com/sama")
    assert person.twitter_handle == "sama"
    assert person.name == "sama"


def test_resolve_from_linkedin_url():
    person = resolve_from_url("https://linkedin.com/in/sam-altman")
    assert person.linkedin_url is not None
    assert "Sam Altman" in person.name


def test_is_url():
    assert is_url("https://twitter.com/test")
    assert is_url("http://example.com")
    assert is_url("twitter.com/test")
    assert not is_url("Sam Altman")
    assert not is_url("test@email.com")


def test_resolve_no_results():
    """resolve_from_url with unknown URL should not crash."""
    person = resolve_from_url("https://example.com/unknown")
    assert person.name == ""
    assert len(person.other_urls) == 1
