"""Tests for multi-backend AI synthesis."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

import pytest

from vip.synthesizer import (
    _get_backend,
    get_backend_name,
    synthesize_profile,
    detect_changes,
)


# -- Backend detection --

def test_backend_env_override(monkeypatch):
    monkeypatch.setenv("VIP_AI_BACKEND", "anthropic")
    assert _get_backend() == "anthropic"


def test_backend_config_override(monkeypatch):
    monkeypatch.delenv("VIP_AI_BACKEND", raising=False)
    monkeypatch.setattr("vip.synthesizer.load_config", lambda: {"ai_backend": "copilot-cli"})
    monkeypatch.setattr("vip.synthesizer.check_tool", lambda x: False)
    assert _get_backend() == "copilot-cli"


def test_backend_auto_detect_anthropic(monkeypatch):
    monkeypatch.delenv("VIP_AI_BACKEND", raising=False)
    monkeypatch.setattr("vip.synthesizer.load_config", lambda: {})
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-123")
    assert _get_backend() == "anthropic"


def test_backend_auto_detect_claude_cli(monkeypatch):
    monkeypatch.delenv("VIP_AI_BACKEND", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr("vip.synthesizer.load_config", lambda: {})
    monkeypatch.setattr("vip.synthesizer.check_tool", lambda x: x == "claude")
    assert _get_backend() == "claude-cli"


def test_backend_no_backend_raises(monkeypatch):
    monkeypatch.delenv("VIP_AI_BACKEND", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr("vip.synthesizer.load_config", lambda: {})
    monkeypatch.setattr("vip.synthesizer.check_tool", lambda x: False)
    monkeypatch.setattr("vip.synthesizer._copilot_available", lambda: False)
    with pytest.raises(RuntimeError, match="No AI backend available"):
        _get_backend()


def test_get_backend_name_returns_none_when_unavailable(monkeypatch):
    monkeypatch.delenv("VIP_AI_BACKEND", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr("vip.synthesizer.load_config", lambda: {})
    monkeypatch.setattr("vip.synthesizer.check_tool", lambda x: False)
    monkeypatch.setattr("vip.synthesizer._copilot_available", lambda: False)
    assert get_backend_name() == "none"


# -- Claude CLI backend --

def test_synthesize_claude_cli(monkeypatch):
    monkeypatch.setenv("VIP_AI_BACKEND", "claude-cli")

    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stdout = "# Test Person\n\n> Test summary"
        result.stderr = ""
        return result

    monkeypatch.setattr(subprocess, "run", mock_run)

    result = synthesize_profile("raw data", ["https://example.com"])
    assert "# Test Person" in result
    assert "Last updated:" in result
    assert "Sources:" in result


def test_synthesize_claude_cli_error(monkeypatch):
    monkeypatch.setenv("VIP_AI_BACKEND", "claude-cli")

    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 1
        result.stdout = ""
        result.stderr = "Some error"
        return result

    monkeypatch.setattr(subprocess, "run", mock_run)

    with pytest.raises(RuntimeError, match="Claude CLI error"):
        synthesize_profile("data")


# -- Anthropic API backend --

def test_synthesize_anthropic_api(monkeypatch):
    monkeypatch.setenv("VIP_AI_BACKEND", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-123")
    monkeypatch.setattr("vip.synthesizer.load_config", lambda: {})

    mock_message = MagicMock()
    mock_message.content = [MagicMock(text="# API Person\n\n> From API")]

    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_message

    mock_anthropic = MagicMock()
    mock_anthropic.Anthropic.return_value = mock_client

    import sys
    sys.modules["anthropic"] = mock_anthropic

    try:
        result = synthesize_profile("raw data")
        assert "# API Person" in result
        assert "Last updated:" in result
    finally:
        del sys.modules["anthropic"]


def test_synthesize_anthropic_no_key(monkeypatch):
    monkeypatch.setenv("VIP_AI_BACKEND", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    mock_anthropic = MagicMock()
    import sys
    sys.modules["anthropic"] = mock_anthropic

    try:
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
            synthesize_profile("data")
    finally:
        del sys.modules["anthropic"]


# -- Copilot CLI backend --

def test_copilot_available(monkeypatch):
    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        return result

    monkeypatch.setattr(subprocess, "run", mock_run)

    from vip.synthesizer import _copilot_available
    assert _copilot_available()


def test_copilot_not_available(monkeypatch):
    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 1
        return result

    monkeypatch.setattr(subprocess, "run", mock_run)

    from vip.synthesizer import _copilot_available
    assert not _copilot_available()


# -- Change detection --

def test_detect_changes_no_change(monkeypatch):
    monkeypatch.setenv("VIP_AI_BACKEND", "claude-cli")

    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stdout = "NO_SIGNIFICANT_CHANGES"
        result.stderr = ""
        return result

    monkeypatch.setattr(subprocess, "run", mock_run)
    assert detect_changes("old", "new") is None


def test_detect_changes_found(monkeypatch):
    monkeypatch.setenv("VIP_AI_BACKEND", "claude-cli")

    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stdout = "Changed job to CEO."
        result.stderr = ""
        return result

    monkeypatch.setattr(subprocess, "run", mock_run)
    result = detect_changes("old", "new")
    assert "CEO" in result


def test_detect_changes_no_backend(monkeypatch):
    monkeypatch.delenv("VIP_AI_BACKEND", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr("vip.synthesizer.load_config", lambda: {})
    monkeypatch.setattr("vip.synthesizer.check_tool", lambda x: False)
    monkeypatch.setattr("vip.synthesizer._copilot_available", lambda: False)
    assert detect_changes("old", "new") is None


# -- No sources --

def test_synthesize_no_sources(monkeypatch):
    monkeypatch.setenv("VIP_AI_BACKEND", "claude-cli")

    def mock_run(cmd, **kwargs):
        result = MagicMock()
        result.returncode = 0
        result.stdout = "# Person"
        result.stderr = ""
        return result

    monkeypatch.setattr(subprocess, "run", mock_run)

    result = synthesize_profile("data")
    assert "Last updated:" in result
    assert "Sources:" not in result
