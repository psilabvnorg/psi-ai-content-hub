#!/usr/bin/env python3
"""
Tests and demo script for Vietnamese Normalizer library.
Run with: pytest test_normalizer.py -v
Or demo:   python test_normalizer.py
"""

import pytest
from vietnormalizer import VietnameseNormalizer


# --- Pytest tests (collected by pytest) ---

@pytest.fixture
def normalizer():
    return VietnameseNormalizer()


def test_date_normalization(normalizer):
    """Date 25/12/2023 is normalized to words."""
    out = normalizer.normalize("Hôm nay là 25/12/2023")
    assert "hai mươi lăm" in out
    assert "tháng mười hai" in out
    assert "năm hai nghìn" in out or "2023" not in out


def test_time_normalization(normalizer):
    """Time 14:30 is normalized to words."""
    out = normalizer.normalize("Cuộc họp lúc 14:30")
    assert "mười bốn" in out or "14" not in out
    assert "ba mươi" in out or "30" not in out


def test_currency_normalization(normalizer):
    """Currency with thousand separators is normalized."""
    out = normalizer.normalize("Giá là 1.500.000 đồng")
    assert "đồng" in out
    assert "1.500.000" not in out


def test_percentage_normalization(normalizer):
    """Percentage 25% is normalized."""
    out = normalizer.normalize("Tăng 25% so với năm ngoái")
    assert "phần trăm" in out
    assert "25%" not in out


def test_standalone_number(normalizer):
    """Standalone number 123 is normalized to words."""
    out = normalizer.normalize("Tôi có 123 quyển sách")
    assert "một trăm hai mươi ba" in out
    assert " 123 " not in out


def test_birthdate_normalization(normalizer):
    """Date 15/08/1990 is normalized."""
    out = normalizer.normalize("Sinh nhật vào 15/08/1990")
    assert "15" not in out or "mười lăm" in out
    assert "08" not in out or "tám" in out


# --- Demo (run with python test_normalizer.py) ---

def main():
    """Print demo normalizations."""
    print("Initializing Vietnamese Normalizer...")
    normalizer = VietnameseNormalizer()

    test_cases = [
        "Hôm nay là 25/12/2023",
        "Cuộc họp lúc 14:30",
        "Giá là 1.500.000 đồng",
        "Tăng 25% so với năm ngoái",
        "Tôi có 123 quyển sách",
        "Sinh nhật vào 15/08/1990",
    ]

    print("\n" + "=" * 60)
    print("Testing Vietnamese Text Normalization")
    print("=" * 60 + "\n")

    for i, text in enumerate(test_cases, 1):
        normalized = normalizer.normalize(text)
        print(f"Test {i}:")
        print(f"  Input:    {text}")
        print(f"  Output:   {normalized}")
        print()


if __name__ == "__main__":
    main()

