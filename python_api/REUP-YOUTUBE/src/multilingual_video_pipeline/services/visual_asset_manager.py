"""Visual asset management for scene alignment.

Features delivered for task 7.1:
- search_images with multiple lightweight sources (picsum + local placeholders)
- download_image with hashing + caching
- prepare_image for resizing/letterboxing
- match_images_to_scenes for simple contextual alignment
"""

import hashlib
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from PIL import Image

from ..config import get_settings
from ..logging_config import LoggerMixin
from ..models import Scene, VisualAsset, AssetType
from ..utils.file_utils import ensure_directory, safe_filename


class VisualAssetError(Exception):
    """Raised for visual asset related failures."""


@dataclass
class ImageSearchResult:
    """Lightweight search result before download."""

    url: str
    width: int
    height: int
    source: str
    description: str
    tags: List[str]


class VisualAssetManager(LoggerMixin):
    """Manage discovery, caching, and preparation of visual assets."""

    def __init__(self, settings=None):
        self.settings = settings or get_settings()
        self.cache_dir = ensure_directory(self.settings.cache_dir / "images")

    def save_asset_info(self, asset_info: Dict[str, Any], output_dir: Path) -> Path:
        """
        Save visual asset information to JSON file in output directory.
        
        Args:
            asset_info: Dictionary with asset metadata and mappings
            output_dir: Directory to save the asset info file
            
        Returns:
            Path to saved asset info file
            
        Raises:
            VisualAssetError: If save operation fails
        """
        try:
            import json
            
            output_dir = Path(output_dir)
            ensure_directory(output_dir)
            
            asset_info_path = output_dir / "asset_info.json"
            
            with open(asset_info_path, 'w', encoding='utf-8') as f:
                json.dump(asset_info, f, indent=2)
            
            self.logger.info(
                "Asset info saved to output directory",
                path=str(asset_info_path),
                total_assets=asset_info.get('total_assets', 0)
            )
            
            return asset_info_path
            
        except Exception as e:
            self.logger.error(
                "Failed to save asset info",
                error=str(e),
                output_dir=str(output_dir)
            )
            raise VisualAssetError(f"Failed to save asset info: {e}")

    def prepare_for_remotion(self, assets: List[VisualAsset], output_dir: Path) -> Dict[str, Any]:
        """
        Copy and rename assets for Remotion rendering.

        Files are written to:
        - image/Intro.jpg
        - image/01.jpg ... image/10.jpg
        """
        if not assets:
            raise VisualAssetError("No visual assets available for Remotion preparation")

        image_dir = ensure_directory(Path(output_dir) / "image")

        # Intro image from top-ranked item.
        intro_asset = assets[0]
        intro_target = image_dir / "Intro.jpg"
        self._copy_as_jpeg(intro_asset.file_path, intro_target)

        content_images: List[str] = []
        for idx, asset in enumerate(assets[:10], start=1):
            target = image_dir / f"{idx:02d}.jpg"
            self._copy_as_jpeg(asset.file_path, target)
            content_images.append(str(target))

        return {
            "intro_image": str(intro_target),
            "content_images": content_images,
            "total_images": len(content_images),
            "image_dir": str(image_dir),
        }

    # ---------------------------
    # Discovery
    # ---------------------------
    def search_images(
        self,
        query: str,
        count: int = 5,
        min_resolution: Tuple[int, int] = (640, 360),
    ) -> List[ImageSearchResult]:
        """Search images using multiple lightweight sources."""

        if not query.strip():
            raise VisualAssetError("Query cannot be empty")

        picsum = self._search_picsum(query, count, min_resolution)
        placeholders = self._fallback_placeholders(query, max(1, count // 2), min_resolution)

        results = picsum + placeholders
        # Deduplicate by URL
        seen = set()
        unique_results = []
        for item in results:
            if item.url in seen:
                continue
            seen.add(item.url)
            unique_results.append(item)

        self.logger.info(
            "Images discovered",
            query=query,
            results=len(unique_results),
            sources=list({r.source for r in unique_results}),
        )
        return unique_results[:count]

    def _search_picsum(
        self, query: str, count: int, min_resolution: Tuple[int, int]
    ) -> List[ImageSearchResult]:
        """Generate deterministic picsum seeds to avoid API keys."""

        width, height = max(min_resolution[0], 640), max(min_resolution[1], 360)
        base_seed = hashlib.md5(query.encode()).hexdigest()[:10]
        results = []
        for idx in range(count):
            seed = f"{base_seed}-{idx}"
            url = f"https://picsum.photos/seed/{seed}/{width}/{height}"
            results.append(
                ImageSearchResult(
                    url=url,
                    width=width,
                    height=height,
                    source="picsum",
                    description=f"Placeholder for {query} ({idx})",
                    tags=[query],
                )
            )
        return results

    def _fallback_placeholders(
        self, query: str, count: int, min_resolution: Tuple[int, int]
    ) -> List[ImageSearchResult]:
        """Create local placeholder entries to guarantee availability."""

        width, height = max(min_resolution[0], 640), max(min_resolution[1], 360)
        results = []
        for idx in range(count):
            seed = f"placeholder-{hashlib.md5(f'{query}-{idx}'.encode()).hexdigest()}"
            url = f"local://{seed}.png"
            results.append(
                ImageSearchResult(
                    url=url,
                    width=width,
                    height=height,
                    source="placeholder",
                    description=f"Local placeholder for {query} ({idx})",
                    tags=[query, "placeholder"],
                )
            )
        return results

    # ---------------------------
    # Download & caching
    # ---------------------------
    def download_image(
        self,
        result: ImageSearchResult,
        timeout: int = 15,
    ) -> VisualAsset:
        """Download image and return as VisualAsset; uses cache when possible."""

        if result.url.startswith("local://"):
            file_path = self._generate_placeholder_file(result)
            width, height = result.width, result.height
        else:
            file_path = self._cached_path(result.url)
            if not file_path.exists():
                self._stream_download(result.url, file_path, timeout)
            width, height = self._probe_image_size(file_path, result.width, result.height)

        asset = VisualAsset(
            asset_id=self._asset_id(result.url),
            asset_type=AssetType.STATIC_IMAGE,
            file_path=file_path,
            source_url=None if result.url.startswith("local://") else result.url,
            width=width,
            height=height,
            duration=None,
            tags=result.tags,
        )

        self.logger.info(
            "Image cached",
            asset_id=asset.asset_id,
            path=str(file_path),
            source=result.source,
        )
        return asset

    def _cached_path(self, url: str) -> Path:
        hashed = hashlib.md5(url.encode()).hexdigest()
        return self.cache_dir / f"{hashed}.jpg"

    def _asset_id(self, url: str) -> str:
        return hashlib.sha1(url.encode()).hexdigest()

    def _stream_download(self, url: str, dst: Path, timeout: int) -> None:
        try:
            response = requests.get(url, stream=True, timeout=timeout)
            response.raise_for_status()
            ensure_directory(dst.parent)
            with open(dst, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        except Exception as exc:
            self.logger.error("Image download failed", url=url, error=str(exc))
            raise VisualAssetError(f"Failed to download {url}: {exc}")

    def _probe_image_size(self, file_path: Path, fallback_w: int, fallback_h: int) -> Tuple[int, int]:
        try:
            with Image.open(file_path) as img:
                return img.width, img.height
        except Exception as exc:
            self.logger.warning("Failed to probe image size, using fallback", file=str(file_path), error=str(exc))
            return fallback_w, fallback_h

    def _generate_placeholder_file(self, result: ImageSearchResult) -> Path:
        file_path = self._cached_path(result.url)
        if file_path.exists():
            return file_path

        ensure_directory(file_path.parent)
        img = Image.new("RGB", (result.width, result.height), color=(240, 240, 240))
        img.save(file_path, format="PNG")
        return file_path

    def _copy_as_jpeg(self, source: Path, destination: Path) -> None:
        """Copy image to destination and normalize format to JPEG."""
        ensure_directory(destination.parent)
        try:
            with Image.open(source) as image:
                rgb = image.convert("RGB")
                rgb.save(destination, format="JPEG", quality=92)
        except Exception:
            shutil.copy2(source, destination)

    # ---------------------------
    # Preparation
    # ---------------------------
    def prepare_image(
        self,
        asset: VisualAsset,
        target_resolution: Tuple[int, int] = (1920, 1080),
        format: str = "JPEG",
        quality: int = 90,
    ) -> Path:
        """Resize and letterbox to target resolution; returns new path in cache."""

        prepared_dir = ensure_directory(self.cache_dir / "prepared")
        target_w, target_h = target_resolution

        output_name = safe_filename(f"{asset.asset_id}_{target_w}x{target_h}.{format.lower()}")
        output_path = prepared_dir / output_name

        if output_path.exists():
            return output_path

        try:
            with Image.open(asset.file_path) as img:
                img = img.convert("RGB")
                img_ratio = img.width / img.height
                target_ratio = target_w / target_h

                if img_ratio > target_ratio:
                    new_w = target_w
                    new_h = int(target_w / img_ratio)
                else:
                    new_h = target_h
                    new_w = int(target_h * img_ratio)

                resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

                canvas = Image.new("RGB", (target_w, target_h), color=(0, 0, 0))
                paste_x = (target_w - new_w) // 2
                paste_y = (target_h - new_h) // 2
                canvas.paste(resized, (paste_x, paste_y))
                canvas.save(output_path, format=format, quality=quality)
        except Exception as exc:
            self.logger.error("Image preparation failed", asset_id=asset.asset_id, error=str(exc))
            raise VisualAssetError(f"Failed to prepare image {asset.asset_id}: {exc}")

        return output_path

    # ---------------------------
    # Alignment
    # ---------------------------
    def match_images_to_scenes(
        self,
        scenes: Iterable[Scene],
        assets: List[VisualAsset],
    ) -> Dict[str, VisualAsset]:
        """Assign best-fit assets to scenes using simple scoring."""

        asset_by_scene: Dict[str, VisualAsset] = {}

        for scene in scenes:
            best = None
            best_score = -1.0
            scene_tokens = self._tokenize(scene.transcript_segment.text)
            for asset in assets:
                score = self._score_asset(scene, scene_tokens, asset)
                if score > best_score:
                    best_score = score
                    best = asset
            if best:
                asset_by_scene[scene.scene_id] = best
                self.logger.debug(
                    "Scene matched",
                    scene_id=scene.scene_id,
                    asset_id=best.asset_id,
                    score=round(best_score, 3),
                )
            else:
                self.logger.warning("No asset matched for scene", scene_id=scene.scene_id)

        return asset_by_scene

    def create_scene_asset_map(
        self,
        scenes: Iterable[Scene],
        assets: List[VisualAsset],
    ) -> List[Dict[str, str]]:
        """Create serializable scene-to-asset mapping for downstream stages."""
        scene_list = list(scenes)
        matched = self.match_images_to_scenes(scene_list, assets)
        return [
            {"scene_id": scene.scene_id, "asset_id": matched[scene.scene_id].asset_id}
            for scene in scene_list
            if scene.scene_id in matched
        ]

    def _tokenize(self, text: str) -> List[str]:
        return [t.lower() for t in text.split() if t]

    def _score_asset(self, scene: Scene, scene_tokens: List[str], asset: VisualAsset) -> float:
        # Orientation preference
        scene_ratio = scene.transcript_segment.duration / max(scene.transcript_segment.duration, 0.001)
        _ = scene_ratio  # keeps lints silent; ratio currently unused but left for future weighting

        asset_tokens = [t.lower() for t in asset.tags]
        overlap = len(set(scene_tokens) & set(asset_tokens))

        # Aspect ratio proximity
        asset_ratio = asset.width / max(asset.height, 1)
        target_ratio = 16 / 9
        ratio_penalty = abs(asset_ratio - target_ratio)

        tie_break_seed = f"{scene.scene_id}:{asset.asset_id}"
        tie_break_bonus = (int(hashlib.md5(tie_break_seed.encode()).hexdigest()[:6], 16) % 50) / 1000.0

        return overlap * 1.5 + (1 - ratio_penalty) + tie_break_bonus

    # ---------------------------
    # Semantic search (Ollama → Bing → Download)
    # ---------------------------
    def semantic_search_and_download(
        self,
        text: str,
        words: int = 15,
        limit: int = 5,
        output_dir: Path | str = "temp/semantic-search",
        llm_api_url: Optional[str] = None,
        ollama_url: str = "http://172.18.96.1:11434",
        model: str = "deepseek-r1:8b",
        timeout_seconds: int = 300,
        lang: str = "en",
    ) -> List[VisualAsset]:
        """Find images via ImageFinder API, then download locally."""
        if not text or not text.strip():
            raise VisualAssetError("Input text cannot be empty")

        if llm_api_url is None:
            llm_api_url = getattr(self.settings, "image_finder_api_url", "http://127.0.0.1:6907")

        try:
            finder_payload = self._search_with_image_finder_api(
                text=text,
                llm_api_url=llm_api_url,
                limit=limit,
                model=model,
                target_words=words,
                lang=lang,
                timeout_seconds=timeout_seconds,
            )
            assets = self._download_image_finder_results(
                finder_payload=finder_payload,
                output_dir=Path(output_dir),
                limit=limit,
            )
            if assets:
                return assets
            self.logger.warning("ImageFinder API returned no images, falling back to local downloader")
        except Exception as exc:
            self.logger.warning(
                "ImageFinder API search failed, falling back to local semantic flow",
                error=str(exc),
            )

        return self._semantic_search_local(
            text=text,
            words=words,
            limit=limit,
            output_dir=output_dir,
            llm_api_url=llm_api_url,
            ollama_url=ollama_url,
            model=model,
            timeout_seconds=timeout_seconds,
            lang=lang,
        )

    def _search_with_image_finder_api(
        self,
        text: str,
        llm_api_url: str,
        limit: int,
        model: str,
        target_words: int,
        lang: str,
        timeout_seconds: int,
    ) -> Dict[str, Any]:
        payload = {
            "text": text,
            "number_of_images": limit,
            "target_words": target_words,
            "model": model,
            "lang": lang,
            "timeout_seconds": min(timeout_seconds, 120),
        }
        response = requests.post(
            f"{llm_api_url}/api/v1/image-finder/search",
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        response_payload = response.json()
        if not isinstance(response_payload, dict):
            raise VisualAssetError("Unexpected ImageFinder API response payload")
        return response_payload

    def _download_image_finder_results(
        self,
        finder_payload: Dict[str, Any],
        output_dir: Path,
        limit: int,
    ) -> List[VisualAsset]:
        image_items = finder_payload.get("images")
        if not isinstance(image_items, list):
            raise VisualAssetError("ImageFinder response missing 'images' list")

        keywords = finder_payload.get("keywords")
        fallback_tag = keywords if isinstance(keywords, str) and keywords.strip() else "semantic-search"
        ensure_directory(output_dir)

        assets: List[VisualAsset] = []
        for index, item in enumerate(image_items[:limit], start=1):
            if not isinstance(item, dict):
                continue
            image_url = item.get("url")
            if not isinstance(image_url, str) or not image_url.strip():
                continue

            tags = item.get("tags")
            normalized_tags = (
                [str(tag) for tag in tags if isinstance(tag, str) and tag.strip()]
                if isinstance(tags, list)
                else []
            )
            if not normalized_tags:
                normalized_tags = [fallback_tag]

            source = item.get("source")
            description = item.get("description")

            search_result = ImageSearchResult(
                url=image_url.strip(),
                width=640,
                height=360,
                source=source if isinstance(source, str) and source.strip() else "bing",
                description=description if isinstance(description, str) and description.strip() else fallback_tag,
                tags=normalized_tags,
            )
            downloaded = self.download_image(search_result)

            suffix = downloaded.file_path.suffix if downloaded.file_path.suffix else ".jpg"
            staged_file = output_dir / f"Image_{index:03d}{suffix}"
            shutil.copy2(downloaded.file_path, staged_file)
            width, height = self._probe_image_size(staged_file, downloaded.width, downloaded.height)

            assets.append(
                VisualAsset(
                    asset_id=downloaded.asset_id,
                    asset_type=AssetType.STATIC_IMAGE,
                    file_path=staged_file,
                    source_url=image_url,
                    width=width,
                    height=height,
                    duration=None,
                    tags=normalized_tags,
                )
            )
        self.logger.info("ImageFinder download completed", count=len(assets), directory=str(output_dir))
        return assets

    def _semantic_search_local(
        self,
        text: str,
        words: int,
        limit: int,
        output_dir: Path | str,
        llm_api_url: str,
        ollama_url: str,
        model: str,
        timeout_seconds: int,
        lang: str,
    ) -> List[VisualAsset]:
        summary: Optional[str] = None
        try:
            summary = self._summarize_with_llm_api(
                text=text,
                llm_api_url=llm_api_url,
                model=model,
                target_words=words,
                timeout_seconds=timeout_seconds,
            )
        except Exception as exc:
            self.logger.warning("LLM API summarization failed, falling back to Ollama", error=str(exc))

        if not summary:
            summary = self._summarize_with_ollama(
                text=text,
                ollama_url=ollama_url,
                model=model,
                target_words=words,
                timeout_seconds=timeout_seconds,
            )

        phrase_by_lang = {
            "en": "latest, up to date information",
            "vi": "thông tin mới nhất",
            "ja": "最新情報",
            "de": "German",
        }
        phrase = phrase_by_lang.get(lang.lower(), phrase_by_lang["en"])
        search_query = f"{summary} {phrase}"
        self.logger.info("Local fallback search query prepared", query=search_query)

        try:
            from bing_image_downloader import downloader  # type: ignore
        except Exception as exc:
            raise VisualAssetError(
                "bing-image-downloader not installed. Install with: pip install bing-image-downloader"
            ) from exc

        output_path = Path(output_dir)
        ensure_directory(output_path)

        downloader.download(
            query=search_query,
            limit=limit,
            output_dir=str(output_path),
            adult_filter_off=True,
            force_replace=False,
            timeout=60,
            filter="photo",
            verbose=True,
        )

        image_dir = output_path / search_query
        assets: List[VisualAsset] = []
        if image_dir.exists():
            image_files = sorted(image_dir.glob("Image_*.*"))
            for img_path in image_files:
                width, height = self._probe_image_size(img_path, 640, 360)
                asset_id = hashlib.sha1(f"{search_query}:{img_path.name}".encode()).hexdigest()
                assets.append(
                    VisualAsset(
                        asset_id=asset_id,
                        asset_type=AssetType.STATIC_IMAGE,
                        file_path=img_path,
                        source_url=None,
                        width=width,
                        height=height,
                        duration=None,
                        tags=[summary],
                    )
                )
            self.logger.info("Local Bing download completed", count=len(image_files), directory=str(image_dir))
        else:
            self.logger.warning("No images were downloaded by local fallback", directory=str(image_dir))

        return assets

    def _summarize_with_llm_api(
        self,
        text: str,
        llm_api_url: str,
        model: str,
        target_words: int,
        timeout_seconds: int,
    ) -> str:
        """Summarize text using ImageFinder LLM API."""
        prompt = (
            f"Extract {target_words} words or less for image search keywords. "
            "Return only keywords, no explanation."
        )
        payload = {
            "prompt": prompt,
            "input_text": text,
            "model": model,
        }
        response = requests.post(
            f"{llm_api_url}/api/v1/llm/generate",
            headers={"Content-Type": "application/json"},
            json=payload,
            timeout=timeout_seconds,
        )
        response.raise_for_status()
        response_payload = response.json()
        if not isinstance(response_payload, dict):
            raise VisualAssetError("Unexpected LLM response payload")

        output = response_payload.get("output")
        if not isinstance(output, str) or not output.strip():
            raise VisualAssetError("Empty summary returned from LLM API")
        return output.strip()

    def _summarize_with_ollama(
        self,
        text: str,
        ollama_url: str,
        model: str,
        target_words: int,
        timeout_seconds: int,
    ) -> str:
        """Summarize text using Ollama, following the prompt used in scripts/semantic-image-search.py."""
        prompt = (
            f"Extract {target_words} words or less that describe the visual content for image search. \n\n"
            "RULES:\n"
            "- ONLY use information explicitly stated in the text\n"
            "- Do NOT add information, locations, or details not mentioned\n"
            "- Focus on: people names, team names, events, objects, actions, places, times\n"
            "- Prioritize concrete, visual terms\n"
            "- Remove filler words\n"
            "- Return just the keywords/terms, no explanations\n\n"
            f"Text: {text}\n\n"
            f"Visual search terms ({target_words} words max):"
        )

        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
        }

        try:
            resp = requests.post(
                f"{ollama_url}/api/generate",
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=timeout_seconds,
            )
            resp.raise_for_status()
            result = resp.json()
            summary = result.get("response", "").strip()
            if not summary:
                raise VisualAssetError("Empty summary returned from Ollama")
            return summary
        except Exception as exc:
            self.logger.error("Ollama API error", error=str(exc))
            raise VisualAssetError(f"Ollama API error: {exc}")
