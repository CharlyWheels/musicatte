from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models.score import Score
from ..models.user import User
from ..schemas.score import ScoreCreate, ScoreOut, ScoreUpdate
from ..services.musicxml_service import score_to_musicxml

router = APIRouter(prefix="/api/scores", tags=["scores"])


def _ensure_owner(score: Score, user: User):
    if score.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")


@router.post("", response_model=ScoreOut, status_code=status.HTTP_201_CREATED)
def create_score(
    payload: ScoreCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = Score(
        **payload.model_dump(),
        user_id=current_user.id,
        musicxml=score_to_musicxml(payload.score_data),
    )
    db.add(score)
    db.commit()
    db.refresh(score)
    return ScoreOut(**score.__dict__, avg_rating=0)


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
    return ScoreOut(**score.__dict__, avg_rating=0)


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
    score.musicxml = score_to_musicxml(score.score_data)
    db.commit()
    db.refresh(score)
    return ScoreOut(**score.__dict__, avg_rating=0)


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
        "items": [ScoreOut(**item.__dict__, avg_rating=0).model_dump() for item in items],
        "page": page,
        "page_size": page_size,
        "total": total,
    }
