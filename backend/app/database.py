import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from .models.base_model import Base

# Get the database URL from the environment
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///sqlite/test.db")

# Create the SQLAlchemy engine
engine = create_engine(DATABASE_URL)

# Create all tables
Base.metadata.create_all(bind=engine)

# Create a configured "Session" class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
