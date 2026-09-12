"""
Core Note Formatter and AI Cleaning Engine.

Cleans raw extracted student notes and deduplicated representative chunks.
Uses a two-layer architecture:

Layer 1 — Deterministic (always runs, never fails):
    Generic rule-based cleaning: repeated-line removal, page-number patterns,
    unicode normalization, structure detection, bullet normalisation.
    Produces readable text even if the LLM layer is unavailable.

Layer 2 — LLM (Gemini, optional):
    Semantic re-formatting: paragraph organisation, heading detection,
    bullet clean-up, readable educational language.
    Falls back gracefully to Layer 1 on API failure or quota exhaustion.

Post-cleaning validation:
    Checks that the LLM did not over-clean or hallucinate replacement content.
    If word-count loss is > 70 %, the Layer 1 result is used instead.

No hardcoded college names, course names, or document-specific patterns.
"""

import json
import logging
import os
import re
import time
import unicodedata
from typing import Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Gemini config
# ---------------------------------------------------------------------------

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
GEMINI_URL_BASE = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
)
GEMINI_TIMEOUT_SECONDS = 3.0
GEMINI_MAX_RETRIES = 0          # fail fast to local cleaning on 429 / timeout
GEMINI_RETRY_BASE_SECONDS = 1.0

_CIRCUIT_BREAKER_UNTIL = 0.0

# If cleaned output is less than this fraction of input word count, treat as
# over-cleaned and fall back to local result.
MIN_WORD_RETENTION_RATIO = 0.30

# ---------------------------------------------------------------------------
# Gemini prompt — generic, no hardcoded college / course names
# ---------------------------------------------------------------------------

CLEANING_AND_DIAGRAM_PROMPT = """\
You are an expert academic editor and study-guide creator.
You receive raw text extracted from a student lecture-note PDF.
The text may contain PDF extraction artefacts. Your job is two tasks.

TASK 1 — CLEAN AND STRUCTURE THE NOTE:
1. Remove any institutional branding you detect: college names, department
   names, course codes, author credentials, "lecture notes on …" headers,
   table-of-contents lines, and PDF metadata artefacts.
   Do NOT name specific colleges in your reasoning; detect them generically.
2. Remove page numbers and running headers / footers.
3. Structure the core academic content using clean Markdown:
   - Introductory concept sentence (one line)
   - Key points as bullet list (use "- " prefix)
   - Bold important terms: **term**
   - Clear subheadings (### ) for distinct sub-topics
4. Convert any raw bullet glyphs (≡ □ • ▪ ▶ → etc.) into "- ".
5. Preserve ALL technical accuracy: algorithms, definitions, equations,
   formulas, code, and important numbers. Do NOT hallucinate or invent facts.
6. Preserve mathematical notation exactly (e.g. x ≡ y mod n).

TASK 2 — DIAGRAM CLASSIFICATION AND GENERATION:
Determine if the note describes something inherently structural or visual:
  (a) Sequential process or state flow → generate valid `stateDiagram-v2` or
      `flowchart LR` Mermaid diagram.
  (b) Layered / hierarchical architecture → generate valid `flowchart TD`.
  (c) Comparison of algorithms or models → generate a clean Markdown table.

CRITICAL DIAGRAM RULES:
- Use ONLY relationships explicitly present in the source text.
- If content does NOT clearly fit one of these patterns (general prose,
  descriptive explanation), set diagram_mermaid to "NO_DIAGRAM".
- Do NOT force a diagram onto unstructured prose.
- Mermaid code MUST be valid syntax without markdown fences (``` ).

Output ONLY valid JSON with this exact structure:
{{
  "cleaned_text": "Cleaned markdown study note here",
  "diagram_mermaid": "Mermaid diagram code or NO_DIAGRAM"
}}

Raw Note Text:
{raw_text}
"""

# ---------------------------------------------------------------------------
# Generic page-number patterns (same as pdf_extractor but for inline cleaning)
# ---------------------------------------------------------------------------
_PAGE_NUM_LINE_RE = re.compile(
    r"(?ix)"
    r"^\s*(?:"
    r"\d{1,4}"                             # bare: 1  12  120
    r"|page\s*:?\s*\d{1,4}(?:\s*/\s*\d{1,4})?"   # Page 12 / Page: 12/50
    r"|pg\s*\.?\s*\d{1,4}"                # Pg. 12
    r"|\d{1,4}\s+of\s+\d{1,4}"           # 12 of 50
    r"|-\s*\d{1,4}\s*-"                   # - 12 -
    r"|\[\s*\d{1,4}\s*\]"                 # [12]
    r"|\d{1,4}\s*\|\s*p\s*a\s*g\s*e"     # 1 | P a ge
    r"|p\s*a\s*g\s*e\s*\|\s*\d{1,4}"     # P a ge | 1
    r")\s*$"
)

# Trailing page numbers attached to content lines (e.g. "... POLYTECHNIC 1 | P a ge")
_TRAILING_PAGENUM_RE = re.compile(
    r"(?i)(?:\s*\|\s*\d{1,4}\s*$|\s+\d{1,4}\s*\|\s*p\s*a\s*g\s*e\s*$|\s+page\s*:?\s*\d{1,4}\s*$)"
)

# Very short lines (< 5 words) that are probably noise if they appear at
# the very start or end of a block of text
_SHORT_LINE_RE = re.compile(r"^\S+(?:\s+\S+){0,3}$")

# Heading patterns
_HEADING_ALLCAPS_RE = re.compile(r"^[A-Z][A-Z0-9 \-–:]{3,60}$")
_HEADING_NUMBERED_RE = re.compile(
    r"^(?:(?:UNIT[-\s]?\w+)|(?:\d+(?:\.\d+){0,3})\s+[A-Z][A-Za-z])"
)
_HEADING_TITLED_RE = re.compile(r"^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,5})\s*:?\s*$")

# Bullet glyph normalization (line-start only)
_BULLET_GLYPH_START_RE = re.compile(
    r"^[\uf0b7\uf0d8\uf076\uf0e0\u2022\u25cf\u25cb\u25aa\u25fe\u2261"
    r"\u25a1\u25a0\u25b6\u25b8\u2192\u21d2\u2713\u2714\u27a4]\s*"
)

# Numbered / lettered list: "1. " "1) " "a. " "a) " "(1) " "(a) "
_NUMBERED_LIST_RE = re.compile(r"^(?:\(?\d+[.)]\s+|\(?[a-z][.)]\s+)")


# ---------------------------------------------------------------------------
# Layer 1 — Generic deterministic cleaner
# ---------------------------------------------------------------------------

# Educational keywords that indicate a line IS a real heading (not noise)
# Used to distinguish "MEMORY MANAGEMENT" (real heading) from "NMIET COLLEGE" (noise)
_EDUCATIONAL_KEYWORDS = frozenset([
    "introduction", "unit", "chapter", "module", "section", "lecture",
    "memory", "process", "thread", "scheduling", "deadlock", "file",
    "system", "management", "algorithm", "synchronization", "paging",
    "segmentation", "virtual", "disk", "i/o", "device", "network",
    "protocol", "security", "operating", "database", "structure",
    "programming", "cpu", "kernel", "shell", "linux", "unix", "windows",
    "queue", "stack", "tree", "graph", "sorting", "searching", "binary",
    "assembly", "compiler", "linker", "loader", "hardware", "software",
    "classification", "types", "overview", "objectives", "functions",
    "services", "components", "architecture", "concepts", "definition",
    "advantages", "disadvantages", "comparison", "summary", "conclusion",
    "problems", "solutions", "examples", "exercises", "questions",
])

# TOC line pattern: text followed by page numbers like "INTRODUCTION 1-10" or "Topic  42"
_TOC_LINE_CLEANER_RE = re.compile(
    r"^.{3,60}\s+\d{1,4}(?:\s*[-–]\s*\d{1,4})?\s*$"
)

# Compound page-number: trailing "Subject Name N" where N is 1-4 digits
_COMPOUND_PAGENUM_RE = re.compile(r"^(.+?)\s+(\d{1,4})\s*$")

# Private-use Unicode area
_PRIVATE_USE_CLEANER_RE = re.compile(r"[\uf000-\uf0ff]")


def _is_educational_heading(line: str) -> bool:
    """Check if an ALL-CAPS line is likely a real educational heading.

    Returns True if any word in the line matches educational keywords.
    Short lines (≤2 words) with no educational keywords are probably
    institutional noise like "NMIET COLLEGE" or "COLLEGELYTECHNI".
    """
    words = line.lower().split()
    if not words:
        return False
    # Lines with educational keywords are real headings
    if any(w.rstrip(":,-") in _EDUCATIONAL_KEYWORDS for w in words):
        return True
    # Longer ALL-CAPS lines (>3 words) are more likely real headings
    if len(words) > 3:
        return True
    return False


def clean_note_text_local(text: str) -> str:
    """
    Deterministic, generic cleaning pass (Layer 1).

    This function contains NO hardcoded college / course / document names.
    It is safe to run on any lecture-note PDF.

    Removes:
        - Page-number artifact lines
        - TOC lines (text followed by page numbers)
        - Compound page-number lines (e.g. "Operating System 1")
        - Bullet glyph characters at line start
        - Invisible / zero-width unicode characters
        - Orphaned single characters
        - Private-use Unicode rendering artifacts

    Structures:
        - ALL-CAPS or numbered section lines with educational keywords → ### heading
        - Lines ending with ":" that look like labels → subheading candidate
        - Bullet list items normalised to "- " prefix

    Preserves:
        - Technical terminology
        - Equations and mathematical notation
        - Code blocks
        - All substantive content
    """
    if not text or not text.strip():
        return ""

    lines = text.splitlines()
    output: list[str] = []

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            # Preserve blank lines as paragraph breaks
            if output and output[-1] != "":
                output.append("")
            continue

        # Drop page-number artifact lines
        if _PAGE_NUM_LINE_RE.match(line):
            continue

        # Strip trailing page-number patterns from line end
        if _TRAILING_PAGENUM_RE.search(line):
            line = _TRAILING_PAGENUM_RE.sub("", line).strip()
            if not line:
                continue

        # Strip invisible chars and private-use area chars
        line = re.sub(r"[\u00ad\u200b\u200c\u200d\u200e\u200f\ufeff\u00a0]", " ", line)
        line = _PRIVATE_USE_CLEANER_RE.sub("", line)
        line = re.sub(r"[ \t]{2,}", " ", line).strip()
        if not line:
            continue

        # Drop orphaned single characters (rendering artifacts)
        if len(line) <= 1 and not line.isdigit():
            continue

        # Drop TOC-style lines: "INTRODUCTION 1-10", "Memory Management  42"
        if _TOC_LINE_CLEANER_RE.match(line) and len(line.split()) <= 8:
            continue

        # Detect and normalise bullet glyphs
        if _BULLET_GLYPH_START_RE.match(line):
            line = "- " + _BULLET_GLYPH_START_RE.sub("", line).strip()

        # Detect ALL-CAPS / numbered section headings → markdown heading
        # BUT only if they contain educational keywords (prevents promoting
        # institutional names like "NMIET COLLEGE" to headings)
        is_heading = (
            _HEADING_ALLCAPS_RE.match(line)
            or _HEADING_NUMBERED_RE.match(line)
        )
        if is_heading and not line.startswith("- "):
            if _is_educational_heading(line):
                output.append(f"\n### {line}\n")
                continue
            else:
                # Short ALL-CAPS without educational keywords — skip as noise
                if len(line.split()) <= 3:
                    continue
                # Longer lines: keep as plain text, not heading
                output.append(line)
                continue

        # Detect label-style headings e.g. "Process Synchronization:"
        if _HEADING_TITLED_RE.match(line) and not line.startswith("- "):
            output.append(f"\n### {line.rstrip(':')}\n")
            continue

        # Normalise numbered list items to bullets
        if _NUMBERED_LIST_RE.match(line):
            line = "- " + _NUMBERED_LIST_RE.sub("", line).strip()

        # Bold-ify leading term if "- term: definition" pattern
        if line.startswith("- "):
            body = line[2:]
            colon_match = re.match(r"^([A-Za-z][A-Za-z\s]{1,35}):\s+(.+)", body)
            if colon_match:
                term, defn = colon_match.groups()
                line = f"- **{term.strip()}**: {defn.strip()}"

        output.append(line)

    # Join and clean up whitespace
    result = "\n".join(output)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


# ---------------------------------------------------------------------------
# Post-cleaning validation
# ---------------------------------------------------------------------------

def _validate_cleaned_output(
    raw_text: str,
    cleaned_text: str,
    fallback_text: str,
) -> Tuple[str, bool]:
    """
    Validate that LLM cleaning did not over-remove content.

    Checks:
        1. cleaned_text is non-empty
        2. word count of cleaned >= MIN_WORD_RETENTION_RATIO * word count of raw

    Returns:
        (text_to_use, used_fallback)
    """
    if not cleaned_text or not cleaned_text.strip():
        logger.warning(
            "[NoteFormatter] LLM returned empty cleaned_text; using local fallback. "
            "raw_words=%d",
            len(raw_text.split()),
        )
        return fallback_text, True

    raw_words = len(raw_text.split())
    cleaned_words = len(cleaned_text.split())

    if raw_words > 0 and cleaned_words < MIN_WORD_RETENTION_RATIO * raw_words:
        logger.warning(
            "[NoteFormatter] LLM over-cleaned: raw_words=%d cleaned_words=%d "
            "(%.0f%% retained, min=%.0f%%); using local fallback.",
            raw_words,
            cleaned_words,
            100 * cleaned_words / raw_words,
            100 * MIN_WORD_RETENTION_RATIO,
        )
        return fallback_text, True

    return cleaned_text, False


# ---------------------------------------------------------------------------
# Layer 2 — Gemini LLM cleaner (with retry / backoff)
# ---------------------------------------------------------------------------

def _call_gemini(prompt: str, api_key: str) -> Optional[dict]:
    """
    Call Gemini API with fail-fast fallback to local cleaning on 429 / 503 / timeout.
    Returns parsed JSON dict from Gemini, or None on failure.
    Never raises — all exceptions are caught and logged.
    """
    global _CIRCUIT_BREAKER_UNTIL
    if time.time() < _CIRCUIT_BREAKER_UNTIL:
        return None

    url = f"{GEMINI_URL_BASE}?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        },
    }

    try:
        with httpx.Client(timeout=GEMINI_TIMEOUT_SECONDS) as client:
            resp = client.post(url, json=payload)

        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts and "text" in parts[0]:
                    raw_json_str = parts[0]["text"].strip()
                    if raw_json_str.startswith("```"):
                        raw_json_str = re.sub(r"^```(?:json)?\s*", "", raw_json_str)
                        raw_json_str = re.sub(r"\s*```$", "", raw_json_str).strip()
                    try:
                        return json.loads(raw_json_str)
                    except json.JSONDecodeError:
                        logger.warning(
                            "[NoteFormatter] Gemini JSON parse failure: %s",
                            raw_json_str[:200],
                        )
                        return None
            return None

        elif resp.status_code in (429, 503):
            _CIRCUIT_BREAKER_UNTIL = time.time() + 180.0
            logger.warning(
                "[NoteFormatter] Gemini %d rate limit reached; tripping circuit breaker for 180s. Using fast local cleaner.",
                resp.status_code,
            )
            return None

        else:
            logger.warning(
                "[NoteFormatter] Gemini HTTP %d: %s",
                resp.status_code,
                resp.text[:200],
            )
            return None

    except Exception as exc:
        logger.warning(
            "[NoteFormatter] Gemini call skipped (%s: %s); using local cleaner.",
            type(exc).__name__,
            str(exc),
        )
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def format_and_clean_note(
    raw_text: str,
    api_key: Optional[str] = None,
) -> Tuple[str, Optional[str]]:
    """
    Clean note text and optionally generate a Mermaid diagram.

    Two-layer pipeline:
        1. Deterministic local cleaning (always runs)
        2. Gemini LLM semantic formatting (if key available and quota allows)

    Post-LLM validation ensures the output retains >= 30 % of source word count
    to guard against hallucination or over-removal.

    Args:
        raw_text: Raw chunk or representative note text.
        api_key: Optional Gemini API key override (defaults to env GEMINI_API_KEY).

    Returns:
        Tuple (cleaned_text: str, diagram_mermaid: Optional[str]).
        cleaned_text is always non-empty if raw_text was non-empty.
        diagram_mermaid is None if no structural diagram was identified.
    """
    if not raw_text or not raw_text.strip():
        return "", None

    # ── Layer 1: deterministic cleaning ──────────────────────────────────────
    local_clean = clean_note_text_local(raw_text)
    if not local_clean.strip():
        logger.warning(
            "[NoteFormatter] Local cleaner returned empty result; "
            "raw_text length=%d. Returning raw.",
            len(raw_text),
        )
        return raw_text.strip(), None

    # ── Check for Gemini availability ─────────────────────────────────────────
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        logger.info(
            "[NoteFormatter] GEMINI_API_KEY not set; using local cleaning only."
        )
        return local_clean, None

    # ── Layer 2: Gemini LLM cleaning ─────────────────────────────────────────
    prompt = CLEANING_AND_DIAGRAM_PROMPT.format(raw_text=local_clean)
    gemini_result = _call_gemini(prompt, key)

    if gemini_result is None:
        logger.info(
            "[NoteFormatter] Gemini unavailable; using local cleaning. "
            "local_clean_words=%d",
            len(local_clean.split()),
        )
        return local_clean, None

    gemini_text = gemini_result.get("cleaned_text", "").strip()
    diagram_raw = gemini_result.get("diagram_mermaid", "NO_DIAGRAM").strip()

    # Validate Gemini output
    final_text, used_fallback = _validate_cleaned_output(
        raw_text=local_clean,
        cleaned_text=gemini_text,
        fallback_text=local_clean,
    )

    # Normalise diagram value
    diagram_out: Optional[str] = None
    if not used_fallback and diagram_raw not in ("NO_DIAGRAM", "null", "None", "", None):
        # Strip accidental markdown fences
        diagram_out = re.sub(r"^```(?:mermaid)?\s*", "", diagram_raw)
        diagram_out = re.sub(r"\s*```$", "", diagram_out).strip()
        if not diagram_out:
            diagram_out = None

    logger.debug(
        "[NoteFormatter] Done: raw_words=%d local_words=%d final_words=%d "
        "used_fallback=%s diagram=%s",
        len(raw_text.split()),
        len(local_clean.split()),
        len(final_text.split()),
        used_fallback,
        "yes" if diagram_out else "no",
    )

    return final_text, diagram_out
