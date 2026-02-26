from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.services.aenv_profile_service_api import (
    aprofile_module_to_package_map_data,
    aenv_get_profile_catalog_data,
    aenv_get_profile_module_map_data,
    aenv_get_profile_status_data,
    aenv_get_venv_python_path_data,
    aenv_ensure_venv_ready_data,
    aenv_install_profile_data,
    aenv_venv_dir_path,
)

# ---------------------------------------------------------------------------
# aenv_get_profile_catalog_data
# ---------------------------------------------------------------------------

def test_get_profile_catalog_returns_all_5_profiles():
    catalog = aenv_get_profile_catalog_data()
    ids = {entry["profile_id"] for entry in catalog}
    expected = {"app", "whisper", "translation", "image-search", "bg-remove-overlay"}
    assert ids == expected


def test_get_profile_catalog_each_entry_has_required_fields():
    catalog = aenv_get_profile_catalog_data()
    for entry in catalog:
        assert "profile_id" in entry
        assert "module_count" in entry
        assert "module_names" in entry


def test_get_profile_catalog_module_names_sorted():
    catalog = aenv_get_profile_catalog_data()
    for entry in catalog:
        names = entry["module_names"]
        assert names == sorted(names)


def test_get_profile_catalog_module_count_matches():
    catalog = aenv_get_profile_catalog_data()
    for entry in catalog:
        pid = entry["profile_id"]
        expected_count = len(aprofile_module_to_package_map_data[pid])
        assert entry["module_count"] == expected_count


# ---------------------------------------------------------------------------
# aenv_get_profile_module_map_data
# ---------------------------------------------------------------------------

def test_get_profile_module_map_valid_profile():
    result = aenv_get_profile_module_map_data("app")
    assert isinstance(result, dict)
    assert "fastapi" in result
    assert "uvicorn" in result


def test_get_profile_module_map_unknown_raises():
    with pytest.raises(KeyError):
        aenv_get_profile_module_map_data("nonexistent-profile")


def test_get_profile_module_map_all_profiles():
    for profile_id in ("app", "whisper", "translation", "image-search", "bg-remove-overlay"):
        result = aenv_get_profile_module_map_data(profile_id)
        assert isinstance(result, dict)
        assert len(result) > 0


# ---------------------------------------------------------------------------
# aenv_get_profile_status_data
# ---------------------------------------------------------------------------

def test_get_profile_status_all_installed():
    with patch("app.services.aenv_profile_service_api.importlib.util.find_spec", return_value=MagicMock()):
        result = aenv_get_profile_status_data("app")
    assert result["installed"] is True
    assert result["missing_modules"] == []


def test_get_profile_status_some_missing():
    def fake_find_spec(name: str):
        return None if name == "torch" else MagicMock()

    with patch("app.services.aenv_profile_service_api.importlib.util.find_spec", side_effect=fake_find_spec):
        result = aenv_get_profile_status_data("whisper")
    assert "torch" in result["missing_modules"]
    assert result["installed"] is False


def test_get_profile_status_structure():
    with patch("app.services.aenv_profile_service_api.importlib.util.find_spec", return_value=MagicMock()):
        result = aenv_get_profile_status_data("app")
    for key in ("profile_id", "installed", "missing_modules", "installed_modules", "python_path"):
        assert key in result


def test_get_profile_status_unknown_profile_raises():
    with pytest.raises(KeyError):
        aenv_get_profile_status_data("bad-profile")


# ---------------------------------------------------------------------------
# aenv_get_venv_python_path_data
# ---------------------------------------------------------------------------

def test_get_venv_python_path_windows():
    with patch("app.services.aenv_profile_service_api.os.name", "nt"):
        path = aenv_get_venv_python_path_data()
    assert str(path).endswith("python.exe")
    assert "Scripts" in str(path)


def test_get_venv_python_path_posix():
    with patch("app.services.aenv_profile_service_api.os.name", "posix"):
        path = aenv_get_venv_python_path_data()
    assert str(path).endswith("python")
    assert "bin" in str(path)


# ---------------------------------------------------------------------------
# aenv_ensure_venv_ready_data
# ---------------------------------------------------------------------------

def test_ensure_venv_ready_exists_no_subprocess():
    """No subprocess call when venv directory already exists."""
    with patch.object(aenv_venv_dir_path.__class__, "exists", return_value=True):
        with patch("app.services.aenv_profile_service_api.subprocess.check_call") as mock_cc:
            with patch("app.services.aenv_profile_service_api.aenv_venv_dir_path") as mock_path:
                mock_path.exists.return_value = True
                aenv_ensure_venv_ready_data()
    # If the real venv exists (which it does since tests run in it), check_call not called
    # Just test the logic: when exists() returns True, no subprocess is called
    with patch("app.services.aenv_profile_service_api.subprocess.check_call") as mock_cc:
        with patch("app.services.aenv_profile_service_api.aenv_venv_dir_path") as mock_venv:
            mock_venv.exists.return_value = True
            aenv_ensure_venv_ready_data()
    mock_cc.assert_not_called()


def test_ensure_venv_ready_missing_calls_venv():
    """subprocess.check_call is invoked with -m venv when venv is absent."""
    with patch("app.services.aenv_profile_service_api.subprocess.check_call") as mock_cc:
        with patch("app.services.aenv_profile_service_api.aenv_venv_dir_path") as mock_venv:
            mock_venv.exists.return_value = False
            mock_venv.__str__ = lambda self: "/fake/venv"
            aenv_ensure_venv_ready_data()
    mock_cc.assert_called_once()
    args = mock_cc.call_args[0][0]
    assert "-m" in args
    assert "venv" in args


# ---------------------------------------------------------------------------
# aenv_install_profile_data
# ---------------------------------------------------------------------------

def test_install_profile_nothing_missing():
    """When all modules installed, returns empty installed_packages without pip."""
    with patch("app.services.aenv_profile_service_api.importlib.util.find_spec", return_value=MagicMock()):
        with patch("app.services.aenv_profile_service_api.subprocess.check_call") as mock_cc:
            with patch("app.services.aenv_profile_service_api.aenv_venv_dir_path") as mock_venv:
                mock_venv.exists.return_value = True
                result = aenv_install_profile_data("app")
    mock_cc.assert_not_called()
    assert result["installed_packages"] == []
    assert result["status"] == "ok"


def test_install_profile_installs_missing_packages():
    """When modules are missing, pip install is called."""
    with patch("app.services.aenv_profile_service_api.importlib.util.find_spec", return_value=None):
        with patch("app.services.aenv_profile_service_api.subprocess.check_call") as mock_cc:
            with patch("app.services.aenv_profile_service_api.aenv_venv_dir_path") as mock_venv:
                mock_venv.exists.return_value = True
                mock_venv.__str__ = lambda self: "/fake/venv"
                with patch("app.services.aenv_profile_service_api.aenv_get_venv_python_path_data", return_value=Path("/fake/python")):
                    result = aenv_install_profile_data("app")
    mock_cc.assert_called_once()
    assert len(result["installed_packages"]) > 0


def test_install_profile_explicit_packages_used():
    """When packages= is provided, uses those directly without checking find_spec."""
    with patch("app.services.aenv_profile_service_api.subprocess.check_call") as mock_cc:
        with patch("app.services.aenv_profile_service_api.aenv_venv_dir_path") as mock_venv:
            mock_venv.exists.return_value = True
            with patch("app.services.aenv_profile_service_api.aenv_get_venv_python_path_data", return_value=Path("/fake/python")):
                result = aenv_install_profile_data("app", packages=["requests", "httpx"])
    mock_cc.assert_called_once()
    args = mock_cc.call_args[0][0]
    assert "requests" in args
    assert "httpx" in args


def test_install_profile_unknown_raises():
    with pytest.raises(KeyError):
        aenv_install_profile_data("bad-profile")
