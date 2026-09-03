import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models.rating import Rating
from ..models.score import Score
from ..models.user import User
from ..schemas.score import (
    ScoreCreate,
    ScoreMetaUpdate,
    ScoreOut,
    ScoreSummaryOut,
    ScoreUpdate,
)
from ..services import conversion

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scores", tags=["scores"])


def _owned_score(db: Session, score_id: int, user: User) -> Score:
    """Fetch a score the caller owns, or 404.

    404 rather than 403 on someone else's score: a 403 confirms the id exists,
    which is enough to enumerate other people's libraries.
    """
    score = db.get(Score, score_id)
    if not score or score.user_id != user.id:
        raise HTTPException(status_code=404, detail="Partitura no encontrada")
    return score


def _rating_stats(db: Session, score_ids: list[int]) -> dict[int, tuple[float, int]]:
    if not score_ids:
        return {}
    rows = (
        db.query(Rating.score_id, sqlfunc.avg(Rating.value), sqlfunc.count(Rating.id))
        .filter(Rating.score_id.in_(score_ids))
        .group_by(Rating.score_id)
        .all()
    )
    return {row[0]: (float(row[1] or 0), int(row[2] or 0)) for row in rows}


def _summary(score: Score, stats: dict[int, tuple[float, int]]) -> ScoreSummaryOut:
    avg, count = stats.get(score.id, (0.0, 0))
    return ScoreSummaryOut(
        id=score.id,
        title=score.title,
        composer=score.composer,
        instrument=score.instrument,
        genre=score.genre,
        score_format=score.score_format or "mei",
        status=score.status,
        version=score.version,
        avg_rating=avg,
        rating_count=count,
        created_at=score.created_at,
        updated_at=score.updated_at,
    )


def _full(db: Session, score: Score) -> ScoreOut:
    stats = _rating_stats(db, [score.id])
    avg, count = stats.get(score.id, (0.0, 0))
    return ScoreOut(
        **_summary(score, stats).model_dump(),
        score_data=score.score_data,
        user_id=score.user_id,
    )


@router.post("", response_model=ScoreOut, status_code=status.HTTP_201_CREATED)
def create_score(
    payload: ScoreCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = Score(
        title=payload.title,
        composer=payload.composer,
        instrument=payload.instrument,
        genre=payload.genre,
        score_data=payload.score_data,
        score_format=payload.score_format,
        status=payload.status,
        parent_score_id=payload.parent_score_id,
        user_id=current_user.id,
    )
    db.add(score)
    db.commit()
    db.refresh(score)
    return _full(db, score)


@router.get("", response_model=dict)
def list_scores(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    q: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Always scoped to the caller.

    This endpoint used to take a ``mine`` flag that defaulted to false and, in
    that case, returned every score in the database including its full
    notation. There is no legitimate use for that, so the flag is gone.
    """
    query = db.query(Score).filter(Score.user_id == current_user.id)
    if q:
        query = query.filter(Score.title.ilike(f"%{q}%"))
    total = query.count()
    items = (
        query.order_by(Score.updated_at.desc().nullslast(), Score.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    stats = _rating_stats(db, [item.id for item in items])
    return {
        "items": [_summary(item, stats).model_dump(mode="json") for item in items],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get("/{score_id}", response_model=ScoreOut)
def get_score(
    score_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _full(db, _owned_score(db, score_id, current_user))


@router.put("/{score_id}", response_model=ScoreOut)
def update_score(
    score_id: int,
    payload: ScoreUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = _owned_score(db, score_id, current_user)
    if payload.base_version is not None and payload.base_version < score.version:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Esta partitura se ha modificado en otro sitio (versión {score.version}, "
                f"tú partías de la {payload.base_version}). Recarga antes de guardar."
            ),
        )
    score.title = payload.title
    score.composer = payload.composer
    score.instrument = payload.instrument
    score.genre = payload.genre
    score.score_data = payload.score_data
    score.score_format = payload.score_format
    score.version = score.version + 1
    db.commit()
    db.refresh(score)
    return _full(db, score)


@router.patch("/{score_id}", response_model=ScoreOut)
def update_score_metadata(
    score_id: int,
    payload: ScoreMetaUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Edit title/composer/instrument/genre without resending the notation."""
    score = _owned_score(db, score_id, current_user)
    score.title = payload.title
    score.composer = payload.composer
    score.instrument = payload.instrument
    score.genre = payload.genre
    db.commit()
    db.refresh(score)
    return _full(db, score)


@router.delete("/{score_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_score(
    score_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = _owned_score(db, score_id, current_user)
    db.query(Rating).filter(Rating.score_id == score.id).delete(synchronize_session=False)
    db.delete(score)
    db.commit()
    return None


@router.get("/{score_id}/export")
def export_score(
    score_id: int,
    fmt: str = Query(default="musicxml", alias="format"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Export in a format other tools can actually open.

    The editor works in MEI, which MuseScore, Sibelius and Finale do not read.
    Conversion happens here so "Export MusicXML" produces MusicXML.
    """
    score = _owned_score(db, score_id, current_user)
    try:
        payload, media_type, extension = conversion.export_score(
            score.score_data, score.score_format or "mei", fmt
        )
    except conversion.UnsupportedFormat as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except conversion.ConversionError as exc:
        logger.warning("Export of score %s to %s failed: %s", score_id, fmt, exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    filename = conversion.safe_filename(score.title, extension)
    return Response(
        content=payload,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
