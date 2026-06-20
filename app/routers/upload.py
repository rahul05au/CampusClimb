"""
Upload Router — Handles file uploads for syllabus, notes, and PYQs.

Each upload endpoint saves the file temporarily, processes it through
the NLP pipeline, stores results in the database, and cleans up.
"""

import json
import os
import shutil
from collections import defaultdict

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse

from app.database import get_db
from app.models import SyllabusTopic, Note, NoteChunk, PYQ, TopicImportance
from core.embeddings import get_embedding, batch_embed
from core.syllabus_parser import parse_syllabus
from core.pdf_extractor import extract_text_from_pdf, chunk_text
from core.topic_mapper import map_chunks_batch
from core.deduplicator import deduplicate_chunks
from core.pyq_analyzer import extract_questions_from_pdf, compute_topic_importance

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")


def _save_temp_file(upload_file: UploadFile) -> str:
    """Save an uploaded file to the uploads directory and return the path."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filepath = os.path.join(UPLOAD_DIR, upload_file.filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(upload_file.file, f)
    return filepath


def _cleanup(filepath: str):
    """Remove a temporary file if it exists."""
    if os.path.exists(filepath):
        os.remove(filepath)


@router.post("/upload/syllabus")
async def upload_syllabus(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload and parse a syllabus file.

    Extracts unit-topic structure, generates embeddings for each topic
    (using combined 'unit_name: topic_name' for richer context), and
    stores them in the syllabus_topics table.
    """
    filepath = _save_temp_file(file)
    try:
        topics = parse_syllabus(filepath)

        # Generate embeddings for all topics in batch
        topic_texts = [
            f"{t['unit_name']}: {t['topic_name']}" for t in topics
        ]
        embeddings = batch_embed(topic_texts)

        # Clear existing syllabus data
        db.query(SyllabusTopic).delete()
        db.commit()

        # Store topics with embeddings
        for topic_data, embedding in zip(topics, embeddings):
            db_topic = SyllabusTopic(
                unit_number=topic_data["unit_number"],
                unit_name=topic_data["unit_name"],
                topic_name=topic_data["topic_name"],
                embedding=json.dumps(embedding),
            )
            db.add(db_topic)

        db.commit()
        msg = f"Syllabus uploaded: {len(topics)} topics parsed and embedded."

    except (ValueError, RuntimeError) as e:
        msg = f"Error processing syllabus: {e}"
    finally:
        _cleanup(filepath)

    return RedirectResponse(url=f"/?msg={msg}", status_code=303)


@router.post("/upload/notes")
async def upload_notes(
    request: Request,
    file: UploadFile = File(...),
    student_name: str = Form(...),
    db: Session = Depends(get_db),
):
    """Upload a student note PDF.

    Pipeline: extract text → chunk → embed → map to topics → deduplicate.
    """
    filepath = _save_temp_file(file)
    try:
        # Check that syllabus exists
        topic_records = db.query(SyllabusTopic).all()
        if not topic_records:
            _cleanup(filepath)
            return RedirectResponse(
                url="/?msg=Please upload a syllabus first before uploading notes.",
                status_code=303,
            )

        # Extract and chunk text
        text = extract_text_from_pdf(filepath)
        chunks = chunk_text(text)

        if not chunks:
            _cleanup(filepath)
            return RedirectResponse(
                url="/?msg=No meaningful text chunks could be extracted from the PDF.",
                status_code=303,
            )

        # Embed all chunks in batch
        chunk_embeddings = batch_embed(chunks)

        # Prepare topic embeddings for mapping
        topic_embeddings = [
            (t.id, json.loads(t.embedding)) for t in topic_records
        ]

        # Map each chunk to nearest topic
        mappings = map_chunks_batch(chunk_embeddings, topic_embeddings)

        # Save note record
        note = Note(
            student_name=student_name,
            original_filename=file.filename,
        )
        db.add(note)
        db.flush()  # Get note.id

        # Save note chunks
        for chunk_text_str, embedding, (topic_id, sim_score) in zip(
            chunks, chunk_embeddings, mappings
        ):
            db_chunk = NoteChunk(
                note_id=note.id,
                chunk_text=chunk_text_str,
                embedding=json.dumps(embedding),
                matched_topic_id=topic_id,
                similarity_score=round(sim_score, 4),
            )
            db.add(db_chunk)

        db.commit()

        # Run deduplication across ALL chunks (existing + new)
        _run_deduplication(db)

        msg = f"Notes uploaded: {len(chunks)} chunks extracted from '{file.filename}' by {student_name}."

    except (ValueError, RuntimeError) as e:
        msg = f"Error processing notes: {e}"
    finally:
        _cleanup(filepath)

    return RedirectResponse(url=f"/?msg={msg}", status_code=303)


@router.post("/upload/pyqs")
async def upload_pyqs(
    request: Request,
    file: UploadFile = File(...),
    year: int = Form(...),
    db: Session = Depends(get_db),
):
    """Upload a PYQ PDF.

    Pipeline: extract questions → embed → map to topics → recompute importance.
    """
    filepath = _save_temp_file(file)
    try:
        # Check that syllabus exists
        topic_records = db.query(SyllabusTopic).all()
        if not topic_records:
            _cleanup(filepath)
            return RedirectResponse(
                url="/?msg=Please upload a syllabus first before uploading PYQs.",
                status_code=303,
            )

        # Extract questions
        questions = extract_questions_from_pdf(filepath)

        if not questions:
            _cleanup(filepath)
            return RedirectResponse(
                url="/?msg=No questions could be extracted from the PYQ PDF.",
                status_code=303,
            )

        # Embed all questions
        question_embeddings = batch_embed(questions)

        # Prepare topic embeddings for mapping
        topic_embeddings = [
            (t.id, json.loads(t.embedding)) for t in topic_records
        ]

        # Map each question to nearest topic
        mappings = map_chunks_batch(question_embeddings, topic_embeddings)

        # Save PYQ records
        for q_text, embedding, (topic_id, _) in zip(
            questions, question_embeddings, mappings
        ):
            db_pyq = PYQ(
                year=year,
                question_text=q_text,
                embedding=json.dumps(embedding),
                matched_topic_id=topic_id,
            )
            db.add(db_pyq)

        db.commit()

        # Recompute topic importance
        _recompute_importance(db)

        msg = f"PYQs uploaded: {len(questions)} questions extracted from year {year}."

    except (ValueError, RuntimeError) as e:
        msg = f"Error processing PYQs: {e}"
    finally:
        _cleanup(filepath)

    return RedirectResponse(url=f"/?msg={msg}", status_code=303)


def _run_deduplication(db: Session):
    """Run deduplication on all note chunks in the database."""
    all_chunks = db.query(NoteChunk).filter(
        NoteChunk.matched_topic_id.isnot(None)
    ).all()

    if not all_chunks:
        return

    chunk_dicts = [
        {
            "id": c.id,
            "chunk_text": c.chunk_text,
            "embedding": json.loads(c.embedding),
            "matched_topic_id": c.matched_topic_id,
        }
        for c in all_chunks
    ]

    deduplicate_chunks(chunk_dicts)

    # Update database records
    chunk_map = {c["id"]: c for c in chunk_dicts}
    for db_chunk in all_chunks:
        updated = chunk_map[db_chunk.id]
        db_chunk.cluster_id = updated["cluster_id"]
        db_chunk.is_representative = updated["is_representative"]

    db.commit()


def _recompute_importance(db: Session):
    """Recompute topic importance scores from all PYQ records."""
    all_pyqs = db.query(PYQ).filter(PYQ.matched_topic_id.isnot(None)).all()
    total_questions = len(all_pyqs)

    # Count questions per topic
    topic_counts = defaultdict(int)
    for pyq in all_pyqs:
        topic_counts[pyq.matched_topic_id] += 1

    # Include topics with zero questions
    all_topics = db.query(SyllabusTopic).all()
    for topic in all_topics:
        if topic.id not in topic_counts:
            topic_counts[topic.id] = 0

    importance_results = compute_topic_importance(topic_counts, total_questions)

    # Clear and re-insert importance records
    db.query(TopicImportance).delete()
    for result in importance_results:
        db_imp = TopicImportance(
            topic_id=result["topic_id"],
            question_count=result["question_count"],
            importance_score=result["importance_score"],
            importance_label=result["importance_label"],
        )
        db.add(db_imp)

    db.commit()
