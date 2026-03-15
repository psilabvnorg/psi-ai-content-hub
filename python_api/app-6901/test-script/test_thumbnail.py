import json
import time
import httpx
from pathlib import Path

BASE = "http://127.0.0.1:6901"
TEMPLATE_NAME = "DFF"
TEMPLATE_DIR = Path(r"D:\AI\psi-ai-content-hub\client\public\templates") / TEMPLATE_NAME
CONFIG_PATH = Path(r"D:\AI\psi-ai-content-hub\temp\thumbnail_config.json")

# Load config rows from thumbnail_config.json
# Format: { "video1": { "title": "..." }, "video2": { ... }, ... }
raw_config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
rows = [v for v in raw_config.values() if isinstance(v, dict)]
if not rows:
    raise ValueError(f"No rows found in {CONFIG_PATH}")

# Determine label column (first placeholder key across all rows)
label_column = next(iter(rows[0].keys()), "title")
print(f"Rows loaded: {len(rows)}, label_column={label_column!r}")
for i, r in enumerate(rows):
    print(f"  row[{i}]: {r}")

# Load and resolve element paths
template_data = json.loads((TEMPLATE_DIR / "template.json").read_text(encoding="utf-8"))
for el in template_data.get("elements", []):
    if el.get("type") != "placeholder" and el.get("file"):
        el["src"] = str((TEMPLATE_DIR / el["file"]).resolve())
        del el["file"]

# Submit batch job
resp = httpx.post(
    f"{BASE}/api/v1/thumbnail/batch",
    json={"template": template_data, "rows": rows, "label_column": label_column},
    timeout=30.0,
)
resp.raise_for_status()
job_id = resp.json()["job_id"]
print(f"Job started: {job_id}")

# Poll for result
for _ in range(60):
    time.sleep(2)
    status = httpx.get(f"{BASE}/api/v1/thumbnail/batch/status/{job_id}", timeout=10.0).json()
    print(f"  status={status['status']}")
    if status["status"] == "complete":
        download_url = status["result"]["sample"]["download_url"]
        img_bytes = httpx.get(f"{BASE}{download_url}", timeout=15.0).content
        out = Path("thumbnail_test.png")
        out.write_bytes(img_bytes)
        print(f"Saved: {out.resolve()}")
        break
    if status["status"] == "error":
        print(f"Error: {status['error']}")
        break
