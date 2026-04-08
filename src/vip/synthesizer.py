"""AI synthesis with multiple backend support.

Supported backends:
- claude-cli: Local Claude Code CLI (default, no API key needed)
- anthropic: Claude API via anthropic SDK (needs ANTHROPIC_API_KEY)
- copilot-cli: GitHub Copilot CLI
"""

from __future__ import annotations

import os
import subprocess
from datetime import date

from vip.config import check_tool, load_config
from vip.templates import PROFILE_SYSTEM_PROMPT, CHANGE_DETECTION_PROMPT


def _get_backend() -> str:
    """Determine which AI backend to use.

    Priority:
    1. VIP_AI_BACKEND env var (explicit override)
    2. Config file setting
    3. Auto-detect: anthropic SDK > claude CLI > copilot CLI
    """
    # Explicit override
    backend = os.environ.get("VIP_AI_BACKEND", "").lower()
    if backend:
        return backend

    # Config file
    config = load_config()
    backend = config.get("ai_backend", "").lower()
    if backend:
        return backend

    # Auto-detect
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if check_tool("claude"):
        return "claude-cli"
    if check_tool("gh") and _copilot_available():
        return "copilot-cli"

    raise RuntimeError(
        "No AI backend available. Options:\n"
        "  1. Install Claude Code CLI\n"
        "  2. Set ANTHROPIC_API_KEY env var (pip install anthropic)\n"
        "  3. Install GitHub Copilot CLI (gh copilot)"
    )


def _copilot_available() -> bool:
    """Check if GitHub Copilot CLI is available."""
    try:
        result = subprocess.run(
            ["gh", "copilot", "--help"],
            capture_output=True, text=True, timeout=5,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def _call_claude_cli(prompt: str, timeout: int = 120) -> str:
    """Call local Claude Code CLI."""
    result = subprocess.run(
        ["claude", "--print", "-p", prompt],
        capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Claude CLI error: {result.stderr.strip()}")
    return result.stdout.strip()


def _call_anthropic_api(prompt: str) -> str:
    """Call Claude API directly via anthropic SDK."""
    try:
        import anthropic
    except ImportError:
        raise RuntimeError(
            "anthropic package not installed. Run: pip install anthropic"
        )

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable not set.")

    client = anthropic.Anthropic(api_key=api_key)
    config = load_config()
    model = config.get("anthropic_model", "claude-sonnet-4-20250514")

    message = client.messages.create(
        model=model,
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text.strip()


def _call_copilot_cli(prompt: str, timeout: int = 120) -> str:
    """Call GitHub Copilot CLI."""
    result = subprocess.run(
        ["gh", "copilot", "suggest", "-t", "shell", prompt],
        capture_output=True, text=True, timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Copilot CLI error: {result.stderr.strip()}")
    return result.stdout.strip()


def _call_backend(prompt: str, backend: str) -> str:
    """Route to the appropriate AI backend."""
    if backend == "claude-cli":
        return _call_claude_cli(prompt)
    elif backend == "anthropic":
        return _call_anthropic_api(prompt)
    elif backend == "copilot-cli":
        return _call_copilot_cli(prompt)
    else:
        raise RuntimeError(f"Unknown AI backend: {backend}")


def get_backend_name() -> str:
    """Get the name of the current AI backend (for display)."""
    try:
        return _get_backend()
    except RuntimeError:
        return "none"


def synthesize_profile(raw_data: str, sources: list[str] | None = None) -> str:
    """Generate a structured Markdown profile from raw data."""
    backend = _get_backend()
    prompt = f"{PROFILE_SYSTEM_PROMPT}\n\nRaw data:\n{raw_data}"

    profile = _call_backend(prompt, backend)

    today = date.today().isoformat()
    footer = f"\n\n---\n*Last updated: {today}*"
    if sources:
        source_list = ", ".join(sources[:10])
        footer += f"\n*Sources: {source_list}*"

    return profile + footer


def detect_changes(old_profile: str, new_data: str) -> str | None:
    """Compare old profile with new data to detect significant changes."""
    try:
        backend = _get_backend()
    except RuntimeError:
        return None

    prompt = CHANGE_DETECTION_PROMPT.format(
        old_profile=old_profile,
        new_data=new_data,
    )

    try:
        output = _call_backend(prompt, backend)
        if "NO_SIGNIFICANT_CHANGES" in output:
            return None
        return output
    except (subprocess.TimeoutExpired, RuntimeError):
        return None
