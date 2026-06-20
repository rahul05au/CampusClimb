"""
Dashboard Router — View endpoints for the home page, topic dashboard, and
topic detail pages.
"""

from collections import defaultdict

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from starlette.responses import HTMLResponse

from app.database import get_db
from app.models import SyllabusTopic, Note, NoteChunk, PYQ, TopicImportance

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
async def home(request: Request, msg: str = None, db: Session = Depends(get_db)):
    """Home page with upload forms and system statistics."""
    templates = request.app.state.templates

    syllabus_count = db.query(SyllabusTopic).count()
    notes_count = db.query(Note).count()
    pyq_count = db.query(PYQ).count()

    return templates.TemplateResponse("index.html", {
        "request": request,
        "msg": msg,
        "syllabus_count": syllabus_count,
        "notes_count": notes_count,
        "pyq_count": pyq_count,
    })


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, msg: str = None, db: Session = Depends(get_db)):
    """Dashboard showing all topics ranked by importance."""
    templates = request.app.state.templates

    topics = db.query(SyllabusTopic).order_by(SyllabusTopic.unit_number).all()

    # Build topic data with importance and chunk counts
    topic_data = []
    for topic in topics:
        importance = db.query(TopicImportance).filter(
            TopicImportance.topic_id == topic.id
        ).first()

        chunk_count = db.query(NoteChunk).filter(
            NoteChunk.matched_topic_id == topic.id,
            NoteChunk.is_representative == True,  # noqa: E712
        ).count()

        topic_data.append({
            "id": topic.id,
            "unit_number": topic.unit_number,
            "unit_name": topic.unit_name,
            "topic_name": topic.topic_name,
            "importance_score": importance.importance_score if importance else 0.0,
            "importance_label": importance.importance_label if importance else "N/A",
            "question_count": importance.question_count if importance else 0,
            "chunk_count": chunk_count,
        })

    # Sort by importance score descending
    topic_data.sort(key=lambda t: t["importance_score"], reverse=True)

    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "msg": msg,
        "topics": topic_data,
    })


@router.get("/topic/{topic_id}", response_class=HTMLResponse)
async def topic_detail(
    request: Request,
    topic_id: int,
    db: Session = Depends(get_db),
):
    """Detail view for a single topic with deduplicated note chunks."""
    templates = request.app.state.templates

    topic = db.query(SyllabusTopic).filter(SyllabusTopic.id == topic_id).first()
    if not topic:
        return templates.TemplateResponse("topic_detail.html", {
            "request": request,
            "topic": None,
            "importance": None,
            "representative_chunks": [],
            "clusters": {},
        })

    importance = db.query(TopicImportance).filter(
        TopicImportance.topic_id == topic_id
    ).first()

    # Get all chunks for this topic
    all_chunks = db.query(NoteChunk).filter(
        NoteChunk.matched_topic_id == topic_id
    ).all()

    # Build representative chunks with student info
    representative_chunks = []
    clusters = defaultdict(list)

    for chunk in all_chunks:
        note = chunk.note
        chunk_info = {
            "id": chunk.id,
            "chunk_text": chunk.chunk_text,
            "student_name": note.student_name if note else "Unknown",
            "similarity_score": chunk.similarity_score,
            "cluster_id": chunk.cluster_id,
            "is_representative": chunk.is_representative,
        }

        if chunk.is_representative:
            representative_chunks.append(chunk_info)

        if chunk.cluster_id is not None:
            clusters[chunk.cluster_id].append(chunk_info)

    # Sort representatives by similarity score descending
    representative_chunks.sort(
        key=lambda c: c["similarity_score"] or 0, reverse=True
    )

    return templates.TemplateResponse("topic_detail.html", {
        "request": request,
        "topic": {
            "id": topic.id,
            "unit_number": topic.unit_number,
            "unit_name": topic.unit_name,
            "topic_name": topic.topic_name,
        },
        "importance": {
            "score": importance.importance_score,
            "label": importance.importance_label,
            "question_count": importance.question_count,
        } if importance else None,
        "representative_chunks": representative_chunks,
        "clusters": dict(clusters),
        "total_chunks": len(all_chunks),
    })
