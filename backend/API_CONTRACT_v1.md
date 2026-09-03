# Musicatte API

Base URL from `VITE_API_URL`. Interactive docs at `/docs`.

Authentication is a bearer token: `Authorization: Bearer <access_token>`.
A missing or invalid token answers **401** with a `WWW-Authenticate` header —
deliberately, and in our own code, because FastAPI has answered a missing
header with 403 in some versions and 401 in others and clients branch on it.

Reading or writing something that belongs to someone else answers **404**, not
403: a 403 confirms the id exists, which is all that is needed to enumerate
other people's libraries.

## Auth

| | |
|---|---|
| `POST /api/auth/register` | `{email, password}` (min 6) → `{id, email}` · 201 |
| `POST /api/auth/login` | `{email, password}` → `{access_token, token_type}` |
| `GET /api/auth/me` | → `{id, email}` |

## Scores

Always scoped to the caller. There is no way to ask for anyone else's.

| | |
|---|---|
| `POST /api/scores` | Create. → full score · 201 |
| `GET /api/scores?page=1&page_size=20&q=` | List. **Summaries only** — no notation |
| `GET /api/scores/{id}` | One score, notation included |
| `PUT /api/scores/{id}` | Replace, notation included |
| `PATCH /api/scores/{id}` | Metadata only — does not resend the notation |
| `DELETE /api/scores/{id}` | 204 |
| `GET /api/scores/{id}/export?format=` | `musicxml` \| `mxl` \| `midi` \| `mei` |

Create and update body:

```json
{
  "title": "Estudio",
  "composer": null,
  "instrument": "piano",
  "genre": "general",
  "score_data": "<mei …>",
  "score_format": "mei",
  "base_version": 3
}
```

`score_format` is `mei` or `musicxml`. `musicxml` is still accepted as a field
name for the notation itself, for older clients; it always meant `score_data`.

`base_version` is optional optimistic locking: when it is older than the
stored version the write is refused with **409** rather than overwriting
somebody else's changes.

Listings return `ScoreSummaryOut` — id, title, composer, instrument, genre,
format, status, version, rating, timestamps. Not the notation: a page of 100
scores has no business shipping 100 documents.

Export converts server-side. Verovio can only write MEI, so `format=musicxml`
is a real conversion through music21; a bad or unconvertible document answers
**422** with a reason, an unknown format **400**.

## Import

| | |
|---|---|
| `POST /api/import` | multipart `file` → `{title, score_data, score_format}` |

Accepts MusicXML, compressed MusicXML (`.mxl`), MEI and MIDI. MIDI and `.mxl`
are normalised to MusicXML, which the editor loads directly. Unrecognised
content answers **422** naming the formats that work.

## Scanning

| | |
|---|---|
| `GET /api/ocr/limits` | `{max_upload_bytes, max_pages, accepted_types}` |
| `POST /api/ocr/analyze` | multipart `image` → `{usable, message, report}` |
| `POST /api/ocr/jobs` | multipart `image` → job · 201 |
| `GET /api/ocr/jobs?limit=10` | The caller's recent scans |
| `GET /api/ocr/jobs/{id}` | One scan |
| `POST /api/ocr/jobs/{id}/split` | `{boundaries: [1, 5]}` → re-cut pieces |
| `POST /api/ocr/jobs/{id}/retry` | Requeue a finished or failed scan |
| `DELETE /api/ocr/jobs/{id}` | 204, and deletes the upload |

`/limits` exists so the client cannot claim one size limit while the server
enforces another.

`/analyze` judges a photo without recognising it — blur, resolution, residual
tilt, whether any staves are there — so a hopeless photo costs a second
instead of a couple of minutes.

Uploads are streamed with the size checked as bytes arrive (**413** past the
limit) and the type is sniffed from the content, not taken from
`content_type` (**415**). Accepted: PNG, JPEG, WEBP, PDF.

Job shape:

```json
{
  "id": 12,
  "status": "queued|processing|succeeded|failed",
  "progress": { "current": 3, "total": 12 },
  "original_filename": "IMG_4821.jpg",
  "error": null,
  "musicxml": "…first piece…",
  "pieces": [
    {
      "title": "Minueto",
      "musicxml": "…",
      "pages": [1, 2],
      "measures": 34,
      "consistency": 0.94,
      "warnings": [
        {
          "measure": 7,
          "kind": "measure_duration",
          "severity": "error",
          "message": "Compás 7: 3.5 de 4 tiempos…"
        }
      ],
      "warning_counts": { "error": 1, "warning": 0, "info": 2 }
    }
  ],
  "pages": [
    {
      "page": 1,
      "variant": "binarizada",
      "consistency": 0.94,
      "staff_count": 2,
      "title": "Minueto",
      "ends_piece": false,
      "image_problems": []
    }
  ],
  "warnings": [],
  "suggested_boundaries": [1, 3]
}
```

`pages` omits each page's notation: it is already in the assembled pieces, and
sending it twice doubles the payload of a long document.

`consistency` is the fraction of measures whose durations add up. It is how
the best of several recognition passes is chosen, and it is worth showing the
user: a low number means the result needs checking, whatever it looks like.

`/split` re-cuts piece boundaries from the stored per-page results, so it is
instant and does not re-run recognition. `suggested_boundaries` is a proposal;
the user decides.

## Repository

| | |
|---|---|
| `GET /api/repository?page=&page_size=&q=&instrument=&genre=&sort=` | Public listing |
| `GET /api/repository/{id}` | **Public.** A published score, notation included |
| `GET /api/repository/{id}/export?format=` | **Public.** Download |
| `POST /api/repository/{id}/publish` | Owner only |
| `POST /api/repository/{id}/unpublish` | Owner only |
| `PUT /api/repository/{id}/rating` | `{value: 1..5}`, one per user |

`sort` is `recent`, `rating` or `title`.

Rows carry `author` — a display name, never an email — plus `avg_rating`,
`rating_count`, and when signed in `my_rating` and `is_mine`.

`GET /api/repository/{id}` is the endpoint the community section used to lack
entirely: publishing added a score to a list that nobody, including its own
author, had any way to open. It needs no account, and it returns no `user_id`.

Rating your own score answers **400**. An unpublished or missing score answers
**404** everywhere in this section.

## Health

`GET /health` → `{ok, database, ocr_pending}`. `ocr_pending` is the queue
depth, which is the number worth alerting on.
