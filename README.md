# Musicatte

Sheet music platform with OCR scanning, interactive editing, and community sharing.

- **OCR Scanner** — Upload a photo or PDF of sheet music, powered by [HOMR](https://github.com/liebharc/homr). Auto-splits multi-song PDFs.
- **Score Editor** — Drag-and-drop note editing with Verovio. Chords, accidentals, ties, dots, undo/redo.
- **Community Repository** — Publish scores, browse, and rate.

## Stack

- **Frontend:** React + Vite + Tailwind CSS + Verovio (MusicXML/MEI rendering)
- **Backend:** FastAPI + SQLAlchemy + JWT + PostgreSQL
- **OCR:** HOMR (Optical Music Recognition) + PyMuPDF (PDF support)

## Development

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- HOMR OCR: `http://localhost:8080`

## Production (Plesk VPS)

### 1. Backend services

On the VPS, clone the repo and set up the environment:

```bash
cp .env.example .env
# Edit .env — set POSTGRES_PASSWORD, JWT_SECRET, ALLOWED_ORIGINS
openssl rand -hex 32  # use this for JWT_SECRET
```

Start the backend services (DB + HOMR + API):

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

This exposes the backend API on port `8000` (configurable via `BACKEND_PORT`).

### 2. Frontend static build

Build the frontend locally (or on the VPS):

```bash
cd frontend
npm ci
VITE_API_URL=https://api.yourdomain.com npm run build
```

The `dist/` folder contains the static site. Upload it to your Plesk site's document root.

### 3. Plesk configuration

**Frontend domain** (e.g. `musicatte.yourdomain.com`):
- Point document root to the uploaded `dist/` folder
- Enable SSL via Let's Encrypt
- Add a rewrite rule so all routes serve `index.html` (SPA fallback):
  - Apache: add to `.htaccess` in document root:
    ```
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
    ```
  - Or configure in Plesk > Apache & nginx Settings

**Backend domain** (e.g. `api.yourdomain.com`):
- Create a subdomain in Plesk
- Set up a reverse proxy to `http://127.0.0.1:8000`
- Enable SSL via Let's Encrypt

**Update `.env`:**
```
ALLOWED_ORIGINS=https://musicatte.yourdomain.com
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | **required** | Database password |
| `JWT_SECRET` | **required** | Secret key for JWT tokens |
| `BACKEND_PORT` | `8000` | Port exposed for the API |
| `ALLOWED_ORIGINS` | `*` | CORS origins (comma-separated) |
| `ACCESS_TOKEN_MINUTES` | `1440` | Token expiry (24h) |
| `MAX_UPLOAD_BYTES` | `16777216` | Max upload size (16MB) |
| `VITE_API_URL` | `http://localhost:8000` | Backend URL (set at build time) |

## Running without Docker

**Backend:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```
