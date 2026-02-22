# API Migration Map (Legacy -> Canonical)

This map documents backend path normalization for the app service.

## Whisper

- `/whisper/api/v1/status` -> `/api/v1/whisper/status`
- `/whisper/api/v1/env/status` -> `/api/v1/whisper/env/status`
- `/whisper/api/v1/env/install` -> `/api/v1/whisper/env/install`
- `/whisper/api/v1/models/download` -> `/api/v1/whisper/models/download`
- `/whisper/api/v1/transcribe` -> `/api/v1/whisper/transcribe`
- `/whisper/api/v1/transcribe/stream/{task_id}` -> `/api/v1/whisper/transcribe/stream/{task_id}`
- `/whisper/api/v1/transcribe/result/{task_id}` -> `/api/v1/whisper/transcribe/result/{task_id}`

## Translation

- `/translation/api/v1/status` -> `/api/v1/translation/system/status`
- `/translation/api/v1/health` -> `/api/v1/translation/system/health`
- `/translation/api/v1/env/status` -> `/api/v1/translation/env/status`
- `/translation/api/v1/env/install` -> `/api/v1/translation/env/install`
- `/translation/api/v1/translation/translate` -> `/api/v1/translation/translate`
- `/translation/api/v1/translation/translate/stream/{job_id}` -> `/api/v1/translation/translate/stream/{job_id}`
- `/translation/api/v1/translation/translate/result/{job_id}` -> `/api/v1/translation/translate/result/{job_id}`
- `/translation/api/v1/translation/download` -> `/api/v1/translation/download`
- `/translation/api/v1/translation/unload` -> `/api/v1/translation/unload`

## Image Search

- `/image-search/api/v1/status` -> `/api/v1/image-search/status`
- `/image-search/api/v1/env/status` -> `/api/v1/image-search/env/status`
- `/image-search/api/v1/env/install` -> `/api/v1/image-search/env/install`
- `/image-search/api/v1/llm/status` -> `/api/v1/image-search/llm/status`
- `/image-search/api/v1/image-finder/search` -> `/api/v1/image-search/image-finder/search`
- `/image-search/api/v1/config/api-keys` -> `/api/v1/image-search/config/api-keys`
- `/image-search/api/v1/config/api-keys/unsplash` -> `/api/v1/image-search/config/api-keys/unsplash`
- `/image-search/api/v1/sources` -> `/api/v1/image-search/sources`
- `/image-search/api/v1/sources/{source_id}/search` -> `/api/v1/image-search/sources/{source_id}/search`

## Background Remove / Overlay

- `/bg-remove-overlay/api/v1/status` -> `/api/v1/bg-remove-overlay/status`
- `/bg-remove-overlay/api/v1/env/status` -> `/api/v1/bg-remove-overlay/env/status`
- `/bg-remove-overlay/api/v1/env/install` -> `/api/v1/bg-remove-overlay/env/install`
- `/bg-remove-overlay/api/v1/remove/*` -> `/api/v1/bg-remove-overlay/remove/*`
- `/bg-remove-overlay/api/v1/video/*` -> `/api/v1/bg-remove-overlay/video/*`
- `/bg-remove-overlay/api/v1/files/{file_id}` -> `/api/v1/bg-remove-overlay/files/{file_id}`

## Shared Environment Profiles (New)

- `GET /api/v1/env/profiles`
- `GET /api/v1/env/profiles/{profile_id}/status`
- `POST /api/v1/env/profiles/{profile_id}/install`
