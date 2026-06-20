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


class SyllabusTopic(Base):
    """A single topic extracted from the syllabus, belonging to a unit."""
    __tablename__ = "syllabus_topics"

    id = Column(Integer, primary_key=True, index=True)
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
    student_name = Column(String(100), nullable=False)
    subject = Column(String(100), nullable=False, default="Operating Systems")
    original_filename = Column(String(255), nullable=False)
    upload_date = Column(DateTime, default=lambda: datetime.now(timezone.utc))

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
