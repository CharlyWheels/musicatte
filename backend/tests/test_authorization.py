"""Regression tests for the two authorization holes found in the review.

Both were reachable by any registered account with no special tooling, so they
get explicit tests that fail loudly if the filtering is ever dropped again.
"""

from tests.conftest import make_score


def test_score_listing_never_returns_other_users_scores(client, user, other_user):
    """`GET /api/scores` used to default to returning everybody's scores.

    The endpoint took a `mine` flag defaulting to false, and in that case the
    query was unfiltered -- so one request returned every draft in the
    database, notation included.
    """
    mine = make_score(client, user, title="Mía")
    theirs = make_score(client, other_user, title="Ajena")

    response = client.get("/api/scores?page_size=100", headers=user["headers"])
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    assert mine["id"] in ids
    assert theirs["id"] not in ids

    # The old flag must not resurrect the behaviour.
    response = client.get("/api/scores?mine=false&page_size=100", headers=user["headers"])
    ids = [item["id"] for item in response.json()["items"]]
    assert theirs["id"] not in ids


def test_score_listing_omits_notation(client, user):
    """A listing has no business shipping full documents."""
    make_score(client, user)
    items = client.get("/api/scores", headers=user["headers"]).json()["items"]
    assert items
    for item in items:
        assert "score_data" not in item
        assert "musicxml" not in item


def test_reading_another_users_score_is_404(client, user, other_user):
    theirs = make_score(client, other_user)
    response = client.get(f"/api/scores/{theirs['id']}", headers=user["headers"])
    # 404 rather than 403: a 403 confirms the id exists.
    assert response.status_code == 404


def test_writing_another_users_score_is_404(client, user, other_user, sample_musicxml):
    theirs = make_score(client, other_user)
    payload = {
        "title": "Secuestrada",
        "instrument": "piano",
        "genre": "general",
        "score_data": sample_musicxml,
        "score_format": "musicxml",
    }
    assert client.put(
        f"/api/scores/{theirs['id']}", json=payload, headers=user["headers"]
    ).status_code == 404
    assert client.delete(
        f"/api/scores/{theirs['id']}", headers=user["headers"]
    ).status_code == 404


def test_ocr_jobs_are_scoped_to_their_owner(client, user, other_user):
    """`ocr_jobs` had no owner column, so any id could be read by anyone."""
    from app.database import SessionLocal
    from app.models.ocr_job import OcrJob

    db = SessionLocal()
    try:
        job = OcrJob(
            user_id=other_user["id"],
            status="succeeded",
            image_path="uploads/does-not-exist.png",
            musicxml="<score-partwise/>",
        )
        db.add(job)
        db.commit()
        job_id = job.id
    finally:
        db.close()

    assert client.get(f"/api/ocr/jobs/{job_id}", headers=user["headers"]).status_code == 404
    assert client.get(
        f"/api/ocr/jobs/{job_id}", headers=other_user["headers"]
    ).status_code == 200

    listed = client.get("/api/ocr/jobs", headers=user["headers"]).json()["items"]
    assert job_id not in [item["id"] for item in listed]


def test_unauthenticated_requests_are_rejected(client):
    # 401 with a WWW-Authenticate challenge, which is what a missing
    # credential means -- 403 would mean "authenticated but not allowed".
    for path in ("/api/scores", "/api/scores/1", "/api/ocr/jobs/1"):
        assert client.get(path).status_code == 401, path


def test_invalid_token_is_rejected(client):
    headers = {"Authorization": "Bearer not-a-real-token"}
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert client.get("/api/scores", headers=headers).status_code == 401


def test_rating_your_own_score_is_refused(client, user):
    score = make_score(client, user)
    client.post(f"/api/repository/{score['id']}/publish", headers=user["headers"])
    response = client.put(
        f"/api/repository/{score['id']}/rating", json={"value": 5}, headers=user["headers"]
    )
    assert response.status_code == 400
