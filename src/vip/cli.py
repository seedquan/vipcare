"""VIP Profile Builder CLI."""

from __future__ import annotations

import os
import subprocess
import sys

import click

from vip.config import check_tool, get_profiles_dir
from vip.monitor import read_changelog, run_monitor, unread_count
from vip.profile import (
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


def _gather_data(person) -> tuple[str, list[str]]:
    """Gather raw data from all sources for a resolved person."""
    raw_parts = []
    sources = []

    # Twitter via bird CLI
    if person.twitter_handle:
        click.echo(f"  Fetching Twitter data for @{person.twitter_handle}...")
        twitter_data = twitter_fetcher.fetch_profile(person.twitter_handle)
        if twitter_data and twitter_data.raw_output:
            raw_parts.append(f"=== Twitter (@{person.twitter_handle}) ===\n{twitter_data.raw_output}")
            sources.append(f"https://twitter.com/{person.twitter_handle}")
        elif not twitter_fetcher.is_available():
            click.echo("  (bird CLI not found, skipping Twitter)")

    # LinkedIn (from search snippets)
    if person.linkedin_url:
        sources.append(person.linkedin_url)

    # Web search snippets (already gathered during resolution)
    if person.raw_snippets:
        raw_parts.append("=== Web Search Results ===")
        raw_parts.extend(person.raw_snippets)

    # Additional web search if we don't have enough data
    if len(raw_parts) < 2 and person.name:
        click.echo(f"  Searching the web for {person.name}...")
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
    # Show unread changes count
    try:
        count = unread_count()
        if count > 0:
            click.echo(f"[{count} new change(s) detected - run 'vip digest' to view]")
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
    click.echo(f"Resolving {query}...")

    # Step 1: Resolve person
    if is_url(query):
        person = resolve_from_url(query)
        if person.name and not company:
            # Do additional search to enrich data
            click.echo(f"  Found handle: {person.twitter_handle or person.name}")
            enriched = resolve_from_name(person.name)
            person.linkedin_url = person.linkedin_url or enriched.linkedin_url
            person.raw_snippets = enriched.raw_snippets
            person.other_urls = enriched.other_urls
    else:
        person = resolve_from_name(query, company)

    if not person.name:
        click.echo("Could not identify person. Please provide a name or valid URL.", err=True)
        sys.exit(1)

    click.echo(f"  Name: {person.name}")
    if person.twitter_handle:
        click.echo(f"  Twitter: @{person.twitter_handle}")
    if person.linkedin_url:
        click.echo(f"  LinkedIn: {person.linkedin_url}")

    # Check for existing profile
    if not force and profile_exists(person.name):
        if not click.confirm(f"Profile for '{person.name}' already exists. Overwrite?"):
            click.echo("Aborted.")
            return

    # Step 2: Gather raw data
    click.echo("Gathering data...")
    raw_data, sources = _gather_data(person)

    if not raw_data.strip():
        click.echo("No data found for this person.", err=True)
        sys.exit(1)

    # Step 3: Synthesize or dump raw
    if no_ai:
        profile = f"# {person.name}\n\n## Raw Data\n\n{raw_data}"
    else:
        click.echo("Synthesizing profile with Claude...")
        if not check_tool("claude"):
            click.echo("Error: claude CLI not found. Use --no-ai to skip synthesis.", err=True)
            sys.exit(1)
        profile = synthesize_profile(raw_data, sources)

    # Step 4: Save or print
    if dry_run:
        click.echo("\n" + "=" * 60)
        click.echo(profile)
    else:
        filepath = save_profile(person.name, profile)
        click.echo(f"\nProfile saved: {filepath}")


@main.command("list")
def list_cmd():
    """List all VIP profiles."""
    profiles = list_profiles()

    if not profiles:
        click.echo("No profiles yet. Use 'vip add' to create one.")
        return

    click.echo(f"\n{'Name':<25} {'Summary':<40} {'Updated':<12}")
    click.echo("─" * 77)
    for p in profiles:
        name = p["name"][:24]
        summary = p["summary"][:39]
        click.echo(f"{name:<25} {summary:<40} {p['updated']:<12}")
    click.echo(f"\nTotal: {len(profiles)} profile(s)")


@main.command()
@click.argument("name")
def show(name):
    """Show a VIP profile."""
    content = load_profile(name)
    if content is None:
        click.echo(f"Profile not found: {name}", err=True)
        sys.exit(1)

    click.echo(content)


@main.command()
@click.argument("keyword")
def search(keyword):
    """Search across all profiles."""
    results = search_profiles(keyword)

    if not results:
        click.echo(f"No matches for '{keyword}'.")
        return

    click.echo(f"Found {len(results)} profile(s) matching '{keyword}':\n")
    for r in results:
        click.echo(f"  {r['name']} ({r['slug']})")
        for match in r["matches"]:
            click.echo(f"    > {match}")
        click.echo()


@main.command("open")
@click.argument("name")
def open_cmd(name):
    """Open a profile in your default editor."""
    path = get_profile_path(name)
    if not path.exists():
        click.echo(f"Profile not found: {name}", err=True)
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
        click.echo(f"Profile not found: {name}", err=True)
        sys.exit(1)

    # Extract metadata from existing profile
    from vip.monitor import _extract_metadata
    metadata = _extract_metadata(content)
    person_name = metadata.get("name", name)

    click.echo(f"Refreshing profile for {person_name}...")

    # Re-resolve
    person = resolve_from_name(person_name)
    if metadata.get("twitter_handle"):
        person.twitter_handle = person.twitter_handle or metadata["twitter_handle"]
    if metadata.get("linkedin_url"):
        person.linkedin_url = person.linkedin_url or metadata["linkedin_url"]

    # Re-gather and synthesize
    raw_data, sources = _gather_data(person)
    if not raw_data.strip():
        click.echo("No new data found.")
        return

    if no_ai:
        profile = f"# {person_name}\n\n## Raw Data\n\n{raw_data}"
    else:
        click.echo("Re-synthesizing profile...")
        profile = synthesize_profile(raw_data, sources)

    filepath = save_profile(person_name, profile)
    click.echo(f"Profile updated: {filepath}")


@main.command()
def digest():
    """Show recent changes detected by monitoring."""
    entries = read_changelog(days=30)

    if not entries:
        click.echo("No recent changes.")
        return

    click.echo(f"Changes in the last 30 days:\n")
    for e in reversed(entries):
        ts = e.get("timestamp", "")[:10]
        name = e.get("name", "Unknown")
        summary = e.get("summary", "")
        click.echo(f"  [{ts}] {name}")
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
        click.echo(f"Monitor started (every {s['interval_hours']}h)")
        click.echo(f"Plist: {s['plist_path']}")
    except FileNotFoundError as e:
        click.echo(f"Error: {e}", err=True)
        sys.exit(1)


@monitor.command("stop")
def monitor_stop():
    """Stop automatic monitoring."""
    from vip.scheduler import uninstall

    uninstall()
    click.echo("Monitor stopped.")


@monitor.command("status")
def monitor_status():
    """Show monitor status."""
    from vip.scheduler import status

    s = status()
    state = "running" if s["running"] else "stopped"
    click.echo(f"Status: {state}")
    click.echo(f"Interval: every {s['interval_hours']}h")
    click.echo(f"Installed: {s['installed']}")
    if s["installed"]:
        click.echo(f"Plist: {s['plist_path']}")


@monitor.command("run")
@click.option("--verbose", "-v", is_flag=True, help="Show detailed progress")
def monitor_run(verbose):
    """Run a monitoring cycle now."""
    click.echo("Running monitor...")
    changes = run_monitor(verbose=verbose)

    if changes:
        click.echo(f"\n{len(changes)} profile(s) updated:")
        for c in changes:
            click.echo(f"  - {c['name']}: {c['summary']}")
    else:
        click.echo("No significant changes detected.")


@main.command()
def config():
    """Configure VIP CRM settings."""
    from vip.config import load_config, save_config

    cfg = load_config()
    click.echo("Current config:")
    click.echo(f"  Profiles dir: {cfg['profiles_dir']}")
    click.echo(f"  Monitor interval: {cfg['monitor_interval_hours']}h")
    click.echo(f"  Bird CLI: {'available' if check_tool('bird') else 'not found'}")
    click.echo(f"  Claude CLI: {'available' if check_tool('claude') else 'not found'}")

    if click.confirm("\nChange settings?"):
        new_dir = click.prompt("Profiles directory", default=cfg["profiles_dir"])
        new_interval = click.prompt("Monitor interval (hours)", default=cfg["monitor_interval_hours"], type=int)
        cfg["profiles_dir"] = new_dir
        cfg["monitor_interval_hours"] = new_interval
        save_config(cfg)
        click.echo("Config saved.")


if __name__ == "__main__":
    main()
