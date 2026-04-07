"""Tests for monitoring."""

from __future__ import annotations

import json

from vip.monitor import _extract_metadata, append_changelog, read_changelog


def test_extract_metadata_twitter():
    content = "# Test\n\n## Links\n- Twitter: https://twitter.com/testuser\n"
    meta = _extract_metadata(content)
    assert meta["twitter_handle"] == "testuser"
    assert meta["name"] == "Test"


def test_extract_metadata_linkedin():
    content = "# Test\n\n- LinkedIn: https://linkedin.com/in/test-user\n"
    meta = _extract_metadata(content)
    assert meta["linkedin_url"] == "https://linkedin.com/in/test-user"


def test_extract_metadata_x_domain():
    content = "# Test\n\n- Twitter: https://x.com/testuser\n"
    meta = _extract_metadata(content)
    assert meta["twitter_handle"] == "testuser"


def test_extract_metadata_empty():
    meta = _extract_metadata("No links here")
    assert meta["twitter_handle"] is None
    assert meta["linkedin_url"] is None
    assert meta["name"] is None


def test_changelog_write_and_read(tmp_path, monkeypatch):
    changelog_file = tmp_path / "changelog.jsonl"
    monkeypatch.setattr("vip.monitor.CHANGELOG_FILE", changelog_file)

    entry = {
        "timestamp": "2026-04-07T10:00:00",
        "name": "Test Person",
        "slug": "test-person",
        "summary": "Changed job title",
    }
    append_changelog(entry)

    entries = read_changelog(days=30)
    assert len(entries) == 1
    assert entries[0]["name"] == "Test Person"


def test_changelog_empty(tmp_path, monkeypatch):
    changelog_file = tmp_path / "changelog.jsonl"
    monkeypatch.setattr("vip.monitor.CHANGELOG_FILE", changelog_file)

    entries = read_changelog(days=30)
    assert entries == []
