from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.settings import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db() -> None:
    from app import models

    Base.metadata.create_all(bind=engine)
    _ensure_locations_day_index_column()


def _ensure_locations_day_index_column() -> None:
    if not settings.database_url.startswith("sqlite"):
        return

    with engine.connect() as conn:
        rows = conn.exec_driver_sql("PRAGMA table_info(locations)").fetchall()
        cols = {row[1] for row in rows}
        if "day_index" in cols:
            return
        conn.exec_driver_sql("ALTER TABLE locations ADD COLUMN day_index INTEGER NOT NULL DEFAULT 1")
        conn.commit()


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
