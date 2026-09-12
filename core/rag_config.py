"""
Centralized Configuration for CampusClimb RAG 2.0 Engine.

All algorithmic thresholds, retrieval limits, and generation parameters
are configurable via environment variables with domain-agnostic defaults.
No domain-specific or subject-specific constants are permitted here.
"""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class RAGSettings:
    # Retrieval Limits
    TOP_K: int = int(os.getenv("RAG_TOP_K", "5"))
    MAX_CANDIDATES: int = int(os.getenv("RAG_MAX_CANDIDATES", "15"))
    RRF_K: int = int(os.getenv("RAG_RRF_K", "60"))
    MMR_LAMBDA: float = float(os.getenv("RAG_MMR_LAMBDA", "0.7"))
    MAX_CONTEXT_CHARS: int = int(os.getenv("RAG_MAX_CONTEXT_CHARS", "4500"))

    # Evidence & Answerability Thresholds
    MIN_CONFIDENCE: float = float(os.getenv("RAG_MIN_CONFIDENCE", "0.55"))
    MIN_RELEVANCE: float = float(os.getenv("RAG_MIN_RELEVANCE", "0.50"))
    MIN_LEXICAL_OVERLAP: float = float(os.getenv("RAG_MIN_LEXICAL_OVERLAP", "0.15"))
    INTENT_EVIDENCE_WEIGHT: float = float(os.getenv("RAG_INTENT_WEIGHT", "0.20"))

    # Confidence Label Thresholds
    CONFIDENCE_HIGH_THRESHOLD: float = float(os.getenv("RAG_CONFIDENCE_HIGH", "0.70"))
    CONFIDENCE_MED_THRESHOLD: float = float(os.getenv("RAG_CONFIDENCE_MED", "0.48"))

    # LLM Generation Parameters
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-flash-latest").strip() or "gemini-flash-latest"
    FALLBACK_MODELS: tuple = ("gemini-flash-latest", "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-pro-latest")
    TEMPERATURE_GROUNDED: float = float(os.getenv("RAG_TEMP_GROUNDED", "0.2"))
    TEMPERATURE_FALLBACK: float = float(os.getenv("RAG_TEMP_FALLBACK", "0.3"))
    MAX_OUTPUT_TOKENS: int = int(os.getenv("RAG_MAX_OUTPUT_TOKENS", "4096"))
    HTTP_TIMEOUT_SECONDS: float = float(os.getenv("RAG_HTTP_TIMEOUT", "15.0"))
    MAX_RETRIES: int = int(os.getenv("RAG_MAX_RETRIES", "1"))


# Singleton settings instance
rag_settings = RAGSettings()
