"""
Bilingual AI Agent Router — Multilingual Q&A, Intelligent RAG & Explanation API (/api/v1/agent/).

Provides:
- GET  /api/v1/agent/sources — List available user sources for subject
- POST /api/v1/agent/query   — Intelligent NotebookLM-style grounded RAG & General Knowledge fallback
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_current_user_optional
from app.database import get_db
from app.models import Note, NoteChunk, SyllabusTopic
from app.rate_limiter import ai_rate_limiter
from app.schemas import (
    AgentQueryRequest,
    AgentQueryResponse,
    CitationItem,
    SourceChunkSchema,
    SourceItemSchema,
    SourceListResponse,
    SyllabusAlignment,
)
from core.embeddings import get_embedding
from core.rag_engine import (
    _build_deterministic_gk_fallback,
    detect_language,
    evaluate_evidence,
    generate_general_knowledge_answer,
    generate_grounded_answer,
    get_localized_notice,
    retrieve_filtered_chunks,
    sanitize_query,
)
from core.topic_mapper import map_chunks_batch

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/agent", tags=["Bilingual Agent"])


@router.get("/sources", response_model=SourceListResponse)
async def list_user_sources(
    subject: str = Query("Operating Systems"),
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """List all uploaded note sources for the authenticated user and subject."""
    user_id = _current_user.get("id") if _current_user else None
    user_email = _current_user.get("email") if _current_user else None
    subject_clean = (subject or "Operating Systems").strip()

    all_notes = (
        db.query(Note)
        .filter(Note.subject == subject_clean)
        .order_by(Note.upload_date.desc(), Note.id.desc())
        .all()
    )

    user_notes = []
    if user_id or user_email:
        user_notes = [
            n for n in all_notes
            if (user_id and n.user_id == user_id) or (user_email and n.student_name == user_email)
        ]
    else:
        # Unauthenticated / guest viewer: view guest notes only
        user_notes = [n for n in all_notes if n.user_id == "guest_user"]

    source_items = []
    for n in user_notes:
        chunk_count = db.query(NoteChunk).filter(NoteChunk.note_id == n.id).count()
        upload_date_str = n.upload_date.isoformat() if n.upload_date else None
        source_items.append(
            SourceItemSchema(
                id=n.id,
                filename=n.original_filename,
                student_name=n.student_name,
                upload_date=upload_date_str,
                chunk_count=chunk_count,
            )
        )

    return SourceListResponse(subject=subject_clean, sources=source_items)


@router.delete("/sources/{note_id}")
async def delete_user_source(
    note_id: int,
    db: Session = Depends(get_db),
    _current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Permanently delete a source note and all its chunks for the current authenticated user."""
    user_id = _current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")

    note = db.query(Note).filter(Note.id == note_id, Note.user_id == user_id).first()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found.")

    filename = note.original_filename
    # Delete chunks
    db.query(NoteChunk).filter(NoteChunk.note_id == note_id).delete(synchronize_session=False)
    # Delete note record
    db.delete(note)
    db.commit()

    logger.info("User %s deleted note %d (%s)", user_id, note_id, filename)
    return {
        "status": "success",
        "message": f"Source '{filename}' deleted successfully.",
        "deleted_id": note_id,
    }


@router.post("/query", response_model=AgentQueryResponse)
async def agent_query(
    request: Request,
    body: AgentQueryRequest,
    db: Session = Depends(get_db),
    _current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """Bilingual Agent endpoint — Intelligent NotebookLM RAG & General Knowledge fallback."""
    # Enforce AI route rate limiting per IP
    ai_rate_limiter.check(request)

    user_id = _current_user.get("id") if _current_user else None

    # Dynamic language detection across the entire pipeline
    detected_lang = detect_language(body.query)
    effective_language = detected_lang if (not body.language or body.language.lower() in ("auto", "detect")) else body.language
    if detected_lang in ("Hindi", "Hinglish"):
        effective_language = detected_lang

    # 1. Fetch syllabus topics for subject (or all subjects fallback)
    topics = []
    try:
        topics = db.query(SyllabusTopic).filter(SyllabusTopic.subject == body.subject).all()
        if not topics:
            topics = db.query(SyllabusTopic).all()
    except Exception as exc:
        logger.warning("Database warning while fetching syllabus topics: %s", exc)
        topics = []

    # 2. Embed query and map to syllabus topics
    try:
        query_emb = get_embedding(body.query)
    except Exception as exc:
        logger.warning("Failed to generate query embedding: %s", exc)
        query_emb = [0.0] * 768

    matched_topic_name = "General Concept"
    matched_topic_obj = None
    topic_mapping_score = 0.0

    if topics and query_emb:
        try:
            topic_embeddings = []
            for t in topics:
                if t.embedding:
                    try:
                        emb_data = json.loads(t.embedding)
                        if isinstance(emb_data, list) and len(emb_data) == len(query_emb):
                            topic_embeddings.append((t.id, emb_data))
                    except Exception:
                        pass
            topic_name_map = {t.id: t.topic_name for t in topics}

            if topic_embeddings:
                mapping_results_raw = map_chunks_batch([query_emb], topic_embeddings)
                if mapping_results_raw:
                    raw_top = mapping_results_raw[0]
                    matched_topic_id = raw_top[0]
                    topic_mapping_score = float(raw_top[1])
                    matched_topic_name = topic_name_map.get(matched_topic_id, "General Concept")
                    matched_topic_obj = next((t for t in topics if t.id == matched_topic_id), None)
        except Exception as exc:
            logger.warning("Topic mapping non-fatal exception: %s", exc)

    # 3. Retrieve candidate note chunks strictly filtered by user and selected sources
    try:
        candidates, top_topic_id, resolution = retrieve_filtered_chunks(
            db=db,
            user_id=user_id,
            subject=body.subject,
            query_emb=query_emb,
            selected_source_ids=body.selected_source_ids,
            chat_history=body.chat_history,
            original_query=body.query,
        )
    except Exception as exc:
        logger.warning("Database non-fatal issue during chunk retrieval: %s", exc)
        from core.rag_engine import resolve_conversational_query
        candidates = []
        resolution = resolve_conversational_query(body.query, body.chat_history)

    # 4. Multi-signal evidence decision with intent-awareness
    decision_mode, top_chunks, combined_score, confidence_label = evaluate_evidence(
        query=resolution.resolved_query,
        candidates=candidates,
        topic_mapping_score=topic_mapping_score,
        intent=resolution.intent,
    )

    # 5. Route based on evidence decision
    if decision_mode == "NOTES_SUPPORTED":
        # MODE 1 — NOTES GROUNDED
        try:
            answer, explanation, citations, diagram_mermaid, related_questions = await generate_grounded_answer(
                query=body.query,
                subject=body.subject,
                topic_name=matched_topic_name,
                chunks=top_chunks,
                target_language=effective_language,
                chat_history=body.chat_history,
            )
        except Exception:
            logger.exception("Grounded generation encountered error; using fallback synthesis.")
            snippet = top_chunks[0].get("cleaned_text") or top_chunks[0].get("chunk_text") or ""
            answer = f"[{effective_language}] According to your notes on {matched_topic_name}: {snippet[:280]} [1]"
            explanation = f"Concept summary for {matched_topic_name} grounded in your uploaded course materials."
            citations = [
                CitationItem(
                    citation_id=1,
                    source_id=top_chunks[0].get("note_id", 0),
                    source_name=top_chunks[0].get("source_name", "Note #1"),
                    chunk_id=top_chunks[0].get("chunk_id", 0),
                    page_number=None,
                    snippet=snippet[:200],
                    similarity_score=top_chunks[0].get("similarity_score"),
                )
            ]
            diagram_mermaid = top_chunks[0].get("diagram_mermaid")
            related_questions = [f"Explain key components of {matched_topic_name}."]

        sources_schema = [
            SourceChunkSchema(
                id=c["chunk_id"],
                text=c["chunk_text"][:250] + ("..." if len(c["chunk_text"]) > 250 else ""),
                similarity_score=c.get("similarity_score"),
            )
            for c in top_chunks
        ]

        is_aligned = (topic_mapping_score >= 0.55) and (matched_topic_name != "General Concept")
        syllabus_alignment = SyllabusAlignment(
            is_aligned=is_aligned,
            status="in_syllabus" if is_aligned else "out_of_syllabus",
            unit_number=matched_topic_obj.unit_number if (matched_topic_obj and is_aligned) else None,
            unit_name=matched_topic_obj.unit_name if (matched_topic_obj and is_aligned) else None,
            matched_topic=matched_topic_name if is_aligned else None,
            confidence=round(topic_mapping_score, 4),
            reason=(
                f"Topic '{matched_topic_name}' belongs to Unit {matched_topic_obj.unit_number}: {matched_topic_obj.unit_name}."
                if (matched_topic_obj and is_aligned)
                else "Question lies outside direct syllabus unit boundaries; general knowledge reasoning applied."
            ),
        )

        return AgentQueryResponse(
            query=body.query,
            subject=body.subject,
            language=effective_language,
            matched_topic=matched_topic_name,
            confidence_score=round(combined_score, 4),
            confidence_label=confidence_label,
            answer=answer,
            explanation=explanation,
            sources=sources_schema,
            selected_source_ids=body.selected_source_ids,
            source_type="notes",
            notes_match=True,
            fallback_used=False,
            notice=None,
            citations=citations,
            diagram_mermaid=diagram_mermaid,
            related_questions=related_questions,
            syllabus_alignment=syllabus_alignment,
        )

    else:
        # MODE 2 — GENERAL KNOWLEDGE FALLBACK (Zero note context sent to LLM)
        try:
            answer, explanation, related_questions = await generate_general_knowledge_answer(
                query=body.query,
                subject=body.subject,
                target_language=effective_language,
                chat_history=body.chat_history,
            )
        except Exception:
            logger.exception("General knowledge generation error; using resilient fallback generator.")
            answer, explanation, related_questions = _build_deterministic_gk_fallback(
                query=body.query,
                subject=body.subject,
                target_language=effective_language,
            )

        notice = get_localized_notice(effective_language)

        is_aligned = (topic_mapping_score >= 0.55) and (matched_topic_name != "General Concept")
        syllabus_alignment = SyllabusAlignment(
            is_aligned=is_aligned,
            status="in_syllabus" if is_aligned else "out_of_syllabus",
            unit_number=matched_topic_obj.unit_number if (matched_topic_obj and is_aligned) else None,
            unit_name=matched_topic_obj.unit_name if (matched_topic_obj and is_aligned) else None,
            matched_topic=matched_topic_name if is_aligned else None,
            confidence=round(topic_mapping_score, 4),
            reason=(
                f"Topic '{matched_topic_name}' belongs to Unit {matched_topic_obj.unit_number}: {matched_topic_obj.unit_name}."
                if (matched_topic_obj and is_aligned)
                else "Question lies outside direct syllabus unit boundaries; general knowledge reasoning applied."
            ),
        )

        return AgentQueryResponse(
            query=body.query,
            subject=body.subject,
            language=effective_language,
            matched_topic=matched_topic_name,
            confidence_score=round(combined_score, 4),
            confidence_label=confidence_label,
            answer=answer,
            explanation=explanation,
            sources=[],
            selected_source_ids=body.selected_source_ids,
            source_type="general_knowledge",
            notes_match=False,
            fallback_used=True,
            notice=notice,
            citations=[],
            diagram_mermaid=None,
            related_questions=related_questions,
            syllabus_alignment=syllabus_alignment,
        )

