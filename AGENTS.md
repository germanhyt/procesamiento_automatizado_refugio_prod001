# Code Review Rules — Refugio Data

## TypeScript (frontend)
- Functional components; typed props and services under `frontend/src/`
- Reuse constants aligned with backend; no duplicated business lists

## Python (backend)
- FastAPI routers in `backend/app/api/`; logic in services
- Validate inputs with Pydantic; no secrets in source

## General
- Minimal diffs; match naming and structure of surrounding code
