"""
FastAPI Application Entry Point.

Configures CORS, database table creation on startup, security headers,
compression middleware, and registers REST API v1 routers for Auth, Uploads,
Dashboard, and Bilingual Agent.
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import inspect, text
from starlette.middleware.gzip import GZipMiddleware

# Load environment variables once at the application entrypoint
load_dotenv()

# Configure standardized root logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("campusclimb")

from app.database import engine, Base
from app.models import (  # noqa: F401
    Subject, SyllabusTopic, Note, NoteChunk, PYQ, TopicImportance,
    TopicProgress, QuizAttempt, StudyPlan,
)
from app.routers import auth, dashboard, upload, agent, tts, study
from core.embeddings import get_embedding
from config import MODEL_NAME

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables, seed default subjects, execute schema migrations, and verify embedding model."""
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        is_mysql = engine.dialect.name == "mysql"
        # 1. Seed initial subjects
        defaults = ["Operating Systems", "DBMS", "Computer Networks", "Research"]
        for s in defaults:
            if is_mysql:
                conn.execute(text("INSERT IGNORE INTO subjects (name) VALUES (:name)"), {"name": s})
            else:
                conn.execute(text("INSERT OR IGNORE INTO subjects (name) VALUES (:name)"), {"name": s})
        conn.commit()

        # 2. Schema migrations with fail-loud policy
        insp = inspect(engine)
        notes_cols = [c["name"] for c in insp.get_columns("notes")]
        if "subject_id" not in notes_cols:
            try:
                column_type = "INT" if is_mysql else "INTEGER"
                conn.execute(text(f"ALTER TABLE notes ADD COLUMN subject_id {column_type} NULL"))
                conn.commit()
                logger.info("Database migration: Added 'subject_id' column to 'notes'.")
            except Exception as e:
                logger.critical("Database migration FAILED: Unable to add 'subject_id' to 'notes': %s", e)
                raise RuntimeError(f"Database startup migration failed: {e}") from e
        else:
            logger.info("Database migration: 'subject_id' column on 'notes' already exists.")

        # 3. Backfill subject_id for any existing notes
        try:
            if is_mysql:
                backfilled = conn.execute(text(
                    "UPDATE notes n JOIN subjects s ON n.subject = s.name SET n.subject_id = s.id WHERE n.subject_id IS NULL"
                ))
            else:
                backfilled = conn.execute(text(
                    "UPDATE notes SET subject_id = (SELECT id FROM subjects WHERE subjects.name = notes.subject) "
                    "WHERE subject_id IS NULL"
                ))
            conn.commit()
            unmapped = conn.execute(text("SELECT COUNT(*) FROM notes WHERE subject_id IS NULL")).scalar()
            logger.info("Database migration: Backfilled subject_id (updated: %d, remaining unmapped: %d).", backfilled.rowcount, unmapped)
        except Exception as e:
            logger.critical("Database migration FAILED: Unable to backfill subject_id: %s", e)
            raise RuntimeError(f"Database backfill failed: {e}") from e

        # 4. Safe verification and creation of study engine tables
        existing_tables = set(insp.get_table_names())
        study_models = [TopicProgress, QuizAttempt, StudyPlan]
        for model in study_models:
            tbl = model.__tablename__
            if tbl not in existing_tables:
                try:
                    model.__table__.create(bind=conn)
                    conn.commit()
                    logger.info("Database migration: Created study table '%s'.", tbl)
                except Exception as e:
                    logger.critical("Database migration FAILED: Unable to create table '%s': %s", tbl, e)
                    raise RuntimeError(f"Database table creation failed for {tbl}: {e}") from e
            else:
                logger.info("Database migration: Study table '%s' verified.", tbl)

    os.makedirs(os.path.join(BASE_DIR, "..", "uploads"), exist_ok=True)

    # Startup check: verify loaded transformer model & embedding dimension
    test_vec = get_embedding("CampusClimb Model Startup Verification")
    dim = len(test_vec)
    variant = "Fine-Tuned CAPT-M Clean-97" if dim == 768 else "Baseline MiniLM"
    logger.info("CampusClimb backend startup completed. Model: %s, Dimension: %d (%s)", MODEL_NAME, dim, variant)

    # Pre-warm Supabase JWKS cache to eliminate first-request latency penalty
    from app.auth import warm_jwks_cache
    warm_jwks_cache()
    yield


app = FastAPI(
    title="CampusClimb — NLP Notes System REST API",
    description="Versioned REST API for syllabus-aligned notes deduplication & bilingual Q&A",
    version="1.0.0",
    lifespan=lifespan,
)

# GZip Compression Middleware — compresses large JSON payloads > 1000 bytes
app.add_middleware(GZipMiddleware, minimum_size=1000)


# Security Response Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    try:
        response = await call_next(request)
    except Exception as exc:
        if "No response returned" in str(exc):
            from starlette.responses import Response
            return Response(status_code=204)
        raise
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data: https:; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws: wss:; "
        "frame-ancestors 'none';"
    )
    return response


# CORS Configuration — restrict allowed origins explicitly
cors_env = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5174,http://127.0.0.1:5174")
allowed_origins = [origin.strip() for origin in cors_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)

# Mount legacy static files and templates (untouched for transition)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))
app.state.templates = templates

# Register REST API v1 Routers
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(dashboard.router)
app.include_router(agent.router)
app.include_router(tts.router)
app.include_router(study.router)
