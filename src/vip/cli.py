"""VIP Profile Builder CLI."""

from __future__ import annotations

import itertools
import os
import shutil
import subprocess
import sys
import threading

import click

from vip.config import check_tool, get_profiles_dir
from vip.monitor import read_changelog, run_monitor, unread_count
from vip.profile import (
    delete_profile,
    list_profiles,
    load_profile,
    profile_exists,
    save_profile,
    search_profiles,
    get_profile_path,
)
from vip.resolver import is_url, resolve_from_name, resolve_from_url
from vip.fetchers import twitter as twitter_fetcher
from vip.fetchers import search as search_fetcher
from vip.synthesizer import synthesize_profile


# -- Colors --
CYAN = "cyan"
GREEN = "green"
YELLOW = "yellow"
RED = "red"
DIM = "bright_black"


class Spinner:
    """Simple terminal spinner for long-running operations."""

    def __init__(self, message: str):
        self.message = message
        self._stop = threading.Event()
        self._thread = None

    def __enter__(self):
        self._thread = threading.Thread(target=self._spin, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *args):
        self._stop.set()
        self._thread.join()
        click.echo(f"\r{' ' * (len(self.message) + 4)}\r", nl=False)

    def _spin(self):
        chars = itertools.cycle("⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")
        while not self._stop.is_set():
            click.echo(f"\r{next(chars)} {self.message}", nl=False)
            self._stop.wait(0.1)


def _gather_data(person) -> tuple[str, list[str]]:
    """Gather raw data from all sources for a resolved person."""
    raw_parts = []
    sources = []

    if person.twitter_handle:
        click.secho(f"  Fetching Twitter @{person.twitter_handle}...", fg=DIM)
        twitter_data = twitter_fetcher.fetch_profile(person.twitter_handle)
        if twitter_data and twitter_data.raw_output:
            raw_parts.append(f"=== Twitter (@{person.twitter_handle}) ===\n{twitter_data.raw_output}")
            sources.append(f"https://twitter.com/{person.twitter_handle}")
        elif not twitter_fetcher.is_available():
            click.secho("  (bird CLI not found, skipping Twitter)", fg=YELLOW)

    if person.linkedin_url:
        sources.append(person.linkedin_url)

    if person.raw_snippets:
        raw_parts.append("=== Web Search Results ===")
        raw_parts.extend(person.raw_snippets)

    if len(raw_parts) < 2 and person.name:
        click.secho(f"  Searching the web for {person.name}...", fg=DIM)
        results = search_fetcher.search_person(person.name)
        for r in results:
            raw_parts.append(f"{r.title}\n{r.body}")
            if r.url not in sources:
                sources.append(r.url)

    return "\n\n".join(raw_parts), sources


@click.group()
@click.version_option(package_name="vip-crm")
def main():
    """VIP Profile Builder - Auto-build VIP person profiles from public data."""
    try:
        count = unread_count()
        if count > 0:
            click.secho(f"[{count} new change(s) - run 'vip digest' to view]", fg=YELLOW)
    except Exception:
        pass


@main.command()
@click.argument("query")
@click.option("--company", "-c", help="Company name to help identify the person")
@click.option("--dry-run", is_flag=True, help="Print profile without saving")
@click.option("--no-ai", is_flag=True, help="Dump raw data without AI synthesis")
@click.option("--force", "-f", is_flag=True, help="Overwrite existing profile")
def add(query, company, dry_run, no_ai, force):
    """Add a new VIP profile.

    QUERY can be a name ("Sam Altman") or a URL (https://twitter.com/sama).
    """
    click.secho(f"Resolving {query}...", fg=CYAN)

    if is_url(query):
        with Spinner("Searching for profile..."):
            person = resolve_from_url(query)
        if person.name and not company:
            click.secho(f"  Found: {person.name}", fg=GREEN)
            if person.twitter_handle:
                click.echo(f"  Twitter: @{person.twitter_handle}")
            with Spinner("Enriching profile data..."):
                enriched = resolve_from_name(person.name)
            person.linkedin_url = person.linkedin_url or enriched.linkedin_url
            existing = set(person.raw_snippets)
            for s in enriched.raw_snippets:
                if s not in existing:
                    person.raw_snippets.append(s)
            for u in enriched.other_urls:
                if u not in person.other_urls:
                    person.other_urls.append(u)
    else:
        with Spinner("Searching for profile..."):
            person = resolve_from_name(query, company)

    if not person.name:
        click.secho("Could not identify person. Please provide a name or valid URL.", fg=RED, err=True)
        sys.exit(1)

    click.secho(f"  Name: {person.name}", fg=GREEN)
    if person.twitter_handle:
        click.echo(f"  Twitter: @{person.twitter_handle}")
    if person.linkedin_url:
        click.echo(f"  LinkedIn: {person.linkedin_url}")

    if not force and profile_exists(person.name):
        if not click.confirm(f"Profile for '{person.name}' already exists. Overwrite?"):
            click.echo("Aborted.")
            return

    click.secho("Gathering data...", fg=CYAN)
    raw_data, sources = _gather_data(person)

    if not raw_data.strip():
        click.secho("No data found for this person.", fg=RED, err=True)
        sys.exit(1)

    if no_ai:
        profile = f"# {person.name}\n\n## Raw Data\n\n{raw_data}"
    else:
        if not check_tool("claude"):
            click.secho("Error: claude CLI not found. Use --no-ai to skip synthesis.", fg=RED, err=True)
            sys.exit(1)
        with Spinner("Synthesizing profile with Claude..."):
            profile = synthesize_profile(raw_data, sources)

    if dry_run:
        click.echo("\n" + "=" * 60)
        click.echo(profile)
    else:
        filepath = save_profile(person.name, profile)
        click.secho(f"\nProfile saved: {filepath}", fg=GREEN)


@main.command("list")
def list_cmd():
    """List all VIP profiles."""
    profiles = list_profiles()

    if not profiles:
        click.secho("No profiles yet. Use 'vip add' to create one.", fg=DIM)
        return

    term_width = shutil.get_terminal_size().columns
    name_w = min(30, max(15, term_width // 4))
    date_w = 12
    summary_w = max(20, term_width - name_w - date_w - 4)

    click.secho(f"\n{'Name':<{name_w}} {'Summary':<{summary_w}} {'Updated':<{date_w}}", fg=CYAN, bold=True)
    click.echo("─" * (name_w + summary_w + date_w + 2))
    for p in profiles:
        name = p["name"][:name_w - 1]
        summary = p["summary"][:summary_w - 1]
        click.echo(f"{name:<{name_w}} ", nl=False)
        click.secho(f"{summary:<{summary_w}} ", fg=DIM, nl=False)
        click.echo(f"{p['updated']:<{date_w}}")
    click.echo(f"\nTotal: {len(profiles)} profile(s)")


@main.command()
@click.argument("name")
def show(name):
    """Show a VIP profile."""
    content = load_profile(name)
    if content is None:
        click.secho(f"Profile not found: {name}", fg=RED, err=True)
        sys.exit(1)

    for line in content.split("\n"):
        if line.startswith("# "):
            click.secho(line, fg=CYAN, bold=True)
        elif line.startswith("## "):
            click.secho(line, fg=GREEN, bold=True)
        elif line.startswith("> "):
            click.secho(line, fg=YELLOW)
        elif line.startswith("---"):
            click.secho(line, fg=DIM)
        elif line.startswith("*Last updated") or line.startswith("*Sources"):
            click.secho(line, fg=DIM)
        else:
            click.echo(line)


@main.command()
@click.argument("keyword")
def search(keyword):
    """Search across all profiles."""
    results = search_profiles(keyword)

    if not results:
        click.secho(f"No matches for '{keyword}'.", fg=DIM)
        return

    click.secho(f"Found {len(results)} profile(s) matching '{keyword}':\n", fg=GREEN)
    for r in results:
        click.secho(f"  {r['name']}", fg=CYAN, bold=True)
        for match in r["matches"]:
            click.echo(f"    > {match}")
        click.echo()


@main.command("open")
@click.argument("name")
def open_cmd(name):
    """Open a profile in your default editor."""
    path = get_profile_path(name)
    if not path.exists():
        click.secho(f"Profile not found: {name}", fg=RED, err=True)
        sys.exit(1)

    editor = os.environ.get("EDITOR", "open")
    subprocess.run([editor, str(path)])


@main.command()
@click.argument("name")
@click.option("--no-ai", is_flag=True, help="Dump raw data without AI synthesis")
def update(name, no_ai):
    """Update/refresh an existing profile."""
    content = load_profile(name)
    if content is None:
        click.secho(f"Profile not found: {name}", fg=RED, err=True)
        sys.exit(1)

    from vip.monitor import _extract_metadata
    metadata = _extract_metadata(content)
    person_name = metadata.get("name", name)

    click.secho(f"Refreshing profile for {person_name}...", fg=CYAN)

    with Spinner("Resolving..."):
        person = resolve_from_name(person_name)
    if metadata.get("twitter_handle"):
        person.twitter_handle = person.twitter_handle or metadata["twitter_handle"]
    if metadata.get("linkedin_url"):
        person.linkedin_url = person.linkedin_url or metadata["linkedin_url"]

    raw_data, sources = _gather_data(person)
    if not raw_data.strip():
        click.secho("No new data found.", fg=YELLOW)
        return

    if no_ai:
        profile = f"# {person_name}\n\n## Raw Data\n\n{raw_data}"
    else:
        with Spinner("Re-synthesizing profile..."):
            profile = synthesize_profile(raw_data, sources)

    filepath = save_profile(person_name, profile)
    click.secho(f"Profile updated: {filepath}", fg=GREEN)


@main.command()
@click.argument("name")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation")
def rm(name, yes):
    """Delete a VIP profile."""
    path = get_profile_path(name)
    if not path.exists():
        content = load_profile(name)
        if content is None:
            click.secho(f"Profile not found: {name}", fg=RED, err=True)
            sys.exit(1)

    if not yes:
        if not click.confirm(f"Delete profile '{name}'?"):
            click.echo("Aborted.")
            return

    deleted = delete_profile(name)
    if deleted:
        click.secho(f"Profile deleted: {name}", fg=GREEN)
    else:
        click.secho(f"Could not delete profile: {name}", fg=RED, err=True)


@main.command()
@click.argument("name")
@click.option("--title", help="Set job title")
@click.option("--company", help="Set company")
@click.option("--twitter", help="Set Twitter handle")
@click.option("--linkedin", help="Set LinkedIn URL")
@click.option("--note", help="Append a note")
def edit(name, title, company, twitter, linkedin, note):
    """Edit fields of an existing profile."""
    content = load_profile(name)
    if content is None:
        click.secho(f"Profile not found: {name}", fg=RED, err=True)
        sys.exit(1)

    import re
    modified = False

    if title:
        content = re.sub(r"(\*\*Title:\*\*) .+", rf"\1 {title}", content)
        modified = True

    if company:
        content = re.sub(r"(\*\*Company:\*\*) .+", rf"\1 {company}", content)
        modified = True

    if twitter:
        handle = twitter.lstrip("@")
        content = re.sub(r"(Twitter:) .+", rf"\1 https://twitter.com/{handle}", content)
        modified = True

    if linkedin:
        content = re.sub(r"(LinkedIn:) .+", rf"\1 {linkedin}", content)
        modified = True

    if note:
        if "## Notes" in content:
            content = content.replace("## Notes\n", f"## Notes\n- {note}\n", 1)
        elif "\n---\n" in content:
            content = content.replace("\n---\n", f"\n## Notes\n- {note}\n\n---\n", 1)
        else:
            content = content.rstrip() + f"\n\n## Notes\n- {note}\n"
        modified = True

    if modified:
        save_profile(name, content)
        click.secho(f"Profile updated.", fg=GREEN)
    else:
        click.secho("No changes specified. Use --title, --company, --twitter, --linkedin, or --note.", fg=YELLOW)


@main.command()
def digest():
    """Show recent changes detected by monitoring."""
    entries = read_changelog(days=30)

    if not entries:
        click.secho("No recent changes.", fg=DIM)
        return

    click.secho("Changes in the last 30 days:\n", fg=CYAN, bold=True)
    for e in reversed(entries):
        ts = e.get("timestamp", "")[:10]
        name = e.get("name", "Unknown")
        summary = e.get("summary", "")
        click.secho(f"  [{ts}] {name}", fg=GREEN)
        click.echo(f"    {summary}")
        click.echo()


@main.group()
def monitor():
    """Manage automatic profile monitoring."""
    pass


@monitor.command("start")
def monitor_start():
    """Start automatic monitoring (launchd)."""
    from vip.scheduler import install, status

    try:
        install()
        s = status()
        click.secho(f"Monitor started (every {s['interval_hours']}h)", fg=GREEN)
        click.echo(f"Plist: {s['plist_path']}")
    except FileNotFoundError as e:
        click.secho(f"Error: {e}", fg=RED, err=True)
        sys.exit(1)


@monitor.command("stop")
def monitor_stop():
    """Stop automatic monitoring."""
    from vip.scheduler import uninstall

    uninstall()
    click.secho("Monitor stopped.", fg=GREEN)


@monitor.command("status")
def monitor_status():
    """Show monitor status."""
    from vip.scheduler import status

    s = status()
    state = "running" if s["running"] else "stopped"
    color = GREEN if s["running"] else RED
    click.secho(f"Status: {state}", fg=color)
    click.echo(f"Interval: every {s['interval_hours']}h")
    click.echo(f"Installed: {s['installed']}")
    if s["installed"]:
        click.echo(f"Plist: {s['plist_path']}")


@monitor.command("run")
@click.option("--verbose", "-v", is_flag=True, help="Show detailed progress")
def monitor_run(verbose):
    """Run a monitoring cycle now."""
    click.secho("Running monitor...", fg=CYAN)
    changes = run_monitor(verbose=verbose)

    if changes:
        click.secho(f"\n{len(changes)} profile(s) updated:", fg=GREEN)
        for c in changes:
            click.echo(f"  - {c['name']}: {c['summary']}")
    else:
        click.secho("No significant changes detected.", fg=DIM)


@main.command()
def config():
    """Configure VIP CRM settings."""
    from vip.config import load_config, save_config

    cfg = load_config()
    click.secho("Current config:", fg=CYAN, bold=True)
    click.echo(f"  Profiles dir: {cfg['profiles_dir']}")
    click.echo(f"  Monitor interval: {cfg['monitor_interval_hours']}h")

    from vip.synthesizer import get_backend_name
    bird_ok = check_tool("bird")
    ai_backend = get_backend_name()
    click.echo(f"  Bird CLI: ", nl=False)
    click.secho("available" if bird_ok else "not found", fg=GREEN if bird_ok else RED)
    click.echo(f"  AI backend: ", nl=False)
    click.secho(ai_backend if ai_backend != "none" else "not found", fg=GREEN if ai_backend != "none" else RED)

    if click.confirm("\nChange settings?"):
        new_dir = click.prompt("Profiles directory", default=cfg["profiles_dir"])
        new_interval = click.prompt("Monitor interval (hours)", default=cfg["monitor_interval_hours"], type=int)
        cfg["profiles_dir"] = new_dir
        cfg["monitor_interval_hours"] = new_interval
        save_config(cfg)
        click.secho("Config saved.", fg=GREEN)


if __name__ == "__main__":
    main()
