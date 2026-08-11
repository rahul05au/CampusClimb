""" work
FastAPI Application Entry Point.

Mounts Jinja2 templates, static files, and includes all route modules.
Creates database tables on startup.
""" 
 
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from app.database import engine, Base
from app.models import SyllabusTopic, Note, NoteChunk, PYQ, TopicImportance  # noqa: F401 — ensure models are registered
from app.routers import upload, dashboard

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all database tables on application startup."""
    Base.metadata.create_all(bind=engine)
    # Create uploads directory if it doesn't exist
    os.makedirs(os.path.join(BASE_DIR, "..", "uploads"), exist_ok=True)
    yield


app = FastAPI(
    title="CampusClimb — NLP Notes System",
    description="Syllabus-aligned organization and semantic deduplication of student notes",
    version="1.0.0",
    lifespan=lifespan,
)

# Mount static files and templates
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "templates"))

# Share templates instance with routers
app.state.templates = templates

# Include routers
app.include_router(upload.router)
app.include_router(dashboard.router)
