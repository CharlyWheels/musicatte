from tests.conftest import FULL_MEASURE, make_score, musicxml, note


def test_auth_register_login_me(client, user):
    me = client.get("/api/auth/me", headers=user["headers"])
    assert me.status_code == 200
    assert me.json()["email"] == user["email"]


def test_register_rejects_duplicate_email(client, user):
    response = client.post(
        "/api/auth/register", json={"email": user["email"], "password": "password123"}
    )
    assert response.status_code == 400


def test_login_with_wrong_password(client, user):
    response = client.post(
        "/api/auth/login", json={"email": user["email"], "password": "wrong-password"}
    )
    assert response.status_code == 401


def test_score_crud(client, user, sample_musicxml):
    created = make_score(client, user, title="Estudio", score_data=sample_musicxml)
    assert created["title"] == "Estudio"
    assert created["score_format"] == "musicxml"
    assert created["version"] == 1

    fetched = client.get(f"/api/scores/{created['id']}", headers=user["headers"]).json()
    assert fetched["score_data"] == sample_musicxml

    updated = client.put(
        f"/api/scores/{created['id']}",
        json={
            "title": "Estudio nº1",
            "instrument": "guitar",
            "genre": "classical",
            "score_data": sample_musicxml,
            "score_format": "musicxml",
        },
        headers=user["headers"],
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Estudio nº1"
    assert updated.json()["version"] == 2

    assert client.delete(
        f"/api/scores/{created['id']}", headers=user["headers"]
    ).status_code == 204
    assert client.get(
        f"/api/scores/{created['id']}", headers=user["headers"]
    ).status_code == 404


def test_metadata_only_update_does_not_need_the_notation(client, user):
    """Renaming a score used to require resending the entire document."""
    score = make_score(client, user)
    response = client.patch(
        f"/api/scores/{score['id']}",
        json={"title": "Nuevo nombre", "instrument": "violin", "genre": "jazz"},
        headers=user["headers"],
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Nuevo nombre"
    assert response.json()["score_data"] == score["score_data"]


def test_stale_write_is_rejected(client, user, sample_musicxml):
    """The version column existed but nothing ever checked it."""
    score = make_score(client, user)
    payload = {
        "title": "v2",
        "instrument": "piano",
        "genre": "general",
        "score_data": sample_musicxml,
        "score_format": "musicxml",
        "base_version": 1,
    }
    assert client.put(
        f"/api/scores/{score['id']}", json=payload, headers=user["headers"]
    ).status_code == 200

    # Same base_version again: the score has moved on since.
    response = client.put(
        f"/api/scores/{score['id']}", json=payload, headers=user["headers"]
    )
    assert response.status_code == 409
    assert "modificado" in response.json()["detail"]


def test_legacy_musicxml_field_still_accepted(client, user, sample_musicxml):
    """An older client sending `musicxml` keeps working."""
    response = client.post(
        "/api/scores",
        json={
            "title": "Cliente antiguo",
            "instrument": "piano",
            "genre": "general",
            "musicxml": sample_musicxml,
        },
        headers=user["headers"],
    )
    assert response.status_code == 201
    assert response.json()["score_data"] == sample_musicxml


def test_score_requires_notation(client, user):
    response = client.post(
        "/api/scores",
        json={"title": "Vacía", "instrument": "piano", "genre": "general"},
        headers=user["headers"],
    )
    assert response.status_code == 422


def test_ocr_limits_are_served_not_guessed(client):
    """The scanner said 8 MB while the server allowed 16."""
    limits = client.get("/api/ocr/limits").json()
    assert limits["max_upload_bytes"] > 0
    assert limits["max_pages"] >= 1
    assert "image/jpeg" in limits["accepted_types"]
    assert "application/pdf" in limits["accepted_types"]


def test_upload_rejects_content_that_is_not_an_image(client, user):
    """The type used to be taken from the client's own content-type header."""
    response = client.post(
        "/api/ocr/jobs",
        files={"image": ("evil.png", b"this is not a png at all", "image/png")},
        headers=user["headers"],
    )
    assert response.status_code == 415
    assert "no parece una imagen" in response.json()["detail"]


def test_upload_rejects_unknown_declared_type(client, user):
    response = client.post(
        "/api/ocr/jobs",
        files={"image": ("notes.txt", b"hello", "text/plain")},
        headers=user["headers"],
    )
    assert response.status_code == 415


def test_upload_over_the_limit_is_refused_with_a_useful_message(client, user, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "max_upload_bytes", 1024)
    payload = b"\x89PNG\r\n\x1a\n" + b"0" * 4096
    response = client.post(
        "/api/ocr/jobs",
        files={"image": ("big.png", payload, "image/png")},
        headers=user["headers"],
    )
    assert response.status_code == 413
    assert "MB" in response.json()["detail"]


def test_repository_flow_is_readable_end_to_end(client, user, other_user):
    """Publishing used to put a score in a list nobody could open."""
    score = make_score(client, user, title="Vals público")
    published = client.post(
        f"/api/repository/{score['id']}/publish", headers=user["headers"]
    )
    assert published.status_code == 200

    listing = client.get("/api/repository?q=Vals").json()
    row = next(item for item in listing["items"] if item["id"] == score["id"])
    assert row["author"]
    assert "@" not in row["author"], "emails must not be exposed publicly"

    # Anyone, signed in or not, can now actually read it.
    public = client.get(f"/api/repository/{score['id']}")
    assert public.status_code == 200
    assert public.json()["score_data"] == score["score_data"]
    assert "user_id" not in public.json()

    rated = client.put(
        f"/api/repository/{score['id']}/rating",
        json={"value": 4},
        headers=other_user["headers"],
    )
    assert rated.status_code == 200
    assert rated.json()["avg_rating"] == 4.0
    assert rated.json()["rating_count"] == 1

    unpublished = client.post(
        f"/api/repository/{score['id']}/unpublish", headers=user["headers"]
    )
    assert unpublished.status_code == 200
    assert client.get(f"/api/repository/{score['id']}").status_code == 404


def test_unpublished_scores_are_not_public(client, user):
    score = make_score(client, user)
    assert client.get(f"/api/repository/{score['id']}").status_code == 404


def test_export_produces_real_musicxml(client, user):
    """The editor's export button used to hand the user MEI named .xml."""
    score = make_score(client, user)
    response = client.get(
        f"/api/scores/{score['id']}/export?format=musicxml", headers=user["headers"]
    )
    assert response.status_code == 200
    assert b"<score-partwise" in response.content
    assert "musicxml" in response.headers["content-disposition"]


def test_export_midi_and_mxl(client, user):
    score = make_score(client, user)
    midi = client.get(f"/api/scores/{score['id']}/export?format=midi", headers=user["headers"])
    assert midi.status_code == 200
    assert midi.content[:4] == b"MThd"

    mxl = client.get(f"/api/scores/{score['id']}/export?format=mxl", headers=user["headers"])
    assert mxl.status_code == 200
    assert mxl.content[:2] == b"PK"


def test_export_rejects_unknown_format(client, user):
    score = make_score(client, user)
    response = client.get(
        f"/api/scores/{score['id']}/export?format=pdf", headers=user["headers"]
    )
    assert response.status_code == 400


def test_import_musicxml(client, user, sample_musicxml):
    response = client.post(
        "/api/import",
        files={"file": ("sonata.musicxml", sample_musicxml.encode(), "application/xml")},
        headers=user["headers"],
    )
    assert response.status_code == 200
    body = response.json()
    assert body["score_format"] == "musicxml"
    assert body["title"] == "Prueba"
    assert "<score-partwise" in body["score_data"]


def test_import_rejects_nonsense(client, user):
    response = client.post(
        "/api/import",
        files={"file": ("notes.txt", b"just some text", "text/plain")},
        headers=user["headers"],
    )
    assert response.status_code == 422
    assert "Formato no reconocido" in response.json()["detail"]


def test_health_reports_queue_depth(client):
    body = client.get("/health").json()
    assert body["ok"] is True
    assert body["database"] is True
    assert "ocr_pending" in body


def test_scores_are_searchable_by_title(client, user):
    make_score(client, user, title="Preludio en Do")
    make_score(client, user, title="Fuga en Re")
    items = client.get("/api/scores?q=Preludio", headers=user["headers"]).json()["items"]
    assert [item["title"] for item in items] == ["Preludio en Do"]


def test_multi_staff_score_survives_a_round_trip(client, user):
    """A grand staff must come back exactly as it went in."""
    grand = musicxml(
        [
            note("C", 5, 16, "whole", staff=1)
            + "<backup><duration>16</duration></backup>"
            + note("C", 3, 16, "whole", staff=2)
        ],
        staves=2,
    )
    score = make_score(client, user, score_data=grand)
    fetched = client.get(f"/api/scores/{score['id']}", headers=user["headers"]).json()
    assert fetched["score_data"] == grand
    assert "<staves>2</staves>" in fetched["score_data"]
    _ = FULL_MEASURE
