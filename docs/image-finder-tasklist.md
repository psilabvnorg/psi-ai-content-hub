# Image Finder Task List (AI Content Hub Structure)

## Completed
- [x] Created dedicated service: `python_api/ImageFinder`
- [x] Added search pipeline modules:
  - [x] `search/google.py` (Selenium)
  - [x] `search/duckduckgo.py` (duckduckgo_search)
  - [x] `search/unsplash.py` (Unsplash HTTP API)
  - [x] `search/__init__.py` source orchestrator + URL dedupe
  - [x] `downloader.py` parallel image download + validation
  - [x] `analyzer.py` Pillow resolution extraction
  - [x] `selector.py` top-resolution selection
  - [x] `orchestrator.py` end-to-end pipeline
  - [x] `models.py` shared dataclasses
- [x] Added FastAPI routers (`env`, `system`, `llm`, `image_finder`)
- [x] Moved Image Finder runtime out of `app-and-basic-tool` app wiring
- [x] Registered `ImageFinder` in Electron managed services (`6907`)
- [x] Updated frontend tool to use `IMAGE_FINDER_API_URL` and `imagefinder` service id
- [x] Updated service registry docs (`python_api/README.md`)

## Verification Checklist
- [ ] Create venv in `python_api/ImageFinder`
- [ ] Install deps: `pip install -r requirements.txt`
- [ ] Start service: `python -m app.main`
- [ ] Confirm status: `GET /api/v1/status`
- [ ] Run image search from UI and verify:
  - [ ] Combined multi-source search runs
  - [ ] Images download to temp folder
  - [ ] Top-resolution ordering is returned

## Follow-ups (Optional)
- [ ] Add unit tests for analyzer/selector/downloader with mocked network
- [ ] Add fallback Selenium path for DuckDuckGo when DDGS is blocked
- [ ] Add result caching for repeated queries
- [ ] Add automatic cleanup policy for temp image directory

