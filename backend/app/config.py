import os

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = os.getenv("APP_NAME", "Musicatte API")
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-in-production-32chars")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    access_token_minutes: int = int(os.getenv("ACCESS_TOKEN_MINUTES", str(60 * 24)))
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./musicatte.db")
    max_upload_bytes: int = int(os.getenv("MAX_UPLOAD_BYTES", str(8 * 1024 * 1024)))


settings = Settings()
