import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the first release. ``Base.metadata.create_all`` only
# creates missing tables, never missing columns, so an existing database would
# keep the old shape and every query touching a new column would fail. These
# additive statements run once at startup and are safe to re-run.
#
# This is deliberately limited to "ADD COLUMN" and one data backfill. Anything
# beyond that (renames that must preserve data, type changes, constraints)
# needs a real migration tool; adopt Alembic before the first schema change
# that this cannot express.
_ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("users", "display_name", "VARCHAR(80)"),
    ("scores", "score_data", "TEXT"),
    ("scores", "score_format", "VARCHAR(20)"),
    ("ocr_jobs", "user_id", "INTEGER"),
    ("ocr_jobs", "progress_current", "INTEGER"),
    ("ocr_jobs", "progress_total", "INTEGER"),
    ("ocr_jobs", "warnings_json", "TEXT"),
    ("ocr_jobs", "pages_json", "TEXT"),
    ("ocr_jobs", "original_filename", "VARCHAR(255)"),
    ("ocr_jobs", "claimed_at", "TIMESTAMP"),
    ("ocr_jobs", "attempts", "INTEGER DEFAULT 0"),
]


def ensure_schema() -> None:
    """Create missing tables, then add columns introduced after release."""
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, column, ddl_type in _ADDED_COLUMNS:
            if table not in existing_tables:
                continue
            columns = {c["name"] for c in inspector.get_columns(table)}
            if column in columns:
                continue
            logger.info("Adding column %s.%s", table, column)
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))

        # Scores used to keep their notation in a column called ``musicxml``
        # that actually held MEI (that mislabelling is the bug being fixed).
        # Move any legacy content into score_data, tag it as MEI -- which is
        # what it really was -- and drop the misnamed column. The old column is
        # NOT NULL, so it has to go: leaving it in place would make every new
        # insert fail.
        if "scores" in existing_tables:
            columns = {c["name"] for c in inspect(engine).get_columns("scores")}
            if "musicxml" in columns and "score_data" in columns:
                conn.execute(
                    text(
                        "UPDATE scores SET score_data = musicxml, score_format = 'mei' "
                        "WHERE score_data IS NULL AND musicxml IS NOT NULL"
                    )
                )
                try:
                    conn.execute(text("ALTER TABLE scores DROP COLUMN musicxml"))
                    logger.info("Dropped legacy scores.musicxml (content kept in score_data)")
                except Exception:
                    logger.exception(
                        "Could not drop legacy scores.musicxml. Its content has been copied "
                        "to score_data, but the column is NOT NULL so new scores cannot be "
                        "inserted until it is dropped or made nullable by hand."
                    )
            if "score_format" in columns:
                conn.execute(
                    text("UPDATE scores SET score_format = 'mei' WHERE score_format IS NULL")
                )
