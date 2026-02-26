from __future__ import annotations

import sys
from pathlib import Path

# Add app-6901 to sys.path so `import app.services.*` resolves.
# parents[0]=test-script, [1]=app-6901, [2]=python_api, [3]=D:/AI/psi-ai-content-hub
_APP6901_DIR = Path(__file__).resolve().parents[1]   # app-6901
_REPO_ROOT = Path(__file__).resolve().parents[3]     # D:/AI/psi-ai-content-hub

for _p in (_APP6901_DIR, _REPO_ROOT):
    if str(_p) not in sys.path:
        sys.path.insert(0, str(_p))

import pytest
from python_api.common.jobs import JobStore


@pytest.fixture
def job_store():
    """Fresh JobStore instance for each test."""
    return JobStore()


@pytest.fixture(autouse=True)
def reset_llm_runtime_config():
    """Clear llm._runtime_config between tests to avoid state leakage."""
    yield
    try:
        from app.services import llm
        llm._runtime_config.clear()
    except Exception:
        pass
