"""
Database configuration — SQLAlchemy engine, session factory, and Base.
Loads the MySQL connection string from the DATABASE_URL environment variable
defined in the .env file.
"""

import os

from dotenv import load_dotenv 
from sqlalchemy import create_engine 
from sqlalchemy.orm import sessionmaker, declarative_base

 
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "Create a .env file with: DATABASE_URL=mysql+pymysql://user:pass@localhost:3306/campusclimb_nlp"
    )

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency that provides a database session.

    Yields a SQLAlchemy session and ensures it is closed after the request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
