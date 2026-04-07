"""Tests for profile file management."""

from __future__ import annotations

from vip.profile import (
    list_profiles,
    load_profile,
    profile_exists,
    save_profile,
    search_profiles,
    slugify,
)


def test_slugify_basic():
    assert slugify("Sam Altman") == "sam-altman"


def test_slugify_special_chars():
    assert slugify("Dr. John O'Brien") == "dr-john-obrien"


def test_slugify_extra_spaces():
    assert slugify("  Elon   Musk  ") == "elon-musk"


def test_save_and_load(profiles_dir):
    content = "# Test Person\n\nSome content."
    save_profile("Test Person", content, profiles_dir)
    loaded = load_profile("Test Person", profiles_dir)
    assert loaded == content


def test_load_not_found(profiles_dir):
    result = load_profile("Nobody", profiles_dir)
    assert result is None


def test_list_profiles_empty(profiles_dir):
    result = list_profiles(profiles_dir)
    assert result == []


def test_list_profiles(sample_profiles):
    result = list_profiles(sample_profiles)
    assert len(result) == 2
    names = [p["name"] for p in result]
    assert "Sam Altman" in names
    assert "Elon Musk" in names


def test_list_profiles_has_summary(sample_profiles):
    result = list_profiles(sample_profiles)
    sam = [p for p in result if p["name"] == "Sam Altman"][0]
    assert "CEO of OpenAI" in sam["summary"]


def test_search_profiles(sample_profiles):
    results = search_profiles("OpenAI", sample_profiles)
    assert len(results) == 1
    assert results[0]["name"] == "Sam Altman"


def test_search_no_match(sample_profiles):
    results = search_profiles("nonexistent", sample_profiles)
    assert results == []


def test_search_case_insensitive(sample_profiles):
    results = search_profiles("tesla", sample_profiles)
    assert len(results) == 1
    assert results[0]["name"] == "Elon Musk"


def test_profile_exists(profiles_dir):
    save_profile("Test", "content", profiles_dir)
    assert profile_exists("Test", profiles_dir)
    assert not profile_exists("Nobody", profiles_dir)


def test_load_fuzzy_match(profiles_dir):
    save_profile("Sam Altman", "# Sam Altman\nContent", profiles_dir)
    result = load_profile("sam", profiles_dir)
    assert result is not None
    assert "Sam Altman" in result
