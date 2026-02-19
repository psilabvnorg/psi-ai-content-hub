# Image Finder System Design (AI Content Hub)

## Scope
`ImageFinder` is implemented as its own Python service at `python_api/ImageFinder` (port `6907`) and no longer runs inside `python_api/app-and-basic-tool`.

## Service Architecture

```text
client/src/pages/tools/ImageFinder.tsx
  -> http://127.0.0.1:6907/api/v1/image-finder/search
     -> app/routers/image_finder.py
        -> app/services/image_finder.py
           -> app/services/image_pipeline/orchestrator.py
              -> search.run_all_sources()
                 -> search/google.py
                 -> search/duckduckgo.py
                 -> search/unsplash.py
              -> downloader.download_images()
              -> analyzer.analyze_images()
              -> selector.select_top_images()
```

## Data Flow
1. Input paragraph is sent from the tool page.
2. LLM (`/api/v1/llm`) generates concise visual keywords.
3. Search query runs against Google Images, DuckDuckGo, Unsplash.
4. URLs are deduplicated and downloaded in parallel.
5. Downloaded files are analyzed with Pillow for dimensions/resolution.
6. Top N images by resolution are selected (small image filtering included).
7. Response returns query + image metadata:
   - `url`, `source`
   - `file_path`
   - `width`, `height`, `resolution`

## Service Endpoints
- `GET /api/v1/health`
- `GET /api/v1/status`
- `GET /api/v1/env/status`
- `POST /api/v1/env/install`
- `GET /api/v1/llm/status`
- `POST /api/v1/llm/generate`
- `POST /api/v1/image-finder/search`

## Runtime Notes
- Temp image files: `%TEMP%/psi_ai_content_hub/image_finder`
- Optional env var: `UNSPLASH_ACCESS_KEY`
- Google source uses Selenium + ChromeDriver (webdriver_manager).

