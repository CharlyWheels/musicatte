# Musicatte

Photograph a score, get something you can edit, correct it, and share it.

- **Scanner** — a photo or PDF becomes editable notation. The photo is judged
  before it is sent, preprocessed so the recogniser can read it, and the
  result comes back with the measures that do not add up called out by number.
- **Editor** — notes, chords, tuplets, beams, slurs, articulations, dynamics,
  lyrics, repeats, several staves and voices, key and time changes mid-score.
  Playback with highlighting, because hearing a score is the fastest way to
  catch a misread note.
- **Repository** — publish a score and anyone can open it, hear it, rate it and
  download it as MusicXML, MIDI or PDF.

## Stack

| | |
|---|---|
| Frontend | React, Vite, Tailwind, Verovio (MEI engraving) |
| Backend | FastAPI, SQLAlchemy, PostgreSQL, JWT |
| Recognition | [HOMR](https://github.com/liebharc/homr), with OpenCV preprocessing |
| Conversion | music21 (MusicXML, compressed MusicXML, MIDI) |

### How the notation is stored

**MEI internally, MusicXML at the edges.** MEI is Verovio's native format and
the only one its editing model understands, so it is what the editor and the
database hold — the `scores.score_data` column, with `score_format` saying
which format it is.

Verovio can *read* MusicXML but can only *write* MEI, so exporting MusicXML
means a real conversion, which happens on the server through music21. Anything
that hands the user a `.xml` file straight out of Verovio is handing them MEI
under a misleading name, and no mainstream notation editor opens it.

### How recognition works

1. **Preprocess** (`backend/app/services/preprocess.py`). EXIF orientation,
   illumination flattening, perspective correction, iterative deskew by
   projection profile, a crop to the music, and Otsu binarisation. This is
   where most of the accuracy comes from: HOMR is trained on flat, evenly lit
   scans, and a phone photo is none of those things.

   Two details worth knowing before changing anything here. HOMR resizes every
   input to 1920 px wide, so scaling the image uniformly is a no-op for it and
   *cropping* is what changes the effective staff size. And binarisation must
   be global: an adaptive threshold with a window near the size of a note head
   hollows the head out, and a hollow head is a half note to the recogniser.

2. **Recognise more than once.** Each page is run through several preprocessed
   variants and the most rhythmically consistent result wins
   (`music_validation.rhythmic_consistency`). Which preprocessing a given photo
   needs is not knowable in advance, and consistency needs no ground truth, so
   it works in production.

3. **Validate.** Measure durations against the time signature, notes against
   the instrument's range, implausible leaps. Warnings carry measure numbers so
   the editor can send the user straight to the bar that needs checking.
   Recognition will never be perfect; what matters is that its mistakes are
   visible and quick to fix.

4. **Assemble.** Pages are merged keeping key and time changes that happen at a
   page break, with divisions normalised across pages. Piece boundaries are
   proposed from final barlines and staff-count changes, and the user confirms
   them — a wrong automatic split is worse than none.

## Development

```bash
docker compose up --build
```

- Site: `http://localhost:5173`
- API: `http://localhost:8000` (docs at `/docs`)
- Recognition service: internal

The first build downloads HOMR's models and takes a while. The API runs the
recognition worker inline in this setup (`RUN_INLINE_WORKER=1`).

### Without Docker

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

```bash
cd frontend
npm install
npm run dev
```

Recognition needs the HOMR service; everything else works without it.

### Tests

```bash
cd backend && .venv/bin/python -m pytest      # 101 tests
cd frontend && npm test                        # 103 tests
npx eslint src                                 # no warnings expected
```

The frontend suite includes integration tests that load every kind of edited
document into the real Verovio build, because a document can be structurally
plausible and still be refused by the engine.

`e2e/journey.js` drives a real browser through the whole flow — see
`e2e/README.md`. Several bugs were only visible there.

## Production

The compose file runs five services: database, recognition, API, **worker**,
and the static site.

```bash
cp .env.example .env
# set POSTGRES_PASSWORD, JWT_SECRET, ALLOWED_ORIGINS, VITE_API_URL
openssl rand -hex 32     # for JWT_SECRET
docker compose -f docker-compose.prod.yml up --build -d
```

The worker is a separate container on purpose. Recognition is CPU-bound and
runs for minutes at a time, so it should not compete with request handling; the
queue lives in the database, so the worker can be scaled to several replicas
and a restart requeues whatever was in flight instead of losing it.

### Behind Plesk

**Site** (e.g. `musicatte.example.com`): serve `frontend/dist`, or reverse
proxy to the frontend container. Single-page app, so every path must fall back
to `index.html`:

```apache
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

**API** (e.g. `api.musicatte.example.com`): reverse proxy to
`http://127.0.0.1:8010`, SSL via Let's Encrypt, and set
`ALLOWED_ORIGINS=https://musicatte.example.com`.

Uploads can be large, so raise the proxy's body limit to match
`MAX_UPLOAD_BYTES` (nginx: `client_max_body_size 16m`).

### Schema changes

`ensure_schema()` creates missing tables and adds columns introduced after
release. It is deliberately limited to `ADD COLUMN` plus one backfill; adopt
Alembic before the first change it cannot express.

## Environment

See `.env.example` for the full list with comments. The ones that matter:

| Variable | Default | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | **required** | |
| `JWT_SECRET` | **required** | `openssl rand -hex 32` |
| `ALLOWED_ORIGINS` | `*` | Set it to your site in production |
| `VITE_API_URL` | `http://localhost:8000` | Baked in at build time |
| `MAX_UPLOAD_BYTES` | 16 MB | Phone photos are 4–12 MB. Served to the client from `/api/ocr/limits`, so it is stated once |
| `OCR_VARIANTS` | `2` | Recognition passes per page. Each costs a full pass and buys accuracy |
| `OCR_MAX_PAGES` | `15` | Per PDF |
| `HOMR_TIMEOUT_SECONDS` | `600` | Per page |
| `HOMR_REF` | `v0.6.0` | Pinned, so accuracy cannot change between builds |
| `RUN_INLINE_WORKER` | `1` | Set to `0` when running a separate worker |
| `UPLOAD_RETENTION_HOURS` | `48` | Uploads are swept on startup |

## Documentation

- `docs/REVISION.md` — the review this rewrite came from, with what was wrong
  and why. Useful context before changing the recognition pipeline or the
  editing core.
- `backend/API_CONTRACT_v1.md` — the HTTP API.
