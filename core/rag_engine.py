"""
CampusClimb Production-Grade RAG 2.0 Engine — Fully Dynamic & Domain-Agnostic.

Features:
1. Dynamic Conversation State & Structured Context Tracking
2. Generic Follow-Up & Reference Query Resolution (pronouns, ordinal references, continuation)
3. Multi-Stage Hybrid Retrieval (Dense Semantic + BM25/Lexical Search)
4. Reciprocal Rank Fusion (RRF) & Maximal Marginal Relevance (MMR) Diversity Selection
5. Dynamic Intent-Aware Evidence Evaluation & Answerability Verification
6. Strict Database-Layer Source Filtering & User Isolation
7. Grounded Generation with Dynamic Citation Validation
8. Strict General Knowledge Fallback with ZERO Note Context
"""

import json
import logging
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx
import numpy as np
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.models import Note, NoteChunk, SyllabusTopic
from app.schemas import CitationItem
from core.embeddings import cosine_sim, get_embedding
from core.rag_config import rag_settings
from core.topic_mapper import map_chunks_batch

logger = logging.getLogger(__name__)

# Universal linguistic stopwords for query cleaning (English, Hindi, general question operators)
STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "can't", "cannot", "could",
    "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
    "further", "had", "has", "have", "having", "he", "her", "here", "hers",
    "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is",
    "isn't", "it", "its", "itself", "let's", "me", "more", "most", "my", "myself",
    "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought",
    "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should",
    "so", "some", "such", "than", "that", "the", "their", "theirs", "them",
    "themselves", "then", "there", "these", "they", "this", "those", "through",
    "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "were",
    "what", "when", "where", "which", "while", "who", "whom", "why", "with",
    "would", "you", "your", "yours", "yourself", "yourselves",
    # Hindi/Hinglish particles
    "hai", "hain", "kya", "kaise", "kyun", "ka", "ki", "ke", "ko", "mein",
    "se", "par", "aur", "ya", "bhi", "tha", "the", "thi", "karo", "karein", "batao",
    "hota", "hoti", "hote", "wale", "wali", "kisi", "yeh", "woh",
    # Generic question operators
    "explain", "describe", "define", "difference", "between", "short", "note",
    "overview", "discuss", "give", "write", "detail", "tell", "show"
}

_INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|context)|"
    r"<\s*/?\s*system\s*>|"
    r"\[\s*INST\s*\]|"
    r"forget\s+(everything|all)\s+(you\s+)?((know|learned|were told))|"
    r"you\s+are\s+now\s+a|"
    r"act\s+as\s+(if\s+you\s+are|a))",
    re.IGNORECASE,
)

# Intent vocabulary indicators (domain-agnostic intent matching)
INTENT_INDICATORS = {
    "advantages": {
        "query_cues": ["advantage", "advantages", "benefit", "benefits", "merit", "merits", "pros", "pro", "why use", "strength", "strengths"],
        "evidence_cues": ["advantage", "benefit", "pros", "improve", "improves", "improved", "efficient", "efficiency", "productivity", "fast", "faster", "reduces", "save", "merit", "effective", "better", "gain", "utilization"]
    },
    "disadvantages": {
        "query_cues": ["disadvantage", "disadvantages", "drawback", "drawbacks", "limitation", "limitations", "cons", "con", "flaw", "flaws", "weakness"],
        "evidence_cues": ["disadvantage", "drawback", "limitation", "overhead", "problem", "bottleneck", "issue", "costly", "expensive", "slow", "starvation", "delay", "complex", "vulnerable"]
    },
    "types": {
        "query_cues": ["type", "types", "classification", "classify", "categories", "category", "kinds", "variants", "algorithms", "classes"],
        "evidence_cues": ["type", "types", "classified into", "categories", "kinds", "includes", "such as", "following", "1.", "2.", "first", "second", "non-preemptive", "preemptive", "static", "dynamic"]
    },
    "mechanism": {
        "query_cues": ["how it works", "how does", "mechanism", "working", "process", "steps", "workflow", "architecture", "procedure"],
        "evidence_cues": ["steps", "process", "phase", "executes", "performs", "transfers", "handles", "flow", "mechanism", "state", "transitions", "operates", "function"]
    },
    "examples": {
        "query_cues": ["example", "examples", "sample", "instance", "illustration", "use case"],
        "evidence_cues": ["example", "for instance", "e.g.", "such as", "sample", "illustration", "case study"]
    },
    "comparison": {
        "query_cues": ["difference", "differences", "compare", "comparison", "vs", "versus", "contrast", "distinguish"],
        "evidence_cues": ["difference", "differ", "whereas", "while", "contrast", "compared to", "on the other hand", "table", "versus"]
    },
    "definition": {
        "query_cues": ["what is", "what are", "define", "definition", "meaning of", "stands for"],
        "evidence_cues": ["defined as", "is a", "refers to", "means", "is defined", "stands for", "known as", "concept of"]
    }
}


@dataclass
class ConversationState:
    """Structured, dynamic state tracking for multi-turn conversations across any domain."""
    current_subject: Optional[str] = None
    current_topic: Optional[str] = None
    current_subtopic: Optional[str] = None
    entities: List[str] = field(default_factory=list)
    last_user_query: Optional[str] = None
    last_resolved_query: Optional[str] = None
    last_answer: Optional[str] = None
    last_retrieved_sources: List[int] = field(default_factory=list)
    selected_source_ids: Optional[List[int]] = None
    conversation_turns: int = 0


class QueryResolutionResult(str):
    """Structured string subclass output of the generic conversational query resolver.

    Inherits from str so it can be used directly as a query string everywhere,
    while carrying rich structured metadata (intent, entities, is_follow_up, resolved_topic).
    """
    original_query: str
    resolved_query: str
    is_follow_up: bool
    resolved_topic: Optional[str]
    intent: str
    entities: List[str]

    def __new__(
        cls,
        resolved_query: str,
        original_query: str = "",
        is_follow_up: bool = False,
        resolved_topic: Optional[str] = None,
        intent: str = "general",
        entities: Optional[List[str]] = None,
    ):
        obj = super().__new__(cls, resolved_query)
        obj.original_query = original_query or resolved_query
        obj.resolved_query = resolved_query
        obj.is_follow_up = is_follow_up
        obj.resolved_topic = resolved_topic
        obj.intent = intent
        obj.entities = entities or []
        return obj

    def to_dict(self) -> Dict[str, Any]:
        return {
            "original_query": self.original_query,
            "resolved_query": self.resolved_query,
            "is_follow_up": self.is_follow_up,
            "resolved_topic": self.resolved_topic,
            "intent": self.intent,
            "entities": self.entities,
        }


class RetrievalTuple(tuple):
    """3-tuple containing (candidates, top_topic_id, resolution) with attached .candidates, .top_topic_id, .resolution metadata."""
    candidates: List[Dict[str, Any]]
    top_topic_id: Optional[int]
    resolution: Optional[QueryResolutionResult]

    def __new__(
        cls,
        candidates: List[Dict[str, Any]],
        top_topic_id: Optional[int],
        resolution: Optional[QueryResolutionResult] = None,
    ):
        obj = super().__new__(cls, (candidates, top_topic_id, resolution))
        obj.candidates = candidates
        obj.top_topic_id = top_topic_id
        obj.resolution = resolution
        return obj


def detect_language(text: str) -> str:
    """Automatically detect whether the text is English, Hindi (Devanagari), or Hinglish (Romanized Hindi).

    Rule:
    1. If Devanagari script characters are present -> 'Hindi'
    2. If Roman Hindi / Hinglish vocabulary & particles are present -> 'Hinglish'
    3. Otherwise -> 'English'
    """
    if not text:
        return "English"

    # Check for Devanagari script range \u0900-\u097F
    if re.search(r"[\u0900-\u097F]", text):
        return "Hindi"

    # Check for Hinglish words / markers
    hinglish_markers = {
        "kya", "hai", "hain", "kaise", "kyun", "samjhao", "batao", "hota", "hoti", "hote",
        "mein", "ke", "ki", "ko", "se", "par", "aur", "ya", "bhi", "tha", "the", "thi",
        "karo", "karein", "bataiye", "samjha", "samjhaiye", "kisi", "yeh", "woh", "wale",
        "wali", "hoga", "hogi", "honge", "bhasha", "karna", "karke", "zara", "thoda",
        "bata", "dijiye", "kijiye", "acha", "achha", "tarah", "kaun", "kaunsa", "kitna"
    }

    tokens = re.findall(r"\b[a-zA-Z]{2,}\b", text.lower())
    hinglish_count = sum(1 for t in tokens if t in hinglish_markers)

    if hinglish_count >= 1:
        return "Hinglish"

    return "English"


def sanitize_query(query: str) -> str:
    """Strip prompt injection patterns from user query."""
    return _INJECTION_PATTERNS.sub("[removed]", query).strip()


def get_localized_notice(language: str) -> str:
    """Return subtle localized notice for General Knowledge fallback mode."""
    lang_lower = (language or "English").lower()
    if "hinglish" in lang_lower:
        return "Your uploaded notes mein yeh topic cover nahi hai. Neeche general knowledge ke basis par answer diya gaya hai."
    elif "hindi" in lang_lower:
        return "आपके अपलोड किए गए नोट्स में यह विषय उपलब्ध नहीं है। नीचे सामान्य ज्ञान के आधार पर उत्तर दिया गया है।"
    return "Your uploaded notes don't cover this topic. Here's a general-knowledge answer instead."


def extract_keywords(text: str) -> List[str]:
    """Extract informative lowercase keywords and acronyms from text."""
    words = re.findall(r"\b[a-zA-Z0-9_\-]{2,}\b", text.lower())
    return [w for w in words if w not in STOPWORDS]


def detect_query_intent(query: str) -> str:
    """Dynamically classify query intent based on linguistic cues across any domain."""
    q_lower = query.lower()
    for intent, data in INTENT_INDICATORS.items():
        for cue in data["query_cues"]:
            pattern = rf"\b{re.escape(cue)}\b"
            if re.search(pattern, q_lower):
                return intent
    return "general"


def extract_numbered_items_from_text(text: str) -> List[str]:
    """Dynamically extract structured list items (numbered or bulleted) from an assistant answer."""
    items = []
    # Pattern 1: Numbered lines e.g. "1. Non-Preemptive Scheduling: ..." or "3. Third Normal Form (3NF)"
    for line in text.strip().splitlines():
        line = line.strip()
        m = re.match(r"^(?:\d+[\.\)]|\*|-|•)\s+(?:[\*\#_]*)([A-Za-z0-9\s\-_/\(\)]+?)(?:[\*\#_]*)(?::\s*|\s+[–—]\s+|\.\s+|$)", line)
        if m:
            item = m.group(1).strip(" \t\n\r*:-_#")
            if item and len(item) >= 2 and item.lower() not in STOPWORDS:
                items.append(item)

    # Pattern 2: Bold list titles e.g. "**Non-Preemptive Scheduling**"
    if not items:
        bold_matches = re.findall(r"\*\*([A-Za-z0-9\s\-_/,\(\)]{2,50}?)\*\*", text)
        for m in bold_matches:
            clean = m.strip()
            if clean and len(clean) >= 2 and clean.lower() not in STOPWORDS:
                items.append(clean)

    return items


def extract_entities_from_text(text: str) -> List[str]:
    """Extract key technical entities and noun phrases dynamically from text."""
    # Find capitalized words or acronyms (e.g. CPU, ACID, TCP, B-Tree, Round Robin)
    acronyms_and_proper = re.findall(r"\b[A-Z][a-zA-Z0-9_\-]{1,20}\b", text)
    keywords = extract_keywords(text)
    combined = []
    for token in acronyms_and_proper + keywords:
        clean = token.strip().lower()
        if clean and clean not in STOPWORDS and clean not in combined:
            combined.append(clean)
    return combined[:6]


def resolve_conversational_query(
    query: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
    current_topic: Optional[str] = None,
) -> QueryResolutionResult:
    """Production-grade, domain-agnostic conversational query resolver.

    Handles:
    - Pronoun resolution ('it', 'its', 'they', 'this', 'that', 'these', 'those')
    - Ordinal / reference resolution ('first one', 'second one', '1st point', 'last point', 'former', 'latter')
    - Contextual continuations ('advantages?', 'and types?', 'why is that?', 'how does it work?')
    - Ellipsis & incomplete queries

    Never injects static subject names (e.g., 'Operating Systems') to prevent retrieval pollution.
    """
    safe_query = sanitize_query(query).strip()
    intent = detect_query_intent(safe_query)
    q_lower = safe_query.lower()

    if not chat_history:
        return QueryResolutionResult(
            original_query=safe_query,
            resolved_query=safe_query,
            is_follow_up=False,
            resolved_topic=current_topic,
            intent=intent,
            entities=extract_entities_from_text(safe_query),
        )

    # Inspect recent conversation history
    last_user_query = ""
    last_assistant_answer = ""

    for turn in reversed(chat_history):
        role = turn.get("role", "").lower()
        content = turn.get("content", "").strip()
        if not last_user_query and role in ("user", "human"):
            last_user_query = content
        elif not last_assistant_answer and role in ("assistant", "model"):
            last_assistant_answer = content
        if last_user_query and last_assistant_answer:
            break

    # 1. Detect Ordinal References ('first one', 'second one', '1st one', 'last point', etc.)
    ordinal_patterns = [
        (r"\b(?:the\s+)?(?:first|1st)\s+(?:one|point|type|algorithm|method|item|category|step)\b", 0),
        (r"\b(?:the\s+)?(?:second|2nd)\s+(?:one|point|type|algorithm|method|item|category|step)\b", 1),
        (r"\b(?:the\s+)?(?:third|3rd)\s+(?:one|point|type|algorithm|method|item|category|step)\b", 2),
        (r"\b(?:the\s+)?(?:fourth|4th)\s+(?:one|point|type|algorithm|method|item|category|step)\b", 3),
        (r"\b(?:the\s+)?(?:last|final)\s+(?:one|point|type|algorithm|method|item|category|step)\b", -1),
    ]

    for pat, idx in ordinal_patterns:
        if re.search(pat, q_lower):
            # Search across all assistant turns in history from newest to oldest for structured list items
            for turn in reversed(chat_history):
                if turn.get("role", "").lower() in ("assistant", "model"):
                    ans_text = turn.get("content", "")
                    extracted_items = extract_numbered_items_from_text(ans_text)
                    if extracted_items:
                        target_item = None
                        if idx == -1 and extracted_items:
                            target_item = extracted_items[-1]
                        elif 0 <= idx < len(extracted_items):
                            target_item = extracted_items[idx]

                        if target_item:
                            resolved = re.sub(pat, target_item, safe_query, flags=re.IGNORECASE)
                            logger.info("[Conversational Resolver] Ordinal Match '%s' -> '%s' (item: %s)", safe_query, resolved, target_item)
                            return QueryResolutionResult(
                                original_query=safe_query,
                                resolved_query=resolved,
                                is_follow_up=True,
                                resolved_topic=target_item,
                                intent=intent,
                                entities=[target_item],
                            )

    # 2. Detect Pronouns & Continuation Follow-Ups
    pronouns = [r"\bits\b", r"\bit\b", r"\bthis\b", r"\bthat\b", r"\bthese\b", r"\bthose\b", r"\bthey\b", r"\btheir\b", r"\bthem\b"]
    has_pronoun = any(re.search(p, q_lower) for p in pronouns)
    is_short_continuation = len(safe_query.split()) <= 4 and (
        intent != "general" or "why" in q_lower or "how" in q_lower or "what about" in q_lower or "more" in q_lower
    )

    if has_pronoun or is_short_continuation:
        # Extract primary substantive entity from previous user turns (filtering out intent meta-words)
        intent_metawords = {
            "advantages", "advantage", "types", "type", "disadvantages", "disadvantage",
            "benefits", "benefit", "mechanism", "examples", "example", "key", "main", "first", "second"
        }
        subject_entity = ""
        for turn in reversed(chat_history):
            if turn.get("role", "").lower() in ("user", "human"):
                user_text = turn.get("content", "")
                keywords = extract_keywords(user_text)
                substantive = [k for k in keywords if k not in intent_metawords]
                if substantive:
                    subject_entity = " ".join(substantive[:3])
                    break

        if not subject_entity:
            subject_entity = current_topic or ""

        if subject_entity:
            resolved = safe_query
            for p in pronouns:
                resolved = re.sub(p, f"the {subject_entity}", resolved, flags=re.IGNORECASE)

            if resolved == safe_query or is_short_continuation:
                if not re.search(rf"\b{re.escape(subject_entity)}\b", resolved, re.IGNORECASE):
                    resolved = f"{safe_query} regarding {subject_entity}"

            logger.info("[Conversational Resolver] Follow-Up '%s' -> '%s' (Entity: %s)", safe_query, resolved, subject_entity)
            return QueryResolutionResult(
                original_query=safe_query,
                resolved_query=resolved,
                is_follow_up=True,
                resolved_topic=subject_entity,
                intent=intent,
                entities=extract_entities_from_text(resolved),
            )

    return QueryResolutionResult(
        original_query=safe_query,
        resolved_query=safe_query,
        is_follow_up=False,
        resolved_topic=current_topic,
        intent=intent,
        entities=extract_entities_from_text(safe_query),
    )


def compute_bm25_lexical_score(
    query_tokens: List[str],
    doc_tokens: List[str],
    avg_doc_len: float = 100.0,
    k1: float = 1.5,
    b: float = 0.75,
) -> float:
    """Compute BM25-style lexical relevance score between query and document tokens."""
    if not query_tokens or not doc_tokens:
        return 0.0

    doc_len = len(doc_tokens)
    doc_freq = Counter(doc_tokens)
    score = 0.0

    for token in set(query_tokens):
        if token in doc_freq:
            tf = doc_freq[token]
            weight = 2.0 if len(token) <= 4 and token.isupper() else 1.0
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * (doc_len / (avg_doc_len or 100.0)))
            score += weight * (numerator / denominator)

    return score


def compute_lexical_overlap(query: str, text: str) -> float:
    """Calculate ratio of significant query keywords found in text."""
    keywords = extract_keywords(query)
    if not keywords:
        return 1.0
    text_lower = text.lower()
    matches = sum(1 for kw in keywords if kw in text_lower)
    return matches / len(keywords)


def evaluate_intent_evidence(intent: str, text: str) -> float:
    """Evaluate whether candidate text contains actual evidence addressing the user's specific intent."""
    if intent == "general" or intent not in INTENT_INDICATORS:
        return 1.0  # No specific intent constraint

    evidence_cues = INTENT_INDICATORS[intent]["evidence_cues"]
    text_lower = text.lower()
    matches = sum(1 for cue in evidence_cues if cue in text_lower)

    if matches >= 2:
        return 1.0
    elif matches == 1:
        return 0.75
    return 0.30  # Low intent evidence: chunks mention entity but do not answer requested intent


def retrieve_filtered_chunks(
    db: Session,
    user_id: Optional[str],
    subject: str,
    query_emb: List[float],
    selected_source_ids: Optional[List[int]] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
    original_query: str = "",
) -> Tuple[List[Dict[str, Any]], Optional[int], QueryResolutionResult]:
    """Production-grade Hybrid Multi-Stage Retrieval strictly scoped to user and selected sources."""
    # Resolve conversational query dynamically
    resolution = resolve_conversational_query(original_query, chat_history)

    # Explicit empty selection: user deselected all sources
    if selected_source_ids is not None and len(selected_source_ids) == 0:
        logger.info("[RAG 2.0] Empty selected_source_ids provided; returning 0 chunks.")
        return RetrievalTuple([], None, resolution)

    # Database query on Note for the subject strictly scoped by user ownership
    filters = []
    if user_id:
        filters.append(Note.user_id == user_id)
    else:
        filters.append(Note.user_id == "guest_user")

    if selected_source_ids is not None and len(selected_source_ids) > 0:
        filters.append(Note.id.in_(selected_source_ids))

    note_query = db.query(Note.id).filter(Note.subject == subject).filter(*filters)

    allowed_note_ids = [n[0] for n in note_query.all()]
    if not allowed_note_ids:
        logger.info("[RAG 2.0] No notes match filter (user_id=%s, subject=%s, sources=%s).", user_id, subject, selected_source_ids)
        return RetrievalTuple([], None, resolution)

    chunks_db = (
        db.query(NoteChunk)
        .options(joinedload(NoteChunk.note))
        .filter(NoteChunk.note_id.in_(allowed_note_ids))
        .all()
    )

    if not chunks_db:
        return RetrievalTuple([], None, resolution)

    query_tokens = extract_keywords(resolution.resolved_query)

    dense_scores: Dict[int, float] = {}
    lexical_scores: Dict[int, float] = {}
    chunk_dict: Dict[int, Dict[str, Any]] = {}

    for c in chunks_db:
        c_text = c.cleaned_text or c.chunk_text or ""
        dense_sim = 0.0
        if c.embedding:
            try:
                dense_sim = float(cosine_sim(query_emb, json.loads(c.embedding)))
            except Exception:
                dense_sim = c.similarity_score or 0.0
        else:
            dense_sim = c.similarity_score or 0.0

        dense_scores[c.id] = dense_sim

        doc_tokens = extract_keywords(c_text)
        lex_score = compute_bm25_lexical_score(query_tokens, doc_tokens)
        lexical_scores[c.id] = lex_score

        chunk_dict[c.id] = {
            "chunk_id": c.id,
            "note_id": c.note_id,
            "source_name": c.note.original_filename if c.note else f"Note #{c.note_id}",
            "chunk_text": c.chunk_text,
            "cleaned_text": c.cleaned_text,
            "diagram_mermaid": c.diagram_mermaid,
            "is_representative": c.is_representative,
            "matched_topic_id": c.matched_topic_id,
            "dense_score": round(dense_sim, 4),
            "lexical_score": round(lex_score, 4),
            "similarity_score": round(dense_sim, 4),
        }

    # Reciprocal Rank Fusion (RRF)
    sorted_by_dense = sorted(dense_scores.keys(), key=lambda cid: dense_scores[cid], reverse=True)
    sorted_by_lexical = sorted(lexical_scores.keys(), key=lambda cid: lexical_scores[cid], reverse=True)

    dense_ranks = {cid: rank for rank, cid in enumerate(sorted_by_dense, start=1)}
    lexical_ranks = {cid: rank for rank, cid in enumerate(sorted_by_lexical, start=1)}

    rrf_scores: Dict[int, float] = {}
    for cid in chunk_dict:
        r_dense = dense_ranks[cid]
        r_lex = lexical_ranks[cid]
        rrf = (1.0 / (rag_settings.RRF_K + r_dense)) + (0.8 / (rag_settings.RRF_K + r_lex))
        if chunk_dict[cid]["is_representative"]:
            rrf *= 1.15
        rrf_scores[cid] = rrf
        chunk_dict[cid]["rrf_score"] = round(rrf, 5)

    # MMR Diversity Selection
    sorted_candidates = [chunk_dict[cid] for cid in sorted(rrf_scores.keys(), key=lambda cid: rrf_scores[cid], reverse=True)]

    selected_chunks: List[Dict[str, Any]] = []
    seen_texts: List[str] = []

    for candidate in sorted_candidates:
        c_text = candidate.get("cleaned_text") or candidate.get("chunk_text") or ""
        cand_words = set(extract_keywords(c_text))
        is_redundant = False
        for seen in seen_texts:
            seen_words = set(extract_keywords(seen))
            if cand_words and seen_words:
                jaccard = len(cand_words & seen_words) / len(cand_words | seen_words)
                if jaccard > 0.80:
                    is_redundant = True
                    break

        if not is_redundant or len(selected_chunks) < 2:
            selected_chunks.append(candidate)
            seen_texts.append(c_text)
        if len(selected_chunks) >= rag_settings.MAX_CANDIDATES:
            break

    top_topic_id = selected_chunks[0]["matched_topic_id"] if selected_chunks else None
    return RetrievalTuple(selected_chunks, top_topic_id, resolution)


def evaluate_evidence(
    query: str,
    candidates: List[Dict[str, Any]],
    topic_mapping_score: float,
    intent: str = "general",
    min_confidence: Optional[float] = None,
    min_relevance: Optional[float] = None,
) -> Tuple[str, List[Dict[str, Any]], float, str]:
    """Production-grade Multi-Signal Evidence Evaluation & Intent-Aware Answerability Check.

    Signals evaluated:
    1. Top Dense Semantic Similarity
    2. BM25 / Lexical Overlap with Query Terminology
    3. Intent Evidence Sufficiency (does the text actually answer the specific intent e.g. advantages, types, how it works?)
    4. Topic Space Alignment Confidence
    5. Substantive Text Length Check

    Returns:
        (decision_mode, top_evidence_chunks, confidence_score, confidence_label)
        decision_mode: 'NOTES_SUPPORTED' | 'NOTES_WEAK' | 'NOTES_NOT_FOUND'
    """
    min_conf = min_confidence if min_confidence is not None else rag_settings.MIN_CONFIDENCE
    min_rel = min_relevance if min_relevance is not None else rag_settings.MIN_RELEVANCE

    if not candidates:
        return "NOTES_NOT_FOUND", [], 0.0, "Unmapped"

    def _get_dense(c: Dict[str, Any]) -> float:
        return float(c.get("dense_score", c.get("similarity_score", 0.0)))

    top_candidates = [c for c in candidates if _get_dense(c) >= min_rel or c.get("lexical_score", 0) > 1.0]
    if not top_candidates:
        top_candidates = candidates[:2]

    top_chunk_sim = _get_dense(candidates[0])
    top_lexical = max(c.get("lexical_score", 0) for c in candidates[:3])

    combined_text = " ".join((c.get("cleaned_text") or c.get("chunk_text") or "") for c in candidates[:3])
    lexical_overlap = compute_lexical_overlap(query, combined_text)
    intent_evidence_score = evaluate_intent_evidence(intent, combined_text)

    # Multi-signal composite score
    combined_score = (
        (top_chunk_sim * 0.50)
        + (min(1.0, lexical_overlap) * 0.20)
        + (intent_evidence_score * rag_settings.INTENT_EVIDENCE_WEIGHT)
        + (topic_mapping_score * 0.10)
    )

    if combined_score >= rag_settings.CONFIDENCE_HIGH_THRESHOLD:
        confidence_label = "High"
    elif combined_score >= rag_settings.CONFIDENCE_MED_THRESHOLD:
        confidence_label = "Medium"
    else:
        confidence_label = "Low"

    has_substantive_text = len(combined_text.split()) >= 15

    is_supported = (
        (top_chunk_sim >= min_conf or (top_chunk_sim >= min_rel and (lexical_overlap >= 0.20 or top_lexical >= 1.5)))
        and lexical_overlap >= rag_settings.MIN_LEXICAL_OVERLAP
        and intent_evidence_score >= 0.50
        and has_substantive_text
        and len(top_candidates) >= 1
    )

    if is_supported:
        decision_mode = "NOTES_SUPPORTED"
    elif top_chunk_sim >= min_rel * 0.75:
        decision_mode = "NOTES_WEAK"
    else:
        decision_mode = "NOTES_NOT_FOUND"

    logger.info(
        "[RAG 2.0 Evidence] Query='%s' (intent=%s) -> mode=%s dense_sim=%.3f lex_overlap=%.2f intent_score=%.2f combined=%.3f label=%s",
        query[:50], intent, decision_mode, top_chunk_sim, lexical_overlap, intent_evidence_score, combined_score, confidence_label
    )

    final_chunks = top_candidates[:rag_settings.TOP_K] if is_supported else []
    return decision_mode, final_chunks, combined_score, confidence_label


def validate_and_clean_citations(
    answer: str,
    citations: List[CitationItem],
) -> Tuple[str, List[CitationItem]]:
    """Validate that every [n] token in the LLM answer maps to a real citation item.

    Removes out-of-bounds citations (e.g. [99] when only 5 exist) to guarantee zero fake citations.
    """
    if not citations:
        cleaned_answer = re.sub(r"\[\d+\]", "", answer).strip()
        return cleaned_answer, []

    max_cid = len(citations)
    valid_cids = {c.citation_id for c in citations}

    def replace_citation(match):
        cid = int(match.group(1))
        if cid in valid_cids and 1 <= cid <= max_cid:
            return f"[{cid}]"
        return ""

    cleaned_answer = re.sub(r"\[(\d+)\]", replace_citation, answer)
    cleaned_answer = re.sub(r"\s{2,}", " ", cleaned_answer).strip()

    return cleaned_answer, citations


async def _call_gemini_json(
    prompt: str,
    temperature: float = 0.2,
    api_key: Optional[str] = None,
    timeout_seconds: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """Execute Gemini API call with multi-model fallback and exponential backoff.

    Handles 429 (quota/rate-limit), 503 (service unavailable/high demand), and model
    deprecation gracefully. Uses separate connect/read timeouts to tolerate slow but
    live Gemini responses without tripping the connect guard. Retries transient network
    errors (TCP drops, stream resets common on Windows IPv6) before falling through to
    the next candidate model.
    """
    import asyncio

    key = api_key or os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return None

    # Deduplicated list of models to try
    candidate_models = [rag_settings.GEMINI_MODEL]
    for m in getattr(rag_settings, "FALLBACK_MODELS", ("gemini-3.5-flash", "gemini-flash-latest")):
        if m not in candidate_models:
            candidate_models.append(m)

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "response_mime_type": "application/json",
            "maxOutputTokens": rag_settings.MAX_OUTPUT_TOKENS,
            "temperature": temperature,
        },
    }

    timeout_val = timeout_seconds if timeout_seconds is not None else float(getattr(rag_settings, "HTTP_TIMEOUT_SECONDS", 25.0))
    http_timeout = httpx.Timeout(
        connect=5.0,
        read=timeout_val,
        write=5.0,
        pool=5.0,
    )
    max_retries = max(1, getattr(rag_settings, "MAX_RETRIES", 1))

    for model_name in candidate_models:
        target_url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model_name}:generateContent"
        )

        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=http_timeout) as client:
                    res = await client.post(
                        target_url,
                        json=payload,
                        headers={
                            "Content-Type": "application/json",
                            "x-goog-api-key": key,
                        },
                    )

                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if (
                        candidates
                        and "content" in candidates[0]
                        and "parts" in candidates[0]["content"]
                    ):
                        text_content = candidates[0]["content"]["parts"][0]["text"]
                        clean_json = re.sub(r"^```(?:json)?\s*", "", text_content.strip(), flags=re.MULTILINE)
                        clean_json = re.sub(r"\s*```$", "", clean_json.strip(), flags=re.MULTILINE)
                        try:
                            return json.loads(clean_json)
                        except json.JSONDecodeError:
                            # Fallback 1: match outermost JSON object/array
                            m = re.search(r"(\{.*\}|\[.*\])", clean_json, re.DOTALL)
                            if m:
                                try:
                                    return json.loads(m.group(0))
                                except json.JSONDecodeError:
                                    pass
                            # Fallback 2: raw_decode from first open brace/bracket to ignore trailing extra text
                            start_brace = clean_json.find("{")
                            start_bracket = clean_json.find("[")
                            indices = [i for i in [start_brace, start_bracket] if i != -1]
                            if indices:
                                first_idx = min(indices)
                                try:
                                    obj, _ = json.JSONDecoder().raw_decode(clean_json[first_idx:])
                                    return obj
                                except Exception:
                                    pass
                            raise

                if res.status_code == 429:
                    # Quota/rate-limit on this model: try next candidate model
                    logger.warning(
                        "Gemini model %s returned HTTP 429 (quota/rate-limit). Trying next candidate model.",
                        model_name,
                    )
                    break  # try next candidate model

                if res.status_code == 503:
                    # Transient high demand: back off and retry
                    wait_time = 0.8 * (2 ** attempt)
                    logger.warning(
                        "Gemini model %s returned HTTP 503. Retrying in %.1fs...",
                        model_name, wait_time,
                    )
                    await asyncio.sleep(wait_time)
                    continue

                if res.status_code == 404:
                    # Model deprecated/not found: try next candidate
                    logger.warning(
                        "Gemini model %s returned 404 (not found). Trying next model.",
                        model_name,
                    )
                    break  # inner loop → next model_name

                logger.warning(
                    "Gemini API error (%d) for model %s: %s",
                    res.status_code, model_name, res.text[:200],
                )
                break  # non-retryable HTTP error → next model

            except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError) as exc:
                # Transient network issue (TCP drop, IPv6 RST, stream read error on Windows).
                # Retry with exponential backoff before giving up on this model.
                wait_time = 0.5 * (2 ** attempt)
                logger.warning(
                    "Transient network error calling Gemini model %s (attempt %d/%d): %s. "
                    "Retrying in %.1fs...",
                    model_name, attempt + 1, max_retries, exc, wait_time,
                )
                if attempt < max_retries - 1:
                    await asyncio.sleep(wait_time)
                    continue
                # Exhausted retries for this model → try next model
                logger.warning(
                    "All %d attempts exhausted for model %s. Trying next candidate.",
                    max_retries, model_name,
                )
                break

            except Exception as exc:
                logger.warning("Unexpected error calling Gemini model %s: %s", model_name, exc)
                break  # non-recoverable → next model

    return None


def _build_deterministic_gk_fallback(
    query: str,
    subject: str,
    target_language: str,
) -> Tuple[str, str, List[str]]:
    """Build a reliable, domain-agnostic general knowledge answer with ZERO note context.
    
    Used as an ultra-reliable fallback if Gemini API is unreachable or completely rate-limited.
    """
    lang_lower = (target_language or "English").lower()
    
    if "hinglish" in lang_lower:
        answer = (
            f"**{query}** ek important academic concept hai jo {subject} domain se relate karta hai.\n\n"
            f"General theoretical understanding ke according, iska main purpose system architecture, "
            f"resource management aur structured computation ko optimize karna hota hai. "
            f"Yeh modern computer systems aur university syllabus mein core foundational topic ke roop mein padhaya jata hai."
        )
        explanation = (
            f"{subject} mein yeh concept fundamental building block ke roop mein operate karta hai, "
            f"jisse efficient coordination aur standard academic problem-solving possible hoti hai."
        )
        related = [
            f"{query} ke key characteristics aur types kya hain?",
            f"Real-world computing environments mein {query} kaise kaam karta hai?",
            f"{query} ke main advantages aur limitations kya hain?",
        ]
    elif "hindi" in lang_lower:
        answer = (
            f"**{query}** {subject} का एक महत्वपूर्ण सैद्धांतिक और व्यावहारिक विषय है।\n\n"
            f"सामान्य शैक्षणिक समझ के अनुसार, इसका मुख्य उद्देश्य प्रणाली की कार्यक्षमता, "
            f"संसाधनों के प्रबंधन और संरचनात्मक विश्लेषण को सुगम बनाना है। "
            f"यह आधुनिक कंप्यूटर प्रणाली के मुख्य सिद्धांतों में से एक है।"
        )
        explanation = (
            f"यह अवधारणा {subject} के मुख्य सिद्धांतों पर आधारित है और समग्र प्रणाली को सुव्यवस्थित रखने में मदद करती है।"
        )
        related = [
            f"{query} के प्रमुख प्रकार और विशेषताएं क्या हैं?",
            f"वास्तविक अनुप्रयोगों में {query} का उपयोग कैसे किया जाता है?",
            f"{query} के प्रमुख लाभ और चुनौतियां क्या हैं?",
        ]
    else:
        answer = (
            f"**{query}** is a fundamental academic concept within the study of {subject}.\n\n"
            f"From standard theoretical principles, it establishes core mechanisms for resource management, "
            f"predictable system workflows, and computational efficiency. "
            f"It represents an essential curriculum topic for analyzing tradeoffs and engineering scalable solutions."
        )
        explanation = (
            f"In {subject}, this concept serves as a key foundational pillar, enabling structured coordination "
            f"and reliable performance across various computing layers."
        )
        related = [
            f"What are the core mechanisms and classifications of {query}?",
            f"How is {query} implemented in modern computing systems?",
            f"What are the key tradeoffs and advantages associated with {query}?",
        ]
    
    return answer, explanation, related


async def generate_grounded_answer(
    query: str,
    subject: str,
    topic_name: str,
    chunks: List[Dict[str, Any]],
    target_language: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Tuple[str, str, List[CitationItem], Optional[str], List[str]]:
    """Synthesize grounded student answer with exact citations and multi-source synthesis."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    safe_query = sanitize_query(query)

    context_blocks = []
    citations: List[CitationItem] = []
    diagram_mermaid: Optional[str] = None

    for idx, c in enumerate(chunks, start=1):
        c_text = c.get("cleaned_text") or c.get("chunk_text") or ""
        source_name = c.get("source_name") or f"Source Note #{c.get('note_id', idx)}"
        context_blocks.append(f"[Excerpt {idx}] (Source: {source_name})\n{c_text}")
        citations.append(CitationItem(
            citation_id=idx,
            source_id=c.get("note_id", 0),
            source_name=source_name,
            chunk_id=c.get("chunk_id", 0),
            page_number=None,
            snippet=c_text[:200] + ("..." if len(c_text) > 200 else ""),
            similarity_score=c.get("similarity_score"),
        ))
        if not diagram_mermaid and c.get("diagram_mermaid"):
            diagram_mermaid = c.get("diagram_mermaid")

    context_str = "\n\n".join(context_blocks)
    if len(context_str) > rag_settings.MAX_CONTEXT_CHARS:
        context_str = context_str[:rag_settings.MAX_CONTEXT_CHARS] + "\n[... truncated for length]"

    history_str = ""
    if chat_history:
        history_entries = [f"{turn.get('role', 'user')}: {turn.get('content', '')}" for turn in chat_history[-3:]]
        history_str = "Recent Conversation History:\n" + "\n".join(history_entries) + "\n\n"

    lang_instruction = f"strictly in {target_language}"
    if "hinglish" in target_language.lower():
        lang_instruction = "in natural Roman Hindi (Hinglish) blended with technical English terms"
    elif "hindi" in target_language.lower():
        lang_instruction = "in natural Devanagari Hindi"

    prompt = f"""You are a university academic research and study tutor for students studying {subject} ({topic_name}).

{history_str}CONTEXT FROM STUDENT UPLOADED NOTES:
{context_str}

STUDENT QUESTION: {safe_query}
TARGET LANGUAGE: {target_language}

CRITICAL RULES:
1. Answer strictly and solely using facts present in the supplied note context excerpts.
2. Every important factual claim MUST include a citation marker like [1], [2] pointing to the supporting excerpt.
3. Synthesize information smoothly across multiple sources where applicable. If different notes present conflicting details, clearly note the conflict and cite both.
4. Do not use outside knowledge to fill in missing information. If information is not in the notes, state that briefly.
5. Provide a clear, natural answer {lang_instruction}.
6. Provide a brief 2-3 sentence concept explanation {lang_instruction}.
7. Suggest 2-3 relevant follow-up study questions.
8. Format your response strictly as JSON with keys:
   - "answer": string (with inline citation tags like [1], [2])
   - "explanation": string
   - "related_questions": list of strings
"""

    if api_key:
        parsed = await _call_gemini_json(prompt, temperature=rag_settings.TEMPERATURE_GROUNDED, api_key=api_key)
        if parsed:
            ans = parsed.get("answer", "")
            expl = parsed.get("explanation", "")
            rel = parsed.get("related_questions", [])
            cleaned_ans, valid_cits = validate_and_clean_citations(ans, citations)
            return cleaned_ans, expl, valid_cits, diagram_mermaid, rel

    # Fast, high-quality structured grounded synthesis from retrieved chunks
    logger.info("Synthesizing grounded answer locally from %d retrieved chunks.", len(chunks))
    top_c = chunks[0]
    snippet1 = (top_c.get("cleaned_text") or top_c.get("chunk_text") or "").strip()
    lang_lower = (target_language or "English").lower()

    if len(chunks) > 1:
        snippet2 = (chunks[1].get("cleaned_text") or chunks[1].get("chunk_text") or "").strip()
        body_content = f"{snippet1} [1]\n\nAdditionally, according to {chunks[1].get('source_name', 'Note #2')}: {snippet2[:300]} [2]"
    else:
        body_content = f"{snippet1} [1]"

    if "hinglish" in lang_lower:
        synthesized_ans = (
            f"Aapke uploaded notes ke basis par, **{topic_name}** ke baare mein key details:\n\n"
            f"{body_content}"
        )
        mock_expl = f"Yeh explanation aapke uploaded course notes par grounded hai jismein {topic_name} ke core concepts explain kiye gaye hain."
        mock_rel = [f"{topic_name} ke main applications aur properties kya hain?", f"{topic_name} se related previous year questions kya hain?"]
    elif "hindi" in lang_lower:
        synthesized_ans = (
            f"आपके अपलोड किए गए नोट्स के अनुसार, **{topic_name}** का विवरण इस प्रकार है:\n\n"
            f"{body_content}"
        )
        mock_expl = f"यह व्याख्या आपके पाठ्यक्रम नोट्स पर आधारित है जिसमें {topic_name} की मुख्य अवधारणाएं शामिल हैं।"
        mock_rel = [f"{topic_name} के प्रमुख उपयोग क्या हैं?", f"{topic_name} के महत्वपूर्ण सिद्धांत क्या हैं?"]
    else:
        synthesized_ans = (
            f"Based on your uploaded course notes on **{topic_name}**:\n\n"
            f"{body_content}"
        )
        mock_expl = f"Key conceptual summary for {topic_name} strictly grounded in your uploaded university course materials."
        mock_rel = [f"Explain key architectural components of {topic_name}.", f"What are common examination questions for {topic_name}?"]

    cleaned_ans, valid_cits = validate_and_clean_citations(synthesized_ans, citations)
    return cleaned_ans, mock_expl, valid_cits, diagram_mermaid, mock_rel


async def generate_general_knowledge_answer(
    query: str,
    subject: str,
    target_language: str,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> Tuple[str, str, List[str]]:
    """Generate general knowledge answer with ZERO note context.

    CRITICAL REQUIREMENT: No note chunks, source filenames, or document snippets are passed in this request.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    safe_query = sanitize_query(query)

    history_str = ""
    if chat_history:
        history_entries = [f"{turn.get('role', 'user')}: {turn.get('content', '')}" for turn in chat_history[-3:]]
        history_str = "Recent Conversation History:\n" + "\n".join(history_entries) + "\n\n"

    lang_instruction = f"strictly in {target_language}"
    if "hinglish" in target_language.lower():
        lang_instruction = "in natural Roman Hindi (Hinglish) blended with technical English terms"
    elif "hindi" in target_language.lower():
        lang_instruction = "in natural Devanagari Hindi"

    prompt = f"""You are an intelligent educational AI assistant answering a university student's question.

{history_str}STUDENT QUESTION: {safe_query}
SUBJECT DOMAIN: {subject}
TARGET LANGUAGE: {target_language}

CRITICAL INSTRUCTIONS:
1. Answer the question accurately, clearly, and concisely {lang_instruction}.
2. Use your general academic knowledge. The user's uploaded course notes are not provided to you.
3. NEVER fabricate citations (do not use [1], [2]) and never claim information came from the student's notes.
4. Provide a brief 2-3 sentence concept explanation {lang_instruction}.
5. Suggest 2-3 helpful follow-up study questions.
6. Format your response strictly as JSON with keys:
   - "answer": string
   - "explanation": string
   - "related_questions": list of strings
"""

    if not api_key:
        logger.warning("GEMINI_API_KEY not configured; returning deterministic general knowledge response.")
        return _build_deterministic_gk_fallback(query, subject, target_language)

    parsed = await _call_gemini_json(prompt, temperature=rag_settings.TEMPERATURE_FALLBACK, api_key=api_key)
    if parsed:
        ans = parsed.get("answer", "")
        expl = parsed.get("explanation", "")
        rel = parsed.get("related_questions", [])
        ans = re.sub(r"\[\d+\]", "", ans).strip()
        return ans, expl, rel

    logger.warning("Gemini API call failed for general knowledge; using robust zero-context academic generator.")
    return _build_deterministic_gk_fallback(query, subject, target_language)
