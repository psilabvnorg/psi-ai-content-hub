from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.services.sources import (
    SOURCE_CATALOG,
    VALID_SOURCES,
    list_sources,
    search_source,
)


# ---------------------------------------------------------------------------
# list_sources
# ---------------------------------------------------------------------------

def test_list_sources_returns_dict_with_sources_key():
    result = list_sources()
    assert "sources" in result


def test_list_sources_returns_5_sources():
    result = list_sources()
    assert len(result["sources"]) == 5


def test_list_sources_each_has_id_and_name():
    result = list_sources()
    for source in result["sources"]:
        assert "id" in source
        assert "name" in source


def test_list_sources_contains_expected_ids():
    result = list_sources()
    ids = {s["id"] for s in result["sources"]}
    assert "google" in ids
    assert "bing" in ids
    assert "unsplash" in ids


def test_list_sources_each_has_required_fields():
    result = list_sources()
    for source in result["sources"]:
        assert "id" in source
        assert "name" in source
        assert "category" in source
        assert "requires_key" in source


# ---------------------------------------------------------------------------
# search_source
# ---------------------------------------------------------------------------

def test_search_source_invalid_source_raises():
    with pytest.raises(ValueError, match="Unknown source"):
        search_source("nonexistent_source_xyz", "cat photos")


def test_search_source_calls_run_pipeline():
    mock_result = {"images": [{"url": "http://example.com/img.jpg", "source": "google"}], "summary": None}
    with patch("app.services.sources.run_pipeline", return_value=mock_result) as mock_pipeline:
        result = search_source("google", "cats", max_results=5, timeout_seconds=15)
    mock_pipeline.assert_called_once()


def test_search_source_enabled_sources_is_list_of_one():
    mock_result = {"images": [], "summary": None}
    with patch("app.services.sources.run_pipeline", return_value=mock_result) as mock_pipeline:
        search_source("bing", "dogs")
    call_kwargs = mock_pipeline.call_args[1]
    assert call_kwargs["enabled_sources"] == ["bing"]


def test_search_source_max_results_passed_to_pipeline():
    mock_result = {"images": [], "summary": None}
    with patch("app.services.sources.run_pipeline", return_value=mock_result) as mock_pipeline:
        search_source("google", "cats", max_results=20)
    call_kwargs = mock_pipeline.call_args[1]
    assert call_kwargs["per_source_limit"] == 20
    assert call_kwargs["top_k"] == 20


def test_search_source_return_structure():
    mock_result = {"images": [{"url": "http://a.com/img.png"}], "summary": "found images"}
    with patch("app.services.sources.run_pipeline", return_value=mock_result):
        result = search_source("google", "nature")
    for key in ("status", "source", "query", "count", "images", "summary"):
        assert key in result


def test_search_source_count_matches_images_list():
    images = [{"url": f"http://a.com/{i}.jpg"} for i in range(3)]
    mock_result = {"images": images, "summary": None}
    with patch("app.services.sources.run_pipeline", return_value=mock_result):
        result = search_source("google", "trees")
    assert result["count"] == 3
    assert len(result["images"]) == 3


def test_search_source_non_list_images_normalized():
    mock_result = {"images": "not-a-list", "summary": None}
    with patch("app.services.sources.run_pipeline", return_value=mock_result):
        result = search_source("google", "sky")
    assert result["images"] == []
    assert result["count"] == 0


def test_search_source_pipeline_exception_propagates():
    with patch("app.services.sources.run_pipeline", side_effect=RuntimeError("pipeline failed")):
        with pytest.raises(RuntimeError, match="pipeline failed"):
            search_source("google", "test")


def test_search_source_source_field_matches_input():
    mock_result = {"images": [], "summary": None}
    with patch("app.services.sources.run_pipeline", return_value=mock_result):
        result = search_source("bing", "ocean")
    assert result["source"] == "bing"
    assert result["query"] == "ocean"
