# Musicatte API Contract v1

## Auth

- `POST /api/auth/register`
  - request: `{ "email": "user@example.com", "password": "min6chars" }`
  - response: `{ "id": 1, "email": "user@example.com" }`
- `POST /api/auth/login`
  - request: `{ "email": "user@example.com", "password": "..." }`
  - response: `{ "access_token": "jwt", "token_type": "bearer" }`
- `GET /api/auth/me`
  - auth: Bearer token
  - response: `{ "id": 1, "email": "user@example.com" }`

## Scores

- `POST /api/scores` (auth)
  - request: `{ title, composer?, instrument, genre, status, score_data, parent_score_id? }`
  - response: score object with `id`, `version`, `user_id`.
- `GET /api/scores/{id}` (auth, owner only)
- `PUT /api/scores/{id}` (auth, owner only)
- `DELETE /api/scores/{id}` (auth, owner only)
- `GET /api/scores?mine=true&page=1&page_size=20` (auth)

## OCR Jobs

- `POST /api/ocr/jobs` (auth, multipart `image`)
  - accepted mime: `image/png|image/jpeg|image/jpg|image/webp`
  - response: `{ id, status, score_data?, error? }`
- `GET /api/ocr/jobs/{id}` (auth)
  - states: `queued|processing|succeeded|failed`

## Repository

- `GET /api/repository?page=1&page_size=20&instrument=&genre=&q=&sort=recent`
- `POST /api/repository/{score_id}/publish` (auth, owner)
- `PUT /api/repository/{score_id}/rating` (auth, upsert)
  - request: `{ "value": 1..5 }`
  - unique vote per `(score_id, user_id)`

## Error Shape

Current FastAPI default errors are returned as:

```json
{ "detail": "error message" }
```

For v2 hardening, this can be evolved to:

```json
{ "code": "string", "message": "string", "detail": "object|string|null" }
```
