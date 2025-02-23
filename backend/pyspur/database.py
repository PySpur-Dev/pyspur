import os
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

# Get the database URL from the environment
POSTGRES_USER = os.getenv("POSTGRES_USER")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD")
POSTGRES_HOST = os.getenv("POSTGRES_HOST")
POSTGRES_PORT = os.getenv("POSTGRES_PORT")
POSTGRES_DB = os.getenv("POSTGRES_DB")

database_url = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

sqlite_override_database_url = os.getenv("SQLITE_OVERRIDE_DATABASE_URL")
if sqlite_override_database_url:
    database_url = sqlite_override_database_url

# Create the SQLAlchemy engine
engine = create_engine(database_url)

# Create a configured "Session" class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Iterator[Session]:
    """Get a database connection."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_db_connected() -> bool:
    """Check if the database is connected."""
    try:
        engine.connect()
        return True
    except Exception:
        return False
