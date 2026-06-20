"""
PYQ Analyzer — Extracts questions from Previous Year Question papers and
computes topic importance scores.

Question extraction uses regex heuristics to handle common PYQ formatting
patterns (Q1., 1., a), etc.). Topic importance is estimated as the
normalized frequency of questions mapped to each syllabus topic, reflecting
how often a topic has been examined historically.
"""

import re

from core.pdf_extractor import extract_text_from_pdf
from config import IMPORTANCE_LOW_THRESHOLD, IMPORTANCE_HIGH_THRESHOLD


def extract_questions_from_pdf(filepath: str) -> list[str]:
    """Extract individual questions from a PYQ PDF.

    Uses regex patterns to identify question boundaries. Handles common
    numbering formats: Q1., Q.1, 1., 1), (1), a), (a), i), (i), etc.
    Questions shorter than 5 words are filtered out (likely headers or
    section markers).

    Args:
        filepath: Path to the PYQ PDF file.

    Returns:
        List of extracted question strings.
    """
    text = extract_text_from_pdf(filepath)

    # Pattern to match question starters
    # Matches: Q1., Q.1, Q1), 1., 1), (1), a), (a), i., i), (i), etc.
    question_pattern = re.compile(
        r'(?:^|\n)\s*'
        r'(?:'
        r'Q\.?\s*\d+\s*[.):]'   # Q1. Q.1 Q1) Q1:
        r'|\(\s*\d+\s*\)'       # (1) (2)
        r'|\d+\s*[.)]'          # 1. 1) 2. 2)
        r'|\(\s*[a-z]\s*\)'     # (a) (b)
        r'|[a-z]\s*[.)]'        # a. a) b. b)
        r'|\(\s*[ivxlc]+\s*\)'  # (i) (ii) (iv)
        r'|[ivxlc]+\s*[.)]'     # i. i) ii. ii)
        r')'
        r'\s*',
        re.IGNORECASE
    )

    # Split text at question boundaries
    parts = question_pattern.split(text)

    questions = []
    for part in parts:
        cleaned = part.strip()
        # Filter out very short fragments (headers, noise)
        if cleaned and len(cleaned.split()) >= 5:
            # Collapse multiple whitespace
            cleaned = re.sub(r'\s+', ' ', cleaned)
            questions.append(cleaned)

    return questions


def compute_topic_importance(
    topic_question_counts: dict[int, int],
    total_questions: int,
) -> list[dict]:
    """Compute importance scores for topics based on PYQ question frequency.

    Importance is normalized as: score = topic_question_count / total_questions.
    Labels are assigned based on configurable thresholds:
        - "Low": score < IMPORTANCE_LOW_THRESHOLD (default 0.05)
        - "Medium": IMPORTANCE_LOW_THRESHOLD <= score <= IMPORTANCE_HIGH_THRESHOLD
        - "High": score > IMPORTANCE_HIGH_THRESHOLD (default 0.15)

    Args:
        topic_question_counts: Dict mapping topic_id to the number of PYQ
            questions mapped to that topic.
        total_questions: Total number of PYQ questions across all topics.

    Returns:
        List of dicts with keys: topic_id, question_count, importance_score,
        importance_label.
    """
    results = []
    for topic_id, count in topic_question_counts.items():
        if total_questions > 0:
            score = count / total_questions
        else:
            score = 0.0

        if score > IMPORTANCE_HIGH_THRESHOLD:
            label = "High"
        elif score >= IMPORTANCE_LOW_THRESHOLD:
            label = "Medium"
        else:
            label = "Low"

        results.append({
            "topic_id": topic_id,
            "question_count": count,
            "importance_score": round(score, 4),
            "importance_label": label,
        })

    return results
