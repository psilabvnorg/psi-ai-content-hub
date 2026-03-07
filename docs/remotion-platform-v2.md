# Remotion Platform V2

## Goal
Build a template platform that scales to 100+ presets across multiple categories without duplicating configuration in the frontend, Python backend, and Remotion compositions.

## Domain Model
- `template family`: A rendering engine for a class of motion behavior such as `news-anchor`, `news-intro`, `audio-showcase`, or `audio-karaoke`.
- `template preset`: A user-facing template that maps to one family plus a default config, orientation, labels, and asset pack.
- `asset pack`: A named collection of immutable visual assets for logical slots such as `branding.logo` or `overlay.background`.
- `project instance`: The editable state for a single video job.
- `workspace`: A resolved preview/render snapshot stored in temp storage and served through the app API.

## Template Family vs Preset
- Families are technical and low-count. They are the compositions registered in Remotion Studio.
- Presets are product-facing and high-count. They are listed in the app UI and point to a family.
- A preset may differ only by defaults, slots, orientation, or pack selection while still reusing the same family.

## Storage Domains
- `remotion/public`
  Built-in immutable assets only. These are shipped with the app and safe to keep under version control.
- Electron `userData`
  Persistent app data such as projects, user assets, reusable packs, logs, exports, settings, and metadata.
- Electron `temp`
  Disposable workspaces and temporary processing directories used during preview and render.

## Electron Storage Roots
- Persistent root: `app.getPath("userData")`
- Temp root: `app.getPath("temp")`
- Python services must consume these values through environment variables rather than hardcoded platform paths.

## Naming Rules
- Family IDs: kebab-case, low-count, behavior-oriented. Example: `news-anchor`.
- Preset IDs: dot-separated product IDs. Example: `news.anchor.vertical.background`.
- Asset pack IDs: dot-separated and stable. Example: `news.anchor.vertical.default`.
- Workspace IDs: opaque, generated, and never reused.
- Slot keys: dot-separated semantic names. Example: `intro.topPanel`, `branding.logo`, `overlay.background`.

## API Direction
- `GET /api/v1/templates`
  Returns the preset catalog grouped by category.
- `GET /api/v1/templates/{presetId}`
  Returns the preset details, slots, defaults, and editor schema metadata.
- `POST /api/v1/assets`
  Uploads a reusable user asset into the library.
- `GET /api/v1/assets`
  Lists user library assets.
- `POST /api/v1/asset-packs`
  Saves reusable user packs.
- `GET /api/v1/asset-packs`
  Lists built-in and user packs.
- `POST /api/v1/projects`
  Creates a project.
- `PATCH /api/v1/projects/{projectId}`
  Updates a project.
- `GET /api/v1/projects/{projectId}`
  Loads a project.
- `POST /api/v1/projects/{projectId}/preview`
  Builds a preview workspace and returns a Studio URL.
- `POST /api/v1/projects/{projectId}/render`
  Builds a render workspace and starts a render job.

## Workspace Builder Flow
1. Load the project instance and preset definition.
2. Validate the project against the family/preset schema.
3. Resolve built-in assets and user asset references.
4. Normalize files into a temp workspace.
5. Generate a single `workspace.json` document.
6. Serve the workspace manifest and files through the app API.
7. Let the Remotion family fetch the manifest and render from resolved props only.

## Migration Rules
- Do not add new preset constants directly in React pages or Python services.
- Do not add new mutable runtime data under `remotion/public`.
- Do not model `template = composition`.
- Prefer adding presets to an existing family before introducing a new family.
- Keep built-in packs immutable. User customization belongs in the library or project overrides.

## Current Migration Target
- News templates move to the `news-anchor` and `news-intro` families.
- Music Playlist and Podcast move to the `audio-showcase` family.
- Karaoke moves to the `audio-karaoke` family.
- Legacy feature-specific APIs remain only as compatibility shims while the new platform API is adopted.
