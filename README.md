# Integrador_2

## 1) Backend setup

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
```

Put your model in `models/model.pth`

Start backend:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend structure:

- `app/api/routes`: FastAPI route modules
- `app/services`: model/auth service logic
- `app/core`: configuration and clients
- `app/schemas`: Pydantic request/response schemas

Health check:

- GET `http://127.0.0.1:8000/health`

## 2) Frontend setup

```bash
cd frontend
npm install
npm start
```

Optional API override (defaults to http://127.0.0.1:8000):

```bash
set REACT_APP_API_URL=http://127.0.0.1:8000
```

## Backend tests

```bash
cd backend
pytest
```

## API contract

- Endpoint: `POST /segment`
- Input: multipart form-data with field `file`
- Output JSON:
  - `mask_base64`: grayscale mask PNG (0,1,2 class IDs)
  - `segmented_base64`: RGB visualization PNG
  - `classes`: class names
  - `model_loaded`: whether model loaded successfully

## Notes

- If model loading fails, backend automatically uses a simple fallback segmentation
  based on intensity thresholds. This keeps the MVP functional during integration.
- Allowed image formats: PNG, JPG/JPEG, TIFF.
