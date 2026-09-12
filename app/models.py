"""
SQLAlchemy ORM Models — Database schema for the CampusClimb NLP system.

Five tables store the syllabus structure, uploaded notes, chunked text with
embeddings, previous year questions, and computed topic importance scores.
Embedding vectors are stored as JSON-serialized lists in TEXT columns.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Subject(Base):
    """A subject offering in CampusClimb."""
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    notes = relationship("Note", back_populates="subject_ref")


class SyllabusTopic(Base):
    """A single topic extracted from the syllabus, belonging to a unit and subject."""
    __tablename__ = "syllabus_topics"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String(100), nullable=False, default="Operating Systems", index=True)
    unit_number = Column(Integer, nullable=False)
    unit_name = Column(String(255), nullable=False)
    topic_name = Column(String(255), nullable=False)
    embedding = Column(Text, nullable=True)  # JSON-serialized vector

    chunks = relationship("NoteChunk", back_populates="topic")
    pyqs = relationship("PYQ", back_populates="topic")
    importance = relationship("TopicImportance", back_populates="topic", uselist=False)


class Note(Base):
    """Metadata for an uploaded student note PDF."""
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), nullable=True, index=True)
    student_name = Column(String(100), nullable=False)
    subject = Column(String(100), nullable=False, default="Operating Systems")
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True, index=True)
    original_filename = Column(String(255), nullable=False)
    upload_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    status = Column(String(30), default="PROCESSING", nullable=False, index=True)  # PROCESSING, COMPLETED, FAILED
    stage = Column(String(50), default="extracting", nullable=True)  # extracting, chunking, embedding, indexing, completed, failed
    error_message = Column(Text, nullable=True)
    file_hash = Column(String(64), nullable=True, index=True)
    page_count = Column(Integer, default=0, nullable=False)
    chunk_count = Column(Integer, default=0, nullable=False)

    subject_ref = relationship("Subject", back_populates="notes")
    chunks = relationship("NoteChunk", back_populates="note")


class NoteChunk(Base):
    """A text chunk extracted from a student note, with embedding and topic mapping."""
    __tablename__ = "note_chunks"

    id = Column(Integer, primary_key=True, index=True)
    note_id = Column(Integer, ForeignKey("notes.id"), nullable=False)
    chunk_text = Column(Text, nullable=False)
    embedding = Column(Text, nullable=True)  # JSON-serialized vector
    matched_topic_id = Column(Integer, ForeignKey("syllabus_topics.id"), nullable=True)
    similarity_score = Column(Float, nullable=True)
    cluster_id = Column(Integer, nullable=True)
    is_representative = Column(Boolean, default=False)
    cleaned_text = Column(Text, nullable=True)
    diagram_mermaid = Column(Text, nullable=True)

    note = relationship("Note", back_populates="chunks")
    topic = relationship("SyllabusTopic", back_populates="chunks")


class PYQ(Base):
    """A question extracted from a Previous Year Question paper."""
    __tablename__ = "pyqs"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False)
    question_text = Column(Text, nullable=False)
    embedding = Column(Text, nullable=True)  # JSON-serialized vector
    matched_topic_id = Column(Integer, ForeignKey("syllabus_topics.id"), nullable=True)

    topic = relationship("SyllabusTopic", back_populates="pyqs")


class TopicImportance(Base):
    """Computed importance score for a syllabus topic based on PYQ frequency."""
    __tablename__ = "topic_importance"

    id = Column(Integer, primary_key=True, index=True)
    topic_id = Column(Integer, ForeignKey("syllabus_topics.id"), nullable=False)
    question_count = Column(Integer, nullable=False, default=0)
    importance_score = Column(Float, nullable=False, default=0.0)
    importance_label = Column(String(20), nullable=False, default="Low")

    topic = relationship("SyllabusTopic", back_populates="importance")


class TopicProgress(Base):
    """User-scoped study and recall progress for an individual syllabus topic."""
    __tablename__ = "topic_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False, index=True)
    topic_id = Column(Integer, ForeignKey("syllabus_topics.id"), nullable=False, index=True)
    revision_completed = Column(Boolean, default=False, nullable=False)
    flashcards_completed = Column(Boolean, default=False, nullable=False)
    quizzes_taken = Column(Integer, default=0, nullable=False)
    last_quiz_score = Column(Float, nullable=True)
    mastery_score = Column(Float, default=0.0, nullable=False)  # Explainable 0-100 heuristic
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    subject = relationship("Subject")
    topic = relationship("SyllabusTopic")


class QuizAttempt(Base):
    """Log of a completed rapid quiz or mock exam attempt by an authenticated user."""
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False, index=True)
    topic_id = Column(Integer, ForeignKey("syllabus_topics.id"), nullable=True, index=True)
    quiz_type = Column(String(50), nullable=False, default="rapid_topic")  # "rapid_topic" or "mock_exam"
    total_questions = Column(Integer, nullable=False)
    correct_answers = Column(Integer, nullable=False)
    score_percentage = Column(Float, nullable=False)
    details = Column(Text, nullable=True)  # JSON serialized attempt breakdown
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    subject = relationship("Subject")
    topic = relationship("SyllabusTopic")


class StudyPlan(Base):
    """User-configured exam preparation schedule with dynamic value-per-minute replanning."""
    __tablename__ = "study_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), nullable=False, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=False, index=True)
    exam_date = Column(DateTime, nullable=True)
    daily_hours = Column(Float, default=2.0, nullable=False)
    mode = Column(String(20), default="Sprint", nullable=False)  # "Emergency", "Sprint", "Mastery"
    schedule_data = Column(Text, nullable=True)  # JSON serialized daily tasks & priorities
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    subject = relationship("Subject")
