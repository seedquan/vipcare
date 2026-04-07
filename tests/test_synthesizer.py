"""Tests for AI synthesis."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock

from vip.synthesizer import detect_changes, synthesize_profile


def test_synthesize_profile(mock_claude_cli):
    result = synthesize_profile("Some raw data about a person", ["https://example.com"])
    assert "# Test Person" in result
    assert "Last updated:" in result
    assert "Sources:" in result


def test_synthesize_profile_no_sources(mock_claude_cli):
    result = synthesize_profile("Some raw data")
    assert "Last updated:" in result
    assert "Sources:" not in result


def test_synthesize_cli_error(monkeypatch):
    """Claude CLI error should raise RuntimeError."""
    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 1
        result.stdout = ""
        result.stderr = "Some error"
        return result
    monkeypatch.setattr(subprocess, "run", mock_run)
    # Also mock check_tool to return True
    monkeypatch.setattr("vip.synthesizer.check_tool", lambda x: True)

    import pytest
    with pytest.raises(RuntimeError, match="Claude CLI error"):
        synthesize_profile("data")


def test_synthesize_missing_cli(monkeypatch):
    """Missing claude CLI should raise RuntimeError."""
    monkeypatch.setattr("vip.synthesizer.check_tool", lambda x: False)

    import pytest
    with pytest.raises(RuntimeError, match="claude CLI not found"):
        synthesize_profile("data")


def test_detect_changes_no_change(monkeypatch):
    """No significant changes returns None."""
    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stdout = "NO_SIGNIFICANT_CHANGES"
        result.stderr = ""
        return result
    monkeypatch.setattr(subprocess, "run", mock_run)
    monkeypatch.setattr("vip.synthesizer.check_tool", lambda x: True)

    result = detect_changes("old profile", "new data")
    assert result is None


def test_detect_changes_found(monkeypatch):
    """Significant changes returns summary."""
    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stdout = "Person changed their job title from CTO to CEO."
        result.stderr = ""
        return result
    monkeypatch.setattr(subprocess, "run", mock_run)
    monkeypatch.setattr("vip.synthesizer.check_tool", lambda x: True)

    result = detect_changes("old profile", "new data")
    assert result is not None
    assert "CEO" in result
