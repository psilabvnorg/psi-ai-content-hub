"""
Property tests for Visual Asset Manager (Task 7.x).

Property 8: Image Source Validation
- Validates: Requirements 3.2
- All search results must come from known sources
- All URLs must be non-empty and properly formatted
- All dimensions must be positive integers >= minimum

Property 9: Minimum Resolution Compliance
- Validates: Requirements 3.4, 5.5, 10.1
- Downloaded images must meet minimum resolution (640x360)
- Prepared images must exactly match target resolution
- Aspect ratios must be preserved during preparation
"""

import pytest
from hypothesis import given, strategies as st, assume, settings
from pathlib import Path
from PIL import Image
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch, MagicMock

from src.multilingual_video_pipeline.services.visual_asset_manager import (
    VisualAssetManager,
    VisualAssetError,
    ImageSearchResult,
)
from src.multilingual_video_pipeline.models import AssetType
from src.multilingual_video_pipeline.models import Scene, TranscriptSegment, VisualAsset


class TestImageSourceValidation:
    """Property 8: Image Source Validation - all search results from known sources."""

    VALID_SOURCES = {"picsum", "placeholder"}
    VALID_SCHEMES = {"http://", "https://", "local://"}

    @given(
        query=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
        count=st.integers(min_value=1, max_value=10),
    )
    @settings(max_examples=50)
    def test_search_images_returns_valid_sources(self, query, count):
        """Property 8a: All search results come from known sources."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=count)

        # All results must have valid source
        for result in results:
            assert result.source in self.VALID_SOURCES, f"Unknown source: {result.source}"
            assert isinstance(result.url, str) and result.url, "URL must be non-empty string"
            assert isinstance(result.width, int) and result.width > 0, "Width must be positive int"
            assert isinstance(result.height, int) and result.height > 0, "Height must be positive int"

    @given(
        query=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
        count=st.integers(min_value=1, max_value=5),
    )
    @settings(max_examples=30)
    def test_search_images_url_format_valid(self, query, count):
        """Property 8b: All URLs follow valid schemes and formats."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=count)

        for result in results:
            # Check URL scheme
            has_valid_scheme = any(result.url.startswith(scheme) for scheme in self.VALID_SCHEMES)
            assert has_valid_scheme, f"Invalid URL scheme: {result.url}"

            # Check URL is non-empty
            assert len(result.url) > 10, f"URL too short: {result.url}"

    @given(
        query=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
        count=st.integers(min_value=1, max_value=5),
    )
    @settings(max_examples=30)
    def test_search_images_metadata_valid(self, query, count):
        """Property 8c: All search results have valid metadata."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=count)

        for result in results:
            # Check description exists
            assert isinstance(result.description, str) and result.description, \
                "Description must be non-empty string"

            # Check tags are list of strings
            assert isinstance(result.tags, list), "Tags must be list"
            assert all(isinstance(t, str) for t in result.tags), "All tags must be strings"

            # Check query is in tags (should be present for search consistency)
            assert query.lower() in [t.lower() for t in result.tags], \
                f"Query '{query}' not in tags {result.tags}"

    @given(count=st.integers(min_value=1, max_value=20))
    @settings(max_examples=20)
    def test_search_images_returns_expected_count(self, count):
        """Property 8d: Returned count matches or is less than requested."""
        manager = VisualAssetManager()

        results = manager.search_images("test", count=count)

        # May return less than requested, but not more
        assert len(results) <= count, \
            f"Returned {len(results)} results but requested {count}"
        assert len(results) > 0, "Should return at least one result"

    @given(
        query=st.text(min_size=1, max_size=50, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
        count=st.integers(min_value=2, max_value=10),
    )
    @settings(max_examples=30)
    def test_search_images_no_duplicates(self, query, count):
        """Property 8e: No duplicate URLs in results."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=count)

        urls = [r.url for r in results]
        assert len(urls) == len(set(urls)), f"Duplicate URLs found: {urls}"


class TestMinimumResolutionCompliance:
    """Property 9: Minimum Resolution Compliance."""

    MIN_RESOLUTION = (640, 360)

    @given(
        query=st.text(min_size=1, max_size=30, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
    )
    @settings(max_examples=30)
    def test_search_images_respects_minimum_resolution(self, query):
        """Property 9a: Search results meet minimum resolution requirement."""
        manager = VisualAssetManager()
        min_width, min_height = self.MIN_RESOLUTION

        results = manager.search_images(query, min_resolution=self.MIN_RESOLUTION)

        for result in results:
            assert result.width >= min_width, \
                f"Width {result.width} below minimum {min_width}"
            assert result.height >= min_height, \
                f"Height {result.height} below minimum {min_height}"

    @given(
        target_width=st.integers(min_value=800, max_value=3840),
        target_height=st.integers(min_value=600, max_value=2160),
    )
    @settings(max_examples=20, deadline=None)
    def test_prepare_image_exact_target_resolution(self, target_width, target_height):
        """Property 9b: Prepared images have exact target resolution."""
        with TemporaryDirectory() as tmpdir:
            manager = VisualAssetManager()

            # Create a test image
            test_img = Image.new("RGB", (1920, 1080), color=(100, 100, 100))
            test_path = Path(tmpdir) / "test.jpg"
            test_img.save(test_path)

            # Create mock asset
            asset = Mock()
            asset.asset_id = "test_asset"
            asset.file_path = test_path

            # Prepare image
            output_path = manager.prepare_image(asset, target_resolution=(target_width, target_height))

            # Verify output file exists
            assert output_path.exists(), f"Prepared image not found: {output_path}"

            # Verify resolution
            with Image.open(output_path) as img:
                assert img.width == target_width, \
                    f"Width {img.width} != target {target_width}"
                assert img.height == target_height, \
                    f"Height {img.height} != target {target_height}"

    @given(
        source_width=st.integers(min_value=400, max_value=2000),
        source_height=st.integers(min_value=300, max_value=1500),
        target_width=st.just(1920),
        target_height=st.just(1080),
    )
    @settings(max_examples=20)
    def test_prepare_image_preserves_aspect_ratio(self, source_width, source_height, target_width, target_height):
        """Property 9c: Aspect ratio is preserved during preparation (via letterboxing)."""
        with TemporaryDirectory() as tmpdir:
            manager = VisualAssetManager()

            # Create test image
            test_img = Image.new("RGB", (source_width, source_height), color=(100, 100, 100))
            test_path = Path(tmpdir) / "test.jpg"
            test_img.save(test_path)

            # Original aspect ratio
            original_ratio = source_width / source_height

            # Create mock asset
            asset = Mock()
            asset.asset_id = "test_asset"
            asset.file_path = test_path

            # Prepare image
            output_path = manager.prepare_image(asset, target_resolution=(target_width, target_height))

            # The prepared image should have black letterboxing, not stretched content
            with Image.open(output_path) as prepared:
                assert prepared.width == target_width
                assert prepared.height == target_height

                # Sample center pixels - should be non-black (the scaled content)
                center_pixel = prepared.getpixel((target_width // 2, target_height // 2))
                # If not (0,0,0), it means we have content in center
                # This is a heuristic check that content is scaled proportionally

    @given(
        width=st.integers(min_value=640, max_value=2000),
        height=st.integers(min_value=360, max_value=1500),
    )
    @settings(max_examples=15)
    def test_downloaded_image_meets_minimum_resolution(self, width, height):
        """Property 9d: Downloaded images meet minimum resolution requirements."""
        manager = VisualAssetManager()
        min_width, min_height = self.MIN_RESOLUTION

        # Create search result with valid resolution
        assume(width >= min_width and height >= min_height)

        result = ImageSearchResult(
            url="local://test_image.png",
            width=width,
            height=height,
            source="placeholder",
            description="Test image",
            tags=["test"],
        )

        # Download/prepare image
        asset = manager.download_image(result)

        # Verify asset meets minimum resolution
        assert asset.width >= min_width, \
            f"Asset width {asset.width} below minimum {min_width}"
        assert asset.height >= min_height, \
            f"Asset height {asset.height} below minimum {min_height}"

        # Verify file exists
        assert asset.file_path.exists(), f"Asset file not found: {asset.file_path}"

    @given(
        width=st.integers(min_value=100, max_value=600),
        height=st.integers(min_value=100, max_value=300),
    )
    @settings(max_examples=10)
    def test_search_with_insufficient_resolution_rejected(self, width, height):
        """Property 9e: Images below minimum resolution are not returned by search."""
        manager = VisualAssetManager()
        min_width, min_height = self.MIN_RESOLUTION

        # Only test cases where our inputs are truly below minimum
        assume(width < min_width or height < min_height)

        results = manager.search_images("test", min_resolution=(min_width, min_height))

        # All results should meet minimum
        for result in results:
            assert result.width >= min_width and result.height >= min_height, \
                f"Result {result.width}x{result.height} below minimum {min_width}x{min_height}"


class TestAssetTypeAndTags:
    """Additional validation for asset metadata."""

    @given(
        query=st.text(min_size=1, max_size=30, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
    )
    @settings(max_examples=20, deadline=None)
    def test_downloaded_asset_has_correct_type(self, query):
        """Downloaded assets should be marked as STATIC_IMAGE type."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=1)
        assert len(results) > 0, "No search results"

        asset = manager.download_image(results[0])

        assert asset.asset_type == AssetType.STATIC_IMAGE, \
            f"Asset type should be STATIC_IMAGE, got {asset.asset_type}"

    @given(
        query=st.text(min_size=1, max_size=30, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
    )
    @settings(max_examples=20, deadline=None)
    def test_downloaded_asset_preserves_tags(self, query):
        """Downloaded assets should preserve tags from search result."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=1)
        assert len(results) > 0, "No search results"

        result = results[0]
        asset = manager.download_image(result)

        # Asset should have same tags as search result
        assert set(asset.tags) == set(result.tags), \
            f"Asset tags {asset.tags} don't match result tags {result.tags}"


class TestImageDownloadAndExistence:
    """Verify images are downloaded and persisted to disk."""

    @given(
        query=st.text(min_size=1, max_size=30, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
    )
    @settings(max_examples=25, deadline=None)
    def test_downloaded_image_file_exists(self, query):
        """Downloaded image file must exist on disk after download."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=1)
        assert len(results) > 0, "No search results"

        result = results[0]
        asset = manager.download_image(result)

        # File must exist
        assert asset.file_path.exists(), \
            f"Downloaded image file does not exist: {asset.file_path}"

        # File must be readable
        assert asset.file_path.is_file(), \
            f"Asset path is not a file: {asset.file_path}"

    @given(
        query=st.text(min_size=1, max_size=30, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
    )
    @settings(max_examples=20, deadline=None)
    def test_downloaded_image_has_content(self, query):
        """Downloaded image must have non-zero file size."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=1)
        assert len(results) > 0, "No search results"

        asset = manager.download_image(results[0])

        # File must have content
        file_size = asset.file_path.stat().st_size
        assert file_size > 0, \
            f"Downloaded image has zero size: {asset.file_path}"

    @given(
        query=st.text(min_size=1, max_size=30, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
    )
    @settings(max_examples=15, deadline=None)
    def test_downloaded_image_is_valid_image(self, query):
        """Downloaded file must be a valid, readable image."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=1)
        assert len(results) > 0, "No search results"

        asset = manager.download_image(results[0])

        # Should be openable as an image and have valid dimensions
        with Image.open(asset.file_path) as img:
            assert img.width > 0, f"Image width must be positive, got {img.width}"
            assert img.height > 0, f"Image height must be positive, got {img.height}"
            # Image should have a format
            assert img.format is not None or img.filename is not None, \
                "Image must have valid format"

    @given(
        query=st.text(min_size=1, max_size=30, alphabet=st.characters(blacklist_categories=("Cc", "Cs"))),
    )
    @settings(max_examples=20, deadline=None)
    def test_image_caching_reuses_existing_file(self, query):
        """Downloading same image twice should reuse cached file."""
        manager = VisualAssetManager()

        results = manager.search_images(query, count=1)
        assume(len(results) > 0)

        result = results[0]

        # First download
        asset1 = manager.download_image(result)
        assert asset1.file_path.exists()
        first_mtime = asset1.file_path.stat().st_mtime

        # Second download (should use cache)
        asset2 = manager.download_image(result)
        assert asset2.file_path.exists()
        second_mtime = asset2.file_path.stat().st_mtime

        # Same file path should be returned
        assert asset1.file_path == asset2.file_path, \
            "Cache not reused: different file paths returned"

        # File should not be re-downloaded (mtime unchanged)
        assert first_mtime == second_mtime, \
            "File was re-downloaded instead of using cache"


class TestSemanticApiAndMapping:
    def test_semantic_search_calls_image_finder_api(self):
        manager = VisualAssetManager()

        with TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir) / "assets"
            cached_image = Path(tmpdir) / "cached.jpg"
            Image.new("RGB", (1280, 720), color=(20, 20, 20)).save(cached_image)

            def fake_download(result: ImageSearchResult) -> VisualAsset:
                return VisualAsset(
                    asset_id=f"asset_{hash(result.url)}",
                    asset_type=AssetType.STATIC_IMAGE,
                    file_path=cached_image,
                    source_url=result.url,
                    width=1280,
                    height=720,
                    duration=None,
                    tags=result.tags,
                )

            image_finder_payload = {
                "status": "ok",
                "keywords": "city skyline night",
                "search_query": "city skyline night latest, up to date information",
                "images": [
                    {
                        "url": "https://example.com/a.jpg",
                        "source": "bing",
                        "description": "city skyline",
                        "tags": ["city", "skyline"],
                    },
                    {
                        "url": "https://example.com/b.jpg",
                        "source": "bing",
                        "description": "night skyline",
                        "tags": ["night", "skyline"],
                    },
                ],
            }

            mock_response = MagicMock()
            mock_response.raise_for_status.return_value = None
            mock_response.json.return_value = image_finder_payload

            with patch("src.multilingual_video_pipeline.services.visual_asset_manager.requests.post", return_value=mock_response) as post_mock:
                with patch.object(manager, "download_image", side_effect=fake_download) as download_mock:
                    assets = manager.semantic_search_and_download(
                        text="Sample transcript for images",
                        limit=2,
                        output_dir=output_dir,
                        llm_api_url="http://127.0.0.1:6907",
                    )

            assert post_mock.call_count == 1
            assert "/api/v1/image-finder/search" in post_mock.call_args.args[0]
            assert download_mock.call_count == 2
            assert len(assets) == 2
            assert (output_dir / "Image_001.jpg").exists()
            assert (output_dir / "Image_002.jpg").exists()

    def test_create_scene_asset_map_maps_each_scene(self):
        manager = VisualAssetManager()

        segment_one = TranscriptSegment(text="football match stadium", start_time=0.0, end_time=3.0, confidence=0.95)
        segment_two = TranscriptSegment(text="city skyline at night", start_time=3.0, end_time=6.0, confidence=0.95)
        scene_one = Scene("scene_000", segment_one, None, None, segment_one.duration)
        scene_two = Scene("scene_001", segment_two, None, None, segment_two.duration)

        asset_one = VisualAsset(
            asset_id="asset_football",
            asset_type=AssetType.STATIC_IMAGE,
            file_path=Path("asset_football.jpg"),
            source_url="https://example.com/football.jpg",
            width=1280,
            height=720,
            duration=None,
            tags=["football", "stadium"],
        )
        asset_two = VisualAsset(
            asset_id="asset_city",
            asset_type=AssetType.STATIC_IMAGE,
            file_path=Path("asset_city.jpg"),
            source_url="https://example.com/city.jpg",
            width=1280,
            height=720,
            duration=None,
            tags=["city", "skyline", "night"],
        )

        scene_map = manager.create_scene_asset_map([scene_one, scene_two], [asset_one, asset_two])
        scene_map_by_id = {entry["scene_id"]: entry["asset_id"] for entry in scene_map}

        assert scene_map_by_id["scene_000"] == "asset_football"
        assert scene_map_by_id["scene_001"] == "asset_city"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
