"""macOS launchd scheduler for automatic monitoring."""

from __future__ import annotations

import subprocess
import shutil
from pathlib import Path

from vip.config import load_config

PLIST_NAME = "com.vip-crm.monitor"
PLIST_PATH = Path.home() / "Library" / "LaunchAgents" / f"{PLIST_NAME}.plist"


def _get_vip_path() -> str:
    """Find the vip CLI executable path."""
    path = shutil.which("vip")
    if path:
        return path
    # Fallback: try common locations
    for p in [
        Path.home() / ".local" / "bin" / "vip",
        Path("/opt/homebrew/bin/vip"),
        Path("/usr/local/bin/vip"),
    ]:
        if p.exists():
            return str(p)
    raise FileNotFoundError("Cannot find 'vip' executable. Is it installed?")


def create_plist(interval_hours: int | None = None) -> str:
    """Generate the launchd plist XML content."""
    if interval_hours is None:
        config = load_config()
        interval_hours = config.get("monitor_interval_hours", 24)

    interval_seconds = interval_hours * 3600
    vip_path = _get_vip_path()

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{vip_path}</string>
        <string>monitor</string>
        <string>run</string>
    </array>
    <key>StartInterval</key>
    <integer>{interval_seconds}</integer>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>{Path.home()}/.vip-crm/monitor.log</string>
    <key>StandardErrorPath</key>
    <string>{Path.home()}/.vip-crm/monitor-error.log</string>
</dict>
</plist>
"""


def install() -> None:
    """Install and load the launchd job."""
    plist_content = create_plist()
    PLIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    PLIST_PATH.write_text(plist_content)

    subprocess.run(
        ["launchctl", "load", str(PLIST_PATH)],
        check=True,
    )


def uninstall() -> None:
    """Unload and remove the launchd job."""
    if PLIST_PATH.exists():
        subprocess.run(
            ["launchctl", "unload", str(PLIST_PATH)],
            check=False,
        )
        PLIST_PATH.unlink()


def is_running() -> bool:
    """Check if the monitor launchd job is loaded."""
    result = subprocess.run(
        ["launchctl", "list"],
        capture_output=True, text=True,
    )
    return PLIST_NAME in result.stdout


def status() -> dict:
    """Get monitor status info."""
    config = load_config()
    return {
        "installed": PLIST_PATH.exists(),
        "running": is_running(),
        "interval_hours": config.get("monitor_interval_hours", 24),
        "plist_path": str(PLIST_PATH),
    }
