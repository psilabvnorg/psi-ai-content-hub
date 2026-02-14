# Background Removal Service

FastAPI service for removing image backgrounds using `ZhengPeng7/BiRefNet`.

## Run locally

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m app.main
```

Service runs at `http://127.0.0.1:6905`.

## Main endpoints

- `GET /api/v1/health`
- `GET /api/v1/status`
- `GET /api/v1/env/status`
- `POST /api/v1/env/install`
- `POST /api/v1/remove/upload`
- `POST /api/v1/remove/url`
- `GET /api/v1/remove/stream/{task_id}`
- `GET /api/v1/remove/result/{task_id}`
- `GET /api/v1/files/{file_id}`
