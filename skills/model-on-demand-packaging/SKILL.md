---
name: model-on-demand-packaging
description: Keep the app lightweight by downloading ML models only when users enable a feature, never bundling large models into the installer. Use when adding model-backed features, download flows, model storage, caching, or packaging exclusions.
---

# Model On Demand Packaging

## Overview

Ship a lightweight app by keeping models out of the bundle and downloading them only when users opt in. Build a reliable manifest, download manager, storage policy, and UI around that flow.

## Workflow

### 1) Identify Model-Backed Features

- List the features that need models and the user journeys that activate them.
- Confirm which models are optional versus required for core app use.

### 2) Define A Model Manifest

- Maintain a small manifest with:
  - Model id, version, size, and sha256 checksum
  - Download URL(s) and optional mirror
  - Minimum app version or feature flag
- Treat the manifest as the only bundled metadata for models.

### 3) Build A Download Manager

- Download in the background with progress events and resumable support.
- Verify checksums before marking a model as ready.
- Handle offline and partial downloads gracefully.

### 4) Storage Policy

- Store models under a per-user data directory.
- Keep each model in its own versioned folder.
- Provide a single place to compute disk usage and cleanup.

### 5) Packaging Rules

- Do not ship models in the installer or app bundle.
- Ensure build config excludes large assets and caches.
- Only ship the manifest and the downloader code.

### 6) UX Expectations

- Gate features that need models behind a clear download prompt.
- Show progress and allow cancel or retry.
- Add a Settings surface to remove unused models.

## Output Checklist

Provide a short checklist in the response:

- Models removed from packaging and installer size impact noted
- Manifest fields and checksum strategy confirmed
- Download, resume, and verification behaviors covered
- Storage path and cleanup options documented
