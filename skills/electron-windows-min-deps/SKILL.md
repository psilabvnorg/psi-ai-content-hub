---
name: electron-windows-min-deps
description: Ensure Electron desktop Windows app changes stay compatible with Windows, avoid fragile dependencies, minimize install footprint, and keep build/release reliable. Use when adding features, changing dependencies, build configs, native modules, installers, auto-updates, or Windows-specific behaviors in this repo.
---

# Electron Windows Min Deps

## Overview

Keep the Windows desktop build stable while keeping dependencies lean. Apply this workflow before adding or changing dependencies, Electron/Node features, build settings, or Windows-specific logic.

## Workflow

### 1) Scope The Change

- List the files touched and the user-visible feature being added.
- Identify any new or upgraded dependencies, Electron APIs, or native modules.
- Call out Windows-specific surfaces: paths, file dialogs, permissions, auto-start, tray, notifications, and installers.

### 2) Dependency Gate

- Prefer pure JS dependencies; avoid native modules unless required.
- If a native module is unavoidable, require:
  - Prebuilt binaries for Windows x64.
  - Clear build instructions for development environments.
  - Minimal transitive dependencies and small install size.
- Avoid adding heavy frameworks or duplicate libraries.
- Ensure new dependencies are used only in the minimal scope needed.

### 3) Windows Compatibility Checks

- File system: use `path.join`, `app.getPath`, and avoid hard-coded separators.
- Permissions: keep writes inside user data paths; avoid admin-only directories.
- Case insensitivity: do not rely on case-sensitive paths.
- Avoid symlink dependencies where possible.
- Ensure long-running tasks do not block the main process.

### 4) Packaging And Installer Safety

- Keep the app bundle lean: no large assets or models inside the app package.
- Ensure `electron-builder` settings keep artifacts minimal and stable.
- Avoid changes to signing or installer options without a clear plan.
- Confirm any added files are placed under `extraResources` only when essential.

### 5) Quick Runtime Validation

- App launches on Windows without extra system installs.
- Core windows open, close, and restore cleanly.
- New feature works with Windows pathing and permissions.

## Output Checklist

Provide a short checklist in the response:

- New or changed dependencies listed and justified
- Windows-specific risks addressed
- Packaging size impact noted
- Any follow-up tests or checks suggested
