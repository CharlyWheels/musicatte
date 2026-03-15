from uuid import uuid4

from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app

Base.metadata.create_all(bind=engine)
client = TestClient(app)


def _register_and_login():
    email = f"user-{uuid4().hex[:8]}@example.com"
    password = "password123"
    register = client.post("/api/auth/register", json={"email": email, "password": password})
    assert register.status_code == 201
    login = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    token = login.json()["access_token"]
    return email, token


def test_auth_register_login_me():
    email, token = _register_and_login()

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == email


def test_scores_repository_and_rating_flow():
    _, token = _register_and_login()
    headers = {"Authorization": f"Bearer {token}"}

    score_payload = {
        "title": "Nocturne",
        "composer": "Chopin",
        "instrument": "piano",
        "genre": "classical",
        "status": "draft",
        "score_data": {
            "schemaVersion": 1,
            "title": "Nocturne",
            "measures": [{"notes": [{"pitch": "C/4", "duration": "q", "accidental": None}]}],
        },
    }
    created = client.post("/api/scores", json=score_payload, headers=headers)
    assert created.status_code == 201
    score_id = created.json()["id"]

    mine = client.get("/api/scores?mine=true&page=1&page_size=20", headers=headers)
    assert mine.status_code == 200
    assert any(item["id"] == score_id for item in mine.json()["items"])

    published = client.post(f"/api/repository/{score_id}/publish", headers=headers)
    assert published.status_code == 200
    assert published.json()["status"] == "published"

    listed = client.get("/api/repository?page=1&page_size=20&q=Nocturne")
    assert listed.status_code == 200
    assert any(item["id"] == score_id for item in listed.json()["items"])

    rated = client.put(
        f"/api/repository/{score_id}/rating",
        json={"value": 5},
        headers=headers,
    )
    assert rated.status_code == 200
    assert rated.json()["avg_rating"] >= 1


def test_ocr_async_job_flow():
    _, token = _register_and_login()
    headers = {"Authorization": f"Bearer {token}"}
    files = {"image": ("sample.jpg", b"fake-image-bytes", "image/jpeg")}
    created = client.post("/api/ocr/jobs", files=files, headers=headers)
    assert created.status_code == 200
    job_id = created.json()["id"]

    fetched = client.get(f"/api/ocr/jobs/{job_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["status"] in {"queued", "processing", "succeeded"}
