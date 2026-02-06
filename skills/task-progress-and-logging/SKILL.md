---
name: task-progress-and-logging
description: Require every long-running task to expose progress, show logs in the UI and terminal, and write logs to a file. Use when adding background jobs, downloads, model tasks, or any new pipeline that should report progress and be debuggable. Include Settings actions to clear logs.
---

# Task Progress And Logging

## Overview

Standardize how tasks report progress and logs across the Electron app so every operation is observable and debuggable. Ensure users can clear logs in Settings to save storage.

## Workflow

### 1) Define The Task Contract

- Every task must emit:
  - A `progress` value from 0 to 100.
  - A human-readable `status` string.
  - `log` entries for debug and errors.
- Keep the task signature consistent so UI can render progress and logs without per-task conditionals.

### 2) IPC Plumbing

- Emit progress and log events from the task runner in the main process.
- Forward them to the renderer via IPC channels.
- Ensure tasks do not block the main process; run heavy work in worker threads or child processes.

### 3) UI Requirements

- Display a progress bar for any active task.
- Provide a log panel or expandable console for live output.
- Keep a compact terminal-style feed for recent entries.

### 4) Log File Policy

- Write logs to a file under a user data path.
- Include timestamps and task ids.
- Keep log file size in check (rotate or truncate when large).

### 5) Settings: Clear Logs

- Add a Settings action to delete or truncate log files.
- Update UI to show that logs have been cleared and storage freed.

## Output Checklist

Provide a short checklist in the response:

- Progress bar wired to task events
- Logs visible in UI and terminal
- Log files created with rotation or size limits
- Settings action clears logs safely
