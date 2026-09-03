import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user, get_optional_user
from ..models.rating import Rating
from ..models.score import Score
from ..models.user import User
from ..schemas.rating import RatingUpsert
from ..schemas.score import PublicScoreOut
from ..services import conversion

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/repository", tags=["repository"])

SORTS = {"recent", "rating", "title"}


def _published(db: Session, score_id: int) -> Score:
    score = db.get(Score, score_id)
    if not score or score.status != "published":
        raise HTTPException(status_code=404, detail="Partitura publicada no encontrada")
    return score


def _stats(db: Session, score_ids: list[int]) -> dict[int, tuple[float, int]]:
    if not score_ids:
        return {}
    rows = (
        db.query(Rating.score_id, func.avg(Rating.value), func.count(Rating.id))
        .filter(Rating.score_id.in_(score_ids))
        .group_by(Rating.score_id)
        .all()
    )
    return {row[0]: (float(row[1] or 0), int(row[2] or 0)) for row in rows}


@router.get("", response_model=dict)
def list_repository(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    instrument: str | None = None,
    genre: str | None = None,
    q: str | None = None,
    sort: str = "recent",
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    """Browse published scores.

    Each row now carries enough to be worth clicking -- author, measure of how
    many people rated it, and an id that resolves to a page anyone can open.
    Previously the listing had no author and there was no public endpoint to
    read a score's contents, so the community section let people rate scores
    they could not see.
    """
    query = (
        db.query(Score, User)
        .join(User, User.id == Score.user_id)
        .filter(Score.status == "published")
    )
    if instrument:
        query = query.filter(Score.instrument == instrument)
    if genre:
        query = query.filter(Score.genre == genre)
    if q:
        pattern = f"%{q}%"
        query = query.filter(Score.title.ilike(pattern) | Score.composer.ilike(pattern))

    total = query.count()

    if sort not in SORTS:
        sort = "recent"
    if sort == "title":
        query = query.order_by(Score.title.asc())
    else:
        # "rating" is applied after the ratings are fetched, below.
        query = query.order_by(Score.created_at.desc(), Score.id.desc())

    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    stats = _stats(db, [score.id for score, _ in rows])

    mine: set[int] = set()
    my_ratings: dict[int, int] = {}
    if current_user is not None:
        rated = (
            db.query(Rating)
            .filter(
                Rating.user_id == current_user.id,
                Rating.score_id.in_([score.id for score, _ in rows] or [0]),
            )
            .all()
        )
        my_ratings = {rating.score_id: rating.value for rating in rated}
        mine = {score.id for score, _ in rows if score.user_id == current_user.id}

    items = []
    for score, author in rows:
        avg, count = stats.get(score.id, (0.0, 0))
        items.append(
            {
                "id": score.id,
                "title": score.title,
                "composer": score.composer,
                "instrument": score.instrument,
                "genre": score.genre,
                "author": author.public_name,
                "avg_rating": avg,
                "rating_count": count,
                "my_rating": my_ratings.get(score.id),
                "is_mine": score.id in mine,
                "created_at": score.created_at.isoformat() if score.created_at else None,
            }
        )

    if sort == "rating":
        items.sort(key=lambda item: (item["avg_rating"], item["rating_count"]), reverse=True)

    return {"items": items, "page": page, "page_size": page_size, "total": total}


@router.get("/{score_id}", response_model=PublicScoreOut)
def get_published_score(score_id: int, db: Session = Depends(get_db)):
    """Read a published score. No account required.

    This is the endpoint the community section was missing: publishing used to
    put a score in a list that nobody -- including its own author, from that
    page -- could open.
    """
    score = _published(db, score_id)
    author = db.get(User, score.user_id)
    avg, count = _stats(db, [score.id]).get(score.id, (0.0, 0))
    return PublicScoreOut(
        id=score.id,
        title=score.title,
        composer=score.composer,
        instrument=score.instrument,
        genre=score.genre,
        score_format=score.score_format or "mei",
        score_data=score.score_data,
        author=author.public_name if author else "anónimo",
        avg_rating=avg,
        rating_count=count,
        created_at=score.created_at,
    )


@router.get("/{score_id}/export")
def export_published_score(
    score_id: int,
    fmt: str = Query(default="musicxml", alias="format"),
    db: Session = Depends(get_db),
):
    """Download a published score in a format other tools can open."""
    score = _published(db, score_id)
    try:
        payload, media_type, extension = conversion.export_score(
            score.score_data, score.score_format or "mei", fmt
        )
    except conversion.UnsupportedFormat as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except conversion.ConversionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return Response(
        content=payload,
        media_type=media_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{conversion.safe_filename(score.title, extension)}"'
            )
        },
    )


@router.post("/{score_id}/publish", response_model=dict)
def publish_score(
    score_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = db.get(Score, score_id)
    if not score or score.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Partitura no encontrada")
    score.status = "published"
    db.commit()
    return {"ok": True, "score_id": score_id, "status": score.status}


@router.post("/{score_id}/unpublish", response_model=dict)
def unpublish_score(
    score_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Take a score back off the repository."""
    score = db.get(Score, score_id)
    if not score or score.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Partitura no encontrada")
    score.status = "draft"
    db.commit()
    return {"ok": True, "score_id": score_id, "status": score.status}


@router.put("/{score_id}/rating", response_model=dict)
def upsert_rating(
    score_id: int,
    payload: RatingUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = _published(db, score_id)
    if score.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes valorar tu propia partitura.")

    rating = (
        db.query(Rating)
        .filter(Rating.score_id == score_id, Rating.user_id == current_user.id)
        .first()
    )
    if rating:
        rating.value = payload.value
    else:
        db.add(Rating(score_id=score_id, user_id=current_user.id, value=payload.value))
    db.commit()

    avg, count = _stats(db, [score_id]).get(score_id, (0.0, 0))
    return {
        "ok": True,
        "score_id": score_id,
        "avg_rating": avg,
        "rating_count": count,
        "my_rating": payload.value,
    }
