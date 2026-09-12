"""
Dashboard Router — Versioned REST API v1 endpoints for CampusClimb Dashboard.

Provides high-performance aggregated metrics, topic breakdown, and telemetry stats.
Hardened against N+1 query patterns by using batch fetching and in-memory indexing.
"""

import json
import logging
from collections import defaultdict
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session, joinedload, defer

from app.auth import get_current_user, get_current_user_optional
from app.database import get_db
from app.models import Note, NoteChunk, PYQ, SyllabusTopic, TopicImportance
from app.rate_limiter import ai_rate_limiter
from core.embeddings import cosine_sim

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/v1/stats")
async def get_system_stats(request: Request, db: Session = Depends(get_db)):
    """Global telemetry statistics for home landing page.
    
    Protected by rate limiting against reconnaissance / scraping abuse.
    """
    ai_rate_limiter.check(request)
    syllabus_count = db.query(SyllabusTopic).count()
    notes_count = db.query(Note).count()
    pyq_count = db.query(PYQ).count()

    subjects = db.query(SyllabusTopic.subject).distinct().all()
    supported = [s[0] for s in subjects if s[0]] or ["Operating Systems", "DBMS", "Computer Networks"]

    return {
        "syllabus_count": syllabus_count,
        "notes_count": notes_count,
        "pyq_count": pyq_count,
        "supported_subjects": supported,
    }


@router.get("/api/v1/dashboard")
async def get_user_dashboard(
    subject: str = Query("Operating Systems"),
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Retrieve structured, user-scoped dashboard overview and topic breakdown.
    
    Optimized: All TopicImportance and NoteChunk records are batch-fetched in 2 queries
    instead of 2 * N queries inside the topic iteration loop.
    """
    user_id = _current_user.get("id") if _current_user else None
    user_email = _current_user.get("email") if _current_user else None
    subject_clean = (subject or "Operating Systems").strip()

    # 1. Overview metrics
    all_subject_notes = (
        db.query(Note)
        .filter(Note.subject == subject_clean)
        .all()
    )

    user_notes = []
    if user_id or user_email:
        user_notes = [
            n for n in all_subject_notes
            if (user_id and n.user_id == user_id) or (user_email and n.student_name == user_email)
        ]
    else:
        # Unauthenticated / guest viewer: view guest notes only
        user_notes = [n for n in all_subject_notes if n.user_id == "guest_user"]

    user_note_ids = [n.id for n in user_notes]

    total_notes = len(user_notes)
    total_topics = (
        db.query(SyllabusTopic)
        .filter(SyllabusTopic.subject == subject_clean)
        .count()
    )
    total_pyqs = (
        db.query(PYQ)
        .join(SyllabusTopic)
        .filter(SyllabusTopic.subject == subject_clean)
        .count()
    )

    total_chunks = 0
    rep_chunks = 0
    if user_note_ids:
        total_chunks = (
            db.query(NoteChunk)
            .filter(NoteChunk.note_id.in_(user_note_ids))
            .count()
        )
        rep_chunks = (
            db.query(NoteChunk)
            .filter(
                NoteChunk.note_id.in_(user_note_ids),
                NoteChunk.is_representative == True,
            )
            .count()
        )

    dedup_pct = 0.0
    if total_chunks > 0:
        dedup_pct = round(((total_chunks - rep_chunks) / total_chunks) * 100, 1)

    # 2. Topic breakdown for subject
    topics = (
        db.query(SyllabusTopic)
        .filter(SyllabusTopic.subject == subject_clean)
        .order_by(SyllabusTopic.unit_number, SyllabusTopic.id)
        .all()
    )

    topic_ids = [t.id for t in topics]

    # Batch-fetch all TopicImportance records for these topics in ONE query
    importance_map: Dict[int, TopicImportance] = {}
    if topic_ids:
        importances = (
            db.query(TopicImportance)
            .filter(TopicImportance.topic_id.in_(topic_ids))
            .all()
        )
        importance_map = {imp.topic_id: imp for imp in importances}

    # Batch-fetch all user NoteChunks for these topics in ONE query (eager-loading note)
    # Batch-fetch NoteChunks for these topics with deferred large embedding column
    chunks_by_topic: Dict[int, list] = defaultdict(list)
    if user_note_ids and topic_ids:
        chunks_db = (
            db.query(NoteChunk)
            .options(defer(NoteChunk.embedding), joinedload(NoteChunk.note))
            .filter(
                NoteChunk.note_id.in_(user_note_ids),
                NoteChunk.matched_topic_id.in_(topic_ids),
            )
            .order_by(NoteChunk.is_representative.desc(), NoteChunk.similarity_score.desc())
            .all()
        )
        for c in chunks_db:
            chunks_by_topic[c.matched_topic_id].append(c)

    # Assemble response in-memory with zero per-topic SQL queries
    topic_list = []
    for t in topics:
        imp = importance_map.get(t.id)
        raw_topic_chunks = chunks_by_topic.get(t.id, [])
        total_topic_chunks = len(raw_topic_chunks)

        # Distinct notes contributing to this topic
        contributing_note_ids = {c.note_id for c in raw_topic_chunks if c.note_id}
        source_count = len(contributing_note_ids)

        # Count representative vs non-representative chunks for per-topic dedup reduction
        rep_chunks_count = sum(1 for c in raw_topic_chunks if c.is_representative)
        topic_dedup_reduction_pct = 0.0
        if total_topic_chunks > 0:
            topic_dedup_reduction_pct = round(
                ((total_topic_chunks - rep_chunks_count) / total_topic_chunks) * 100, 1
            )

        # Group chunks by cluster_id
        clusters: Dict[Any, list] = defaultdict(list)
        for c in raw_topic_chunks:
            # If cluster_id is None, treat c.id as unique cluster key
            c_key = c.cluster_id if c.cluster_id is not None else f"single_{c.id}"
            clusters[c_key].append(c)

        merged_notes = []
        flat_chunks = []

        # Sort clusters so representative clusters come first
        sorted_cluster_items = sorted(
            clusters.items(),
            key=lambda item: any(m.is_representative for m in item[1]),
            reverse=True,
        )

        for c_key, member_chunks in sorted_cluster_items[:30]:  # Top 30 clusters per topic for instantaneous response
            # Find representative chunk (or fall back to first/longest)
            rep_chunk = next((m for m in member_chunks if m.is_representative), member_chunks[0])

            duplicates = []
            for m in member_chunks:
                if m.id == rep_chunk.id:
                    continue

                sim_to_rep = round(float(m.similarity_score or 0.0), 4)

                note_id = m.note_id
                filename = m.note.original_filename if m.note else f"Note #{note_id}"
                duplicates.append({
                    "id": m.id,
                    "note_id": note_id,
                    "source_note": f"Note #{note_id}",
                    "source_filename": filename,
                    "chunk_text": m.chunk_text,
                    "similarity_to_rep": sim_to_rep,
                    "similarity_pct": round(max(0.0, sim_to_rep) * 100, 1),
                })

            # Sort duplicates by similarity descending
            duplicates.sort(key=lambda d: d["similarity_to_rep"], reverse=True)

            # Distinct notes contributing to this specific merged cluster
            cluster_note_ids = {m.note_id for m in member_chunks if m.note_id}
            cluster_source_count = len(cluster_note_ids)

            rep_display_text = rep_chunk.cleaned_text if rep_chunk.cleaned_text else rep_chunk.chunk_text

            merged_notes.append({
                "cluster_id": rep_chunk.cluster_id,
                "representative_chunk_id": rep_chunk.id,
                "representative_note_id": rep_chunk.note_id,
                "representative_source_note": f"Note #{rep_chunk.note_id}",
                "representative_source_filename": rep_chunk.note.original_filename if rep_chunk.note else f"Note #{rep_chunk.note_id}",
                "representative_text": rep_display_text,
                "raw_representative_text": rep_chunk.chunk_text,
                "cleaned_text": rep_chunk.cleaned_text,
                "diagram_mermaid": rep_chunk.diagram_mermaid,
                "source_count": cluster_source_count,
                "merged_count": len(duplicates),
                "duplicates": duplicates,
            })

            # Maintain backwards-compatible flat list for legacy consumers
            for m in member_chunks:
                flat_chunks.append({
                    "id": m.id,
                    "note_id": m.note_id,
                    "source_note": f"Note #{m.note_id}",
                    "chunk_text": m.chunk_text,
                    "student_name": m.note.student_name if m.note else "Student",
                    "similarity_score": m.similarity_score or 0.0,
                    "is_representative": m.is_representative,
                    "cluster_id": m.cluster_id,
                })

        topic_list.append({
            "id": t.id,
            "unit_number": t.unit_number,
            "unit_name": t.unit_name,
            "topic_name": t.topic_name,
            "importance_score": round(imp.importance_score, 4) if imp else 0.0,
            "importance_label": imp.importance_label if imp else "Low",
            "question_count": imp.question_count if imp else 0,
            "chunk_count": total_topic_chunks,
            "source_count": source_count,
            "dedup_reduction_pct": topic_dedup_reduction_pct,
            "merged_notes": merged_notes,
            "chunks": flat_chunks,
        })

    # Sort topics by importance_score descending
    topic_list.sort(key=lambda item: item["importance_score"], reverse=True)

    return {
        "subject": subject_clean,
        "stats": {
            "total_notes": total_notes,
            "total_topics": total_topics,
            "total_pyqs": total_pyqs,
            "total_user_chunks": total_chunks,
            "representative_chunks": rep_chunks,
            "dedup_reduction_pct": dedup_pct,
        },
        "topics": topic_list,
    }
