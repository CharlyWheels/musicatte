from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models.rating import Rating
from ..models.score import Score
from ..models.user import User
from ..schemas.rating import RatingUpsert

router = APIRouter(prefix="/api/repository", tags=["repository"])


@router.get("", response_model=dict)
def list_repository(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    instrument: str | None = None,
    genre: str | None = None,
    q: str | None = None,
    sort: str = "recent",
    db: Session = Depends(get_db),
):
    query = db.query(Score).filter(Score.status == "published")
    if instrument:
        query = query.filter(Score.instrument == instrument)
    if genre:
        query = query.filter(Score.genre == genre)
    if q:
        query = query.filter(Score.title.ilike(f"%{q}%"))
    total = query.count()
    if sort == "recent":
        query = query.order_by(Score.created_at.desc())
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    rows = []
    for item in items:
      avg = db.query(func.avg(Rating.value)).filter(Rating.score_id == item.id).scalar() or 0
      rows.append({
          "id": item.id,
          "title": item.title,
          "instrument": item.instrument,
          "genre": item.genre,
          "avg_rating": float(avg),
      })
    return {"items": rows, "page": page, "page_size": page_size, "total": total}


@router.post("/{score_id}/publish", response_model=dict)
def publish_score(
    score_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = db.get(Score, score_id)
    if not score:
        raise HTTPException(status_code=404, detail="Score not found")
    if score.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not owner")
    score.status = "published"
    db.commit()
    return {"ok": True, "score_id": score_id, "status": score.status}


@router.put("/{score_id}/rating", response_model=dict)
def upsert_rating(
    score_id: int,
    payload: RatingUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    score = db.get(Score, score_id)
    if not score or score.status != "published":
        raise HTTPException(status_code=404, detail="Published score not found")
    rating = db.query(Rating).filter(Rating.score_id == score_id, Rating.user_id == current_user.id).first()
    if rating:
        rating.value = payload.value
    else:
        rating = Rating(score_id=score_id, user_id=current_user.id, value=payload.value)
        db.add(rating)
    db.commit()
    avg = db.query(func.avg(Rating.value)).filter(Rating.score_id == score_id).scalar() or 0
    return {"ok": True, "score_id": score_id, "avg_rating": float(avg)}
