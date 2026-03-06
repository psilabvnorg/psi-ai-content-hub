from __future__ import annotations

import uuid
from io import BytesIO
from pathlib import Path

from python_api.common.paths import TEMP_DIR


def process_transparent_logo(image_data: bytes, tolerance: int = 30) -> Path:
    import numpy as np
    from PIL import Image

    img = Image.open(BytesIO(image_data)).convert("RGBA")
    data = np.array(img, dtype=np.float32)

    # Sample background color from the four corners (average)
    corners = np.array([
        data[0, 0, :3],
        data[0, -1, :3],
        data[-1, 0, :3],
        data[-1, -1, :3],
    ])
    bg_color = corners.mean(axis=0)

    # Euclidean distance from background color per pixel
    rgb = data[:, :, :3]
    dist = np.sqrt(np.sum((rgb - bg_color) ** 2, axis=2))

    # Pixels within tolerance → transparent; outside → opaque
    alpha = np.where(dist <= tolerance, 0, 255).astype(np.uint8)
    data[:, :, 3] = alpha

    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    uid = uuid.uuid4().hex
    output_path = TEMP_DIR / f"transparent_out_{uid}.png"
    Image.fromarray(data.astype(np.uint8)).save(str(output_path))

    return output_path
