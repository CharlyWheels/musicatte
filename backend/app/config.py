import os

from pydantic import BaseModel


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _list_env(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


class Settings(BaseModel):
    app_name: str = os.getenv("APP_NAME", "Musicatte API")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production-32chars")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_minutes: int = _int_env("ACCESS_TOKEN_MINUTES", 60 * 24)
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./musicatte.db")
    allowed_origins: list[str] = _list_env("ALLOWED_ORIGINS", "*")

    # Uploads. Phone photos routinely land between 4 and 12 MB, so the default
    # has to be comfortably above that. Keep this in sync with the value the
    # scanner shows the user (it reads it from /api/ocr/limits).
    max_upload_bytes: int = _int_env("MAX_UPLOAD_BYTES", 16 * 1024 * 1024)

    # OCR
    homr_url: str = os.getenv("HOMR_URL", "http://localhost:8080")
    homr_timeout_seconds: float = float(_int_env("HOMR_TIMEOUT_SECONDS", 600))
    ocr_max_pages: int = _int_env("OCR_MAX_PAGES", 15)
    # How many preprocessing variants to try per page. Each variant costs one
    # full HOMR pass, and the best one is picked by rhythmic consistency.
    ocr_variants: int = _int_env("OCR_VARIANTS", 2)
    # Files under uploads/ older than this are deleted on startup.
    upload_retention_hours: int = _int_env("UPLOAD_RETENTION_HOURS", 48)

    # Whether the API process also drains the OCR queue. Handy for a
    # single-container development setup; in production the worker runs as its
    # own service (see docker-compose.prod.yml) so recognition does not
    # compete with request handling, and running both would double-process.
    run_inline_worker: bool = os.getenv("RUN_INLINE_WORKER", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "",
    )


settings = Settings()
