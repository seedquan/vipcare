"""Shared test fixtures."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def profiles_dir(tmp_path):
    """Temporary profiles directory."""
    d = tmp_path / "profiles"
    d.mkdir()
    return d


@pytest.fixture
def sample_profiles(profiles_dir):
    """Create sample profile files."""
    (profiles_dir / "sam-altman.md").write_text(
        "# Sam Altman\n\n> CEO of OpenAI\n\n## Basic Info\n- **Title:** CEO\n- **Company:** OpenAI\n\n## Links\n- Twitter: https://twitter.com/sama\n- LinkedIn: https://linkedin.com/in/samaltman\n"
    )
    (profiles_dir / "elon-musk.md").write_text(
        "# Elon Musk\n\n> CEO of Tesla and SpaceX\n\n## Basic Info\n- **Title:** CEO\n- **Company:** Tesla\n\n## Links\n- Twitter: https://twitter.com/elonmusk\n"
    )
    return profiles_dir


@pytest.fixture
def mock_bird_cli(monkeypatch):
    """Mock bird CLI subprocess calls."""
    def mock_run(cmd, **kwargs):
        if cmd[0] == "bird":
            result = MagicMock()
            result.returncode = 0
            result.stdout = "Sample tweet from the user about AI and technology\n---\nAnother tweet about startups"
            result.stderr = ""
            return result
        return subprocess.run(cmd, **kwargs)

    monkeypatch.setattr(subprocess, "run", mock_run)


@pytest.fixture
def mock_ddg(monkeypatch):
    """Mock DuckDuckGo search results."""
    class MockDDGS:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass
        def text(self, query, max_results=5):
            return [
                {
                    "title": "Sam Altman - Wikipedia",
                    "href": "https://en.wikipedia.org/wiki/Sam_Altman",
                    "body": "Samuel Harris Altman is an American entrepreneur and investor, CEO of OpenAI.",
                },
                {
                    "title": "Sam Altman (@sama) / X",
                    "href": "https://twitter.com/sama",
                    "body": "CEO @OpenAI. Previously president of @ycombinator.",
                },
                {
                    "title": "Sam Altman - LinkedIn",
                    "href": "https://linkedin.com/in/samaltman",
                    "body": "CEO at OpenAI. Board member. Angel investor.",
                },
            ]

    monkeypatch.setattr("vip.fetchers.search.DDGS", MockDDGS, raising=False)
    import vip.fetchers.search as search_mod
    monkeypatch.setattr(search_mod, "DDGS", MockDDGS, raising=False)


@pytest.fixture
def mock_fetchers(mock_bird_cli, mock_ddg):
    """Combined fetcher mocks."""
    pass
