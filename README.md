# Musicatte v2

Plataforma de partituras con:
- OCR de imágenes (jobs asíncronos)
- Editor de partituras
- Repositorio comunitario con valoraciones

## Stack

- Frontend: React + Vite + Tailwind + VexFlow
- Backend: FastAPI + SQLAlchemy + JWT + SQLite/PostgreSQL

## Ejecutar con Docker Compose (recomendado)

```bash
docker compose up --build
```

Servicios:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- Postgres: `localhost:5432`

Detener:

```bash
docker compose down
```

Detener y eliminar volúmenes:

```bash
docker compose down -v
```

## Ejecutar backend (sin Docker)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Ejecutar frontend

```bash
cd frontend
npm install
npm run dev
```

Variables frontend:
- `VITE_API_URL` (default `http://localhost:8000`)

Variables backend:
- `DATABASE_URL` (default `sqlite:///./musicatte.db`)
- `JWT_SECRET`
- `ACCESS_TOKEN_MINUTES`
- `MAX_UPLOAD_BYTES`
