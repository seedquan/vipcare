"""Tests for data fetchers."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock

from vip.fetchers.twitter import TwitterData, fetch_profile, is_available
from vip.fetchers.web import _TextExtractor


def test_twitter_fetch_profile(mock_bird_cli):
    data = fetch_profile("testuser")
    assert data is not None
    assert data.handle == "testuser"
    assert len(data.raw_output) > 0


def test_twitter_handle_strips_at(mock_bird_cli):
    data = fetch_profile("@testuser")
    assert data.handle == "testuser"


def test_twitter_invalid_handle(monkeypatch):
    """bird returns error for invalid handle."""
    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 1
        result.stdout = ""
        result.stderr = "User not found"
        return result
    monkeypatch.setattr(subprocess, "run", mock_run)

    data = fetch_profile("nonexistent_user_12345")
    assert data is not None
    assert len(data.tweets) == 0


def test_web_text_extractor():
    html = "<html><body><h1>Hello</h1><script>var x=1;</script><p>World</p></body></html>"
    extractor = _TextExtractor()
    extractor.feed(html)
    text = extractor.get_text()
    assert "Hello" in text
    assert "World" in text
    assert "var x=1" not in text


def test_web_text_extractor_empty():
    extractor = _TextExtractor()
    extractor.feed("")
    assert extractor.get_text() == ""
