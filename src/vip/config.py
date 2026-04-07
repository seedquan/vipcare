"""Configuration management for VIP CRM."""

import json
import os
from pathlib import Path

CONFIG_DIR = Path.home() / ".vip-crm"
CONFIG_FILE = CONFIG_DIR / "config.json"
CHANGELOG_FILE = CONFIG_DIR / "changelog.jsonl"

DEFAULT_CONFIG = {
    "profiles_dir": str(Path.home() / "Projects" / "vip-crm" / "profiles"),
    "monitor_interval_hours": 24,
}


def load_config() -> dict:
    """Load config from ~/.vip-crm/config.json, creating defaults if needed."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            config = json.load(f)
        # Merge with defaults for any missing keys
        for key, value in DEFAULT_CONFIG.items():
            config.setdefault(key, value)
        return config

    # First run: create default config
    save_config(DEFAULT_CONFIG)
    return dict(DEFAULT_CONFIG)


def save_config(config: dict) -> None:
    """Save config to ~/.vip-crm/config.json."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


def get_profiles_dir() -> Path:
    """Get the profiles directory path, creating it if needed."""
    config = load_config()
    profiles_dir = Path(config["profiles_dir"]).expanduser()
    profiles_dir.mkdir(parents=True, exist_ok=True)
    return profiles_dir


def check_tool(name: str) -> bool:
    """Check if a CLI tool is available on the system."""
    import shutil
    return shutil.which(name) is not None
