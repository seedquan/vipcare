"""Tests for launchd scheduler."""

from __future__ import annotations

from vip.scheduler import create_plist, PLIST_NAME


def test_create_plist_content(monkeypatch):
    monkeypatch.setattr("vip.scheduler._get_vip_path", lambda: "/usr/local/bin/vip")

    plist = create_plist(interval_hours=12)
    assert PLIST_NAME in plist
    assert "<integer>43200</integer>" in plist  # 12 * 3600
    assert "/usr/local/bin/vip" in plist
    assert "monitor" in plist


def test_create_plist_default_interval(monkeypatch):
    monkeypatch.setattr("vip.scheduler._get_vip_path", lambda: "/usr/local/bin/vip")
    monkeypatch.setattr("vip.scheduler.load_config", lambda: {"monitor_interval_hours": 24})

    plist = create_plist()
    assert "<integer>86400</integer>" in plist  # 24 * 3600
