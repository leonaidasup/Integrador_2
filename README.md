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

Health check:

- GET `http://127.0.0.1:8000/health`

## 2) Frontend setup

Open a second terminal:

```bash
cd frontend
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
streamlit run app.py
```

Then open the Streamlit URL shown in terminal (usually `http://localhost:8501`).

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
