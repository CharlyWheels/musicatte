from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func as sqlfunc
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models.rating import Rating
from ..models.score import Score
from ..models.user import User
from ..schemas.score import ScoreCreate, ScoreOut, ScoreUpdate

router = APIRouter(prefix="/api/scores", tags=["scores"])


def _ensure_owner(score: Score, user: User):
    if score.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")


def _avg_rating(db: Session, score_id: int) -> float:
    avg = db.query(sqlfunc.avg(Rating.value)).filter(Rating.score_id == score_id).scalar()
    return float(avg) if avg else 0.0


def _score_out(db: Session, score: Score) -> ScoreOut:
    return ScoreOut(
        **{c.name: getattr(score, c.name) for c in score.__table__.columns},
        avg_rating=_avg_rating(db, score.id),
    )


@router.post("", response_model=ScoreOut, status_code=status.HTTP_201_CREATED)
def create_score(
    payload: ScoreCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = Score(
        **payload.model_dump(),
        user_id=current_user.id,
    )
    db.add(score)
    db.commit()
    db.refresh(score)
    return _score_out(db, score)


@router.get("/{score_id}", response_model=ScoreOut)
def get_score(
    score_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = db.get(Score, score_id)
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    _ensure_owner(score, current_user)
    return _score_out(db, score)


@router.put("/{score_id}", response_model=ScoreOut)
def update_score(
    score_id: int,
    payload: ScoreUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = db.get(Score, score_id)
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    _ensure_owner(score, current_user)
    for key, value in payload.model_dump().items():
        setattr(score, key, value)
    score.version = score.version + 1
    db.commit()
    db.refresh(score)
    return _score_out(db, score)


@router.delete("/{score_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_score(
    score_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = db.get(Score, score_id)
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    _ensure_owner(score, current_user)
    db.delete(score)
    db.commit()
    return None


@router.get("", response_model=dict)
def list_scores(
    mine: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Score)
    if mine:
        query = query.filter(Score.user_id == current_user.id)
    total = query.count()
    items = (
        query.order_by(Score.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return {
        "items": [_score_out(db, item).model_dump() for item in items],
        "page": page,
        "page_size": page_size,
        "total": total,
    }
