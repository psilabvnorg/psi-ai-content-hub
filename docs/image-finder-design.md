# Image Search System Design (AI Content Hub)

## Scope
`ImageFinder` is now merged into `python_api/app-and-basic-tool` and exposed from:

- `http://127.0.0.1:6901/image-search`

It no longer runs as a standalone service on port `6907`.

## Service Architecture

```text
client/src/pages/tools/ImageFinder.tsx
  -> http://127.0.0.1:6901/image-search/api/v1/image-finder/search
     -> app/image_search/routers/image_finder.py
        -> app/image_search/services/image_finder.py
           -> app/image_search/services/image_pipeline/orchestrator.py
              -> search.run_all_sources()
                 -> search/google.py
                 -> search/unsplash.py
                 -> search/bing.py
                 -> search/civitai.py
                 -> search/kling_ai.py
                 -> search/artvee.py
                 -> search/wga.py
              -> downloader.download_images()
              -> analyzer.analyze_images()
              -> selector.select_top_images()
```

## Data Flow
1. Input paragraph is sent from the tool page.
2. LLM (`/api/v1/llm`) generates concise visual keywords.
3. Query runs against enabled sources.
4. URLs are deduplicated and downloaded in parallel.
5. Files are analyzed with Pillow for dimensions/resolution.
6. Top N images by resolution are selected.
7. Response returns query + image metadata (`url`, `source`, `file_path`, `width`, `height`, `resolution`).

## Service Endpoints (Mounted Under `/image-search`)
- `GET /api/v1/health`
- `GET /api/v1/status`
- `GET /api/v1/env/status`
- `POST /api/v1/env/install`
- `GET /api/v1/llm/status`
- `POST /api/v1/llm/generate`
- `POST /api/v1/image-finder/search`

Full example:

- `POST http://127.0.0.1:6901/image-search/api/v1/image-finder/search`

## Runtime Notes
- Temp image files: `%TEMP%/psi_ai_content_hub/image_finder`
- Optional env var: `UNSPLASH_ACCESS_KEY`
- Google source uses Selenium-compatible scraping adapters.
