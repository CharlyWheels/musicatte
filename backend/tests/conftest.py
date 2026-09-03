import os
import tempfile
from uuid import uuid4

import pytest

# A throwaway database per test session, before app modules read the setting.
_TMP_DB = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TMP_DB.name}")
os.environ.setdefault("JWT_SECRET", "test-secret-not-used-in-production")

from fastapi.testclient import TestClient  # noqa: E402

from app.database import ensure_schema  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema():
    ensure_schema()
    yield
    try:
        os.unlink(_TMP_DB.name)
    except OSError:
        pass


@pytest.fixture()
def client():
    # TestClient as a context manager would start the lifespan, and with it the
    # OCR worker thread. Tests drive recognition directly instead.
    return TestClient(app)


@pytest.fixture()
def user(client):
    """A registered, logged-in user: (email, token, id)."""
    return make_user(client)


@pytest.fixture()
def other_user(client):
    return make_user(client)


def make_user(client):
    email = f"user-{uuid4().hex[:10]}@example.com"
    password = "password123"
    registered = client.post("/api/auth/register", json={"email": email, "password": password})
    assert registered.status_code == 201, registered.text
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    return {
        "email": email,
        "password": password,
        "token": token,
        "id": registered.json()["id"],
        "headers": {"Authorization": f"Bearer {token}"},
    }


# ─────────────────────── notation fixtures ───────────────────────


def musicxml(measures: list[str], divisions=4, fifths=0, beats=4, beat_type=4, staves=1,
             title="Prueba") -> str:
    attributes = (
        f"<attributes><divisions>{divisions}</divisions>"
        f"<key><fifths>{fifths}</fifths></key>"
        f"<time><beats>{beats}</beats><beat-type>{beat_type}</beat-type></time>"
        + (f"<staves>{staves}</staves>" if staves > 1 else "")
        + "<clef><sign>G</sign><line>2</line></clef></attributes>"
    )
    body = "".join(
        f'<measure number="{index}">{attributes if index == 1 else ""}{content}</measure>'
        for index, content in enumerate(measures, 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<score-partwise version="3.1">'
        f"<work><work-title>{title}</work-title></work>"
        '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>'
        f'<part id="P1">{body}</part>'
        "</score-partwise>"
    )


def note(step="C", octave=4, duration=4, note_type="quarter", chord=False, staff=None):
    parts = ["<note>"]
    if chord:
        parts.append("<chord/>")
    parts.append(f"<pitch><step>{step}</step><octave>{octave}</octave></pitch>")
    parts.append(f"<duration>{duration}</duration><type>{note_type}</type>")
    if staff:
        parts.append(f"<staff>{staff}</staff>")
    parts.append("</note>")
    return "".join(parts)


FULL_MEASURE = "".join(note(step) for step in "CDEF")


@pytest.fixture()
def sample_musicxml():
    return musicxml([FULL_MEASURE, FULL_MEASURE])


def make_score(client, user, **overrides):
    payload = {
        "title": "Mi partitura",
        "instrument": "piano",
        "genre": "general",
        "score_data": musicxml([FULL_MEASURE]),
        "score_format": "musicxml",
    }
    payload.update(overrides)
    response = client.post("/api/scores", json=payload, headers=user["headers"])
    assert response.status_code == 201, response.text
    return response.json()
