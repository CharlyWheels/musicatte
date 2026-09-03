from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models.user import User
from .services.auth import decode_access_token

# auto_error is off on both so the response to a missing credential is ours
# rather than the framework's: FastAPI has answered a missing Authorization
# header with 403 in some versions and 401 in others, and clients branch on
# that code to decide whether to send the user to the sign-in screen.
security = HTTPBearer(auto_error=False)
# Public endpoints that behave slightly differently when signed in (showing
# "you rated this 4 stars", say) need the token to be optional rather than
# required.
optional_security = HTTPBearer(auto_error=False)


def _user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
    except Exception:
        return None
    return db.get(User, user_id)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Necesitas iniciar sesión.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = _user_from_token(credentials.credentials, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión no válida o caducada. Vuelve a entrar.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    return _user_from_token(credentials.credentials, db)
