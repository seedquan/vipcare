"""Tests for CLI commands."""

from __future__ import annotations

from click.testing import CliRunner

from vip.cli import main


def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(main, ["--help"])
    assert result.exit_code == 0
    assert "add" in result.output
    assert "list" in result.output
    assert "show" in result.output
    assert "monitor" in result.output


def test_cli_version():
    runner = CliRunner()
    result = runner.invoke(main, ["--version"])
    assert result.exit_code == 0
    assert "0.1.0" in result.output


def test_list_empty(monkeypatch, profiles_dir):
    monkeypatch.setattr("vip.cli.get_profiles_dir", lambda: profiles_dir)
    monkeypatch.setattr("vip.profile.get_profiles_dir", lambda: profiles_dir)

    runner = CliRunner()
    result = runner.invoke(main, ["list"])
    assert result.exit_code == 0
    assert "No profiles yet" in result.output


def test_list_with_profiles(monkeypatch, sample_profiles):
    monkeypatch.setattr("vip.cli.get_profiles_dir", lambda: sample_profiles)
    monkeypatch.setattr("vip.profile.get_profiles_dir", lambda: sample_profiles)

    runner = CliRunner()
    result = runner.invoke(main, ["list"])
    assert result.exit_code == 0
    assert "Sam Altman" in result.output
    assert "Elon Musk" in result.output


def test_show_profile(monkeypatch, sample_profiles):
    monkeypatch.setattr("vip.profile.get_profiles_dir", lambda: sample_profiles)

    runner = CliRunner()
    result = runner.invoke(main, ["show", "sam-altman"])
    assert result.exit_code == 0
    assert "Sam Altman" in result.output
    assert "OpenAI" in result.output


def test_show_not_found(monkeypatch, profiles_dir):
    monkeypatch.setattr("vip.profile.get_profiles_dir", lambda: profiles_dir)

    runner = CliRunner()
    result = runner.invoke(main, ["show", "nobody"])
    assert result.exit_code != 0


def test_search(monkeypatch, sample_profiles):
    monkeypatch.setattr("vip.profile.get_profiles_dir", lambda: sample_profiles)

    runner = CliRunner()
    result = runner.invoke(main, ["search", "Tesla"])
    assert result.exit_code == 0
    assert "Elon Musk" in result.output


def test_search_no_match(monkeypatch, sample_profiles):
    monkeypatch.setattr("vip.profile.get_profiles_dir", lambda: sample_profiles)

    runner = CliRunner()
    result = runner.invoke(main, ["search", "nonexistent"])
    assert result.exit_code == 0
    assert "No matches" in result.output


def test_digest_empty(monkeypatch):
    monkeypatch.setattr("vip.cli.read_changelog", lambda days: [])

    runner = CliRunner()
    result = runner.invoke(main, ["digest"])
    assert result.exit_code == 0
    assert "No recent changes" in result.output


def test_monitor_status(monkeypatch):
    monkeypatch.setattr(
        "vip.scheduler.status",
        lambda: {"installed": False, "running": False, "interval_hours": 24, "plist_path": "/tmp/test.plist"},
    )

    runner = CliRunner()
    result = runner.invoke(main, ["monitor", "status"])
    assert result.exit_code == 0
    assert "stopped" in result.output


def test_config(monkeypatch):
    monkeypatch.setattr("vip.cli.check_tool", lambda x: True)
    monkeypatch.setattr("vip.config.load_config", lambda: {"profiles_dir": "/tmp", "monitor_interval_hours": 24})

    runner = CliRunner()
    result = runner.invoke(main, ["config"], input="n\n")
    assert result.exit_code == 0
    assert "Current config" in result.output
