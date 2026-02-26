from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

import pytest

from app.services.env import (
    _MODULE_TO_PACKAGE,
    get_installed_modules,
    get_missing_modules,
    get_status,
    install_packages,
)

# ---------------------------------------------------------------------------
# get_missing_modules / get_installed_modules
# ---------------------------------------------------------------------------

def test_get_missing_modules_returns_list():
    result = get_missing_modules()
    assert isinstance(result, list)


def test_get_missing_modules_all_installed():
    """When all find_spec calls succeed, nothing is missing."""
    with patch("app.services.env.importlib.util.find_spec", return_value=MagicMock()):
        assert get_missing_modules() == []


def test_get_missing_modules_patched_missing():
    """When find_spec returns None for fastapi, it appears in missing."""
    def fake_find_spec(name: str):
        return None if name == "fastapi" else MagicMock()

    with patch("app.services.env.importlib.util.find_spec", side_effect=fake_find_spec):
        missing = get_missing_modules()
        assert "fastapi" in missing


def test_get_installed_modules_complement():
    """missing + installed should equal all tracked modules."""
    missing = get_missing_modules()
    installed = get_installed_modules()
    assert set(missing) | set(installed) == set(_MODULE_TO_PACKAGE.keys())
    assert set(missing) & set(installed) == set()


def test_get_missing_and_installed_no_overlap():
    with patch("app.services.env.importlib.util.find_spec", return_value=None):
        missing = get_missing_modules()
        installed = get_installed_modules()
        assert set(missing) & set(installed) == set()


# ---------------------------------------------------------------------------
# get_status
# ---------------------------------------------------------------------------

def test_get_status_has_required_keys():
    with patch("app.services.env.importlib.util.find_spec", return_value=MagicMock()):
        result = get_status()
    assert "installed" in result
    assert "missing" in result
    assert "installed_modules" in result


def test_get_status_all_ok():
    with patch("app.services.env.importlib.util.find_spec", return_value=MagicMock()):
        result = get_status()
    assert result["installed"] is True
    assert result["missing"] == []


def test_get_status_with_missing():
    with patch("app.services.env.importlib.util.find_spec", return_value=None):
        result = get_status()
    assert result["installed"] is False
    assert len(result["missing"]) > 0


# ---------------------------------------------------------------------------
# install_packages
# ---------------------------------------------------------------------------

def test_install_packages_explicit_list():
    with patch("app.services.env.subprocess.check_call") as mock_cc:
        result = install_packages(["fastapi", "uvicorn"])
    mock_cc.assert_called_once()
    args = mock_cc.call_args[0][0]
    assert "fastapi" in args
    assert "uvicorn" in args
    assert result["status"] == "success"
    assert result["installed"] == ["fastapi", "uvicorn"]


def test_install_packages_auto_from_missing():
    """When no packages given, installs packages for missing modules."""
    with patch("app.services.env.importlib.util.find_spec", return_value=None):
        with patch("app.services.env.subprocess.check_call") as mock_cc:
            result = install_packages()
    mock_cc.assert_called_once()
    assert result["status"] == "success"
    assert len(result["installed"]) > 0


def test_install_packages_nothing_to_install():
    """When all modules present and no explicit packages, no subprocess call."""
    with patch("app.services.env.importlib.util.find_spec", return_value=MagicMock()):
        with patch("app.services.env.subprocess.check_call") as mock_cc:
            result = install_packages()
    mock_cc.assert_not_called()
    assert result["status"] == "success"
    assert result["installed"] == []


def test_install_packages_returns_correct_structure():
    with patch("app.services.env.subprocess.check_call"):
        result = install_packages(["requests"])
    assert "status" in result
    assert "installed" in result
