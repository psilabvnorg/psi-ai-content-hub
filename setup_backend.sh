#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="$ROOT/.venv"
PYTHON="$VENV/bin/python"

if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi

"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install -r "$ROOT/python_api/requirements.txt"
"$PYTHON" -m pip install -e "$ROOT/VieNeu-TTS-Fast-Vietnamese"
"$PYTHON" -m pip install -e "$ROOT/F5-TTS-Vietnamese"

echo "Backend venv ready."
echo "Start with: $PYTHON -m python_api.main"
