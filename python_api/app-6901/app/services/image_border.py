from __future__ import annotations

import uuid
from pathlib import Path

from python_api.common.paths import TEMP_DIR


def hex_to_bgr(hex_color: str) -> tuple[int, int, int]:
    """Convert #rrggbb hex string to (B, G, R) tuple for OpenCV."""
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (b, g, r)


def process_image_border(image_data: bytes, thickness: int = 10, color: str = "#ffffff", feather: int = 40) -> Path:
    import cv2
    import numpy as np

    # Decode bytes → BGRA
    arr = np.frombuffer(image_data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)

    if img is None:
        raise ValueError("Failed to decode image")

    # Ensure 4-channel BGRA
    if img.ndim == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    elif img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)

    b, g, r, a = cv2.split(img)

    # Binarize alpha so semi-transparent edge pixels don't leak border color
    # into the subject at high thickness values
    _, a_binary = cv2.threshold(a, 10, 255, cv2.THRESH_BINARY)

    # Circular kernel for smooth, round outline at all thickness levels
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (thickness * 2 + 1, thickness * 2 + 1)
    )
    dilated = cv2.dilate(a_binary, kernel)

    # Border = dilated region minus binarized original mask
    border_mask = cv2.subtract(dilated, a_binary)

    # Gaussian blur on the mask for soft feathered gradient effect
    if feather > 0:
        sigma = max(0.5, feather * thickness / 100.0)
        ksize = int(sigma * 6 + 1)
        if ksize % 2 == 0:
            ksize += 1
        border_mask = cv2.GaussianBlur(border_mask, (ksize, ksize), sigma)

    # Build colored border layer — only set RGB where border_mask is non-zero
    # so cv2.add doesn't tint the rest of the image
    border_bgr = hex_to_bgr(color)
    border_layer = np.zeros_like(img)
    px = border_mask > 0
    border_layer[px, 0] = border_bgr[0]
    border_layer[px, 1] = border_bgr[1]
    border_layer[px, 2] = border_bgr[2]
    border_layer[:, :, 3] = border_mask

    # Composite: border layer first, then original on top
    result = cv2.add(border_layer, img)

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    uid = uuid.uuid4().hex
    output_path = TEMP_DIR / f"image_border_out_{uid}.png"
    cv2.imwrite(str(output_path), result)

    return output_path
