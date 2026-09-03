# End-to-end check

Drives a real browser through the whole journey: sign up, enter notes by
clicking at their pitch, edit them, save, publish, read the published score as
a visitor, and download it as MusicXML.

Several of the bugs this repository's review found were only visible here --
the note hit area being a couple of pixels of ink, a blank measure that could
never be filled, the engine being used after the editor was closed. Unit tests
cannot see any of those.

## Running it

Terminal 1, the API:

```bash
cd backend
DATABASE_URL="sqlite:///./e2e.db" JWT_SECRET="local-e2e-secret" \
RUN_INLINE_WORKER=0 .venv/bin/python -m uvicorn app.main:app --port 8111
```

Terminal 2, the site:

```bash
cd frontend
VITE_API_URL="http://127.0.0.1:8111" npm run build -- --outDir dist-e2e
npx vite preview --outDir dist-e2e --port 5199 --strictPort
```

Terminal 3:

```bash
npm install playwright        # once
node e2e/journey.js           # exits non-zero if any check fails
```

`SHOT=/path/to/shot.png` saves a screenshot of the last page it visited.

Recognition itself is not exercised here: it needs the HOMR container and a
couple of minutes per page. The preprocessing and validation that decide
whether recognition succeeds are covered by `backend/tests/test_ocr_pipeline.py`
against synthetic pages whose correct answer is known.
