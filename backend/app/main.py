import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import Base, engine
from .models import ocr_job, rating, score, user  # noqa: F401
from .routers import auth, ocr, repository, scores

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ready")
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_request_time(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    logger.info("%s %s %.2fms", request.method, request.url.path, elapsed_ms)
    return response


@app.get("/health")
def health():
    return {"ok": True}


app.include_router(auth.router)
app.include_router(scores.router)
app.include_router(ocr.router)
app.include_router(repository.router)
