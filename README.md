# Integrador_2

## 1) Backend setup

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
pip install -r requirements.txt
```

Start backend:

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend structure:

- `app/api/routes`: FastAPI route modules
  - `health.py`: Health check endpoints
  - `auth.py`: Authentication endpoints
  - `model.py`: Legacy model loading and segmentation
  - `registry.py`: Model registry management
- `app/services`: service logic
  - `model_manager.py`: Model loading and inference
  - `registry.py`: Model registry with Supabase persistence
  - `mlflow_logger.py`: MLflow tracking for model lineage
- `app/core`: configuration and clients
- `app/schemas`: Pydantic request/response schemas
- `models/`: Local model artifact storage
- `mlruns/`: MLflow tracking directory
- `migrations/`: Database migration files

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
set VITE_API_URL=http://127.0.0.1:8000
```

## Model Registry Workflow

The new model registry allows uploading, managing, and activating models for segmentation.

### Model Registry API

**Upload a model:**

```
POST /registry/models/upload
- Parameters: name, version, description (optional), file
- Returns: ModelRegistryResponse with model ID, metadata
```

**List all models:**

```
GET /registry/models
- Returns: ModelListResponse with all registered models
```

**Get active model:**

```
GET /registry/models/active
- Returns: Currently active ModelRegistryResponse
- Error 503: No active model
```

**Activate a model:**

```
POST /registry/models/{model_id}/activate
- Returns: Activated ModelRegistryResponse
- Note: Deactivates all other models atomically
```

**Delete a model:**

```
DELETE /registry/models/{model_id}
- Returns: Deletion confirmation
- Note: Removes both metadata and artifact files
```

## Backend Tests

```bash
cd backend
pytest
```
