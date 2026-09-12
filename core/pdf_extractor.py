"""
PDF Text Extraction and Chunking Module.

Extracts raw text from PDF files using pdfplumber, runs a multi-stage
deterministic cleaning pipeline, and splits the result into semantically
meaningful chunks for embedding.

Pipeline stages (all generic — no hardcoded college/course names):
    1. Per-page text extraction with vertical position metadata
    2. Running header/footer detection (position + frequency + line length)
       - Exact-match frequency (catches identical repeated lines)
       - Prefix-match frequency (catches "DEPT OF CSE 1/2/3..." patterns)
    3. Compound page-number artifact removal (generic regex + prefix analysis)
    4. Table-of-Contents page detection and removal
    5. Unicode / symbol normalization
    6. Paragraph reconstruction (fix PDF visual line-wrapping)
    7. Chunking into N-sentence windows

Configurable thresholds are module-level constants; override via environment
variables for testing or fine-tuning without code changes.
"""

import logging
import os
import re
import unicodedata
from collections import Counter, defaultdict
from typing import Optional

import pdfplumber

try:
    import pypdfium2 as pdfium
except ImportError:
    pdfium = None

from config import SENTENCES_PER_CHUNK, MIN_CHUNK_WORDS

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configurable thresholds (override via env or pass directly to functions)
# ---------------------------------------------------------------------------

# A line is a header/footer candidate if it appears in >= this fraction of pages.
HEADER_FREQ_THRESHOLD: float = float(os.getenv("PDF_HEADER_FREQ_THRESHOLD", "0.30"))

# A line is only considered a header/footer if it's in the top or bottom
# this fraction of the page height (e.g. 0.15 = top 15% or bottom 15%).
HEADER_POSITION_FRACTION: float = float(os.getenv("PDF_HEADER_POSITION_FRACTION", "0.15"))

# Lines longer than this are never treated as page-number artifacts.
PAGE_NUM_MAX_CHARS: int = int(os.getenv("PDF_PAGE_NUM_MAX_CHARS", "80"))

# A line is only treated as a noise header/footer if it contains at most this
# many words. Real running headers like institutional names, course codes, or
# "Department of CSE" are short (1-6 words). Legitimate repeated chapter headings
# like "Chapter 3: Advanced Memory Management..." have many more words and must
# NOT be deleted. Set conservatively to protect content.
NOISE_MAX_WORDS: int = int(os.getenv("PDF_NOISE_MAX_WORDS", "8"))


# ---------------------------------------------------------------------------
# Generic page-number patterns — ordered from most- to least-specific.
# None of these patterns reference actual numbers; \d+ matches any number.
# ---------------------------------------------------------------------------
_PAGE_NUM_PATTERNS: list[re.Pattern] = [
    re.compile(r"^\s*\d{1,4}\s*$"),                             # bare: 1  12  120
    re.compile(r"(?i)^\s*page\s*:?\s*\d{1,4}(\s*/\s*\d{1,4})?\s*$"),  # Page 12 / Page: 12/50
    re.compile(r"(?i)^\s*pg\s*\.?\s*\d{1,4}\s*$"),              # Pg. 12
    re.compile(r"(?i)^\s*\d{1,4}\s+of\s+\d{1,4}\s*$"),         # 12 of 50
    re.compile(r"(?i)^\s*-\s*\d{1,4}\s*-\s*$"),                 # - 12 -
    re.compile(r"(?i)^\s*\[\s*\d{1,4}\s*\]\s*$"),               # [12]
    re.compile(r"(?i)^\s*\d{1,4}\s*\|\s*p\s*a\s*g\s*e\s*$"),   # 1 | P a ge
    re.compile(r"(?i)^\s*p\s*a\s*g\s*e\s*\|\s*\d{1,4}\s*$"),   # P a ge | 1
]

# ---------------------------------------------------------------------------
# Unicode / symbol normalization tables
# ---------------------------------------------------------------------------

# Bullet / list glyphs that appear AT THE START of a line → standard "- "
# Only normalised when they are structural (start-of-line), NOT mid-sentence.
_BULLET_GLYPHS: frozenset[str] = frozenset([
    "\uf0b7",  # Private-use bullet (common in Word→PDF)
    "\uf0d8",  # Private-use right-pointing
    "\uf076",  # Private-use check
    "\uf0e0",  # Private-use envelope (misused as bullet)
    "\u2022",  # BULLET •
    "\u25cf",  # BLACK CIRCLE ●
    "\u25cb",  # WHITE CIRCLE ○
    "\u25aa",  # BLACK SMALL SQUARE ▪
    "\u25fe",  # BLACK MEDIUM SMALL SQUARE ◾
    "\u25a0",  # BLACK SQUARE ■
    "\u25b6",  # BLACK RIGHT-POINTING TRIANGLE ▶
    "\u25b8",  # BLACK RIGHT-POINTING SMALL TRIANGLE ▸
    "\u2192",  # RIGHTWARDS ARROW →
    "\u21d2",  # RIGHTWARDS DOUBLE ARROW ⇒
    "\u2713",  # CHECK MARK ✓
    "\u2714",  # HEAVY CHECK MARK ✔
    "\u27a4",  # BLACK RIGHT ARROWHEAD ➤
    "o",        # "o" used as bullet (common in PowerPoint→PDF)  — handled separately below
])

# ≡ (U+2261) IDENTICAL TO — can be a bullet artifact OR a math equivalence.
# We only convert it when it appears at the start of a line followed by a space.
_TRIPLE_BAR_BULLET_RE = re.compile(r"^\u2261\s+")

# □ (U+25A1) WHITE SQUARE — almost always a bullet artifact in lecture notes.
_WHITE_SQUARE_BULLET_RE = re.compile(r"^\u25a1\s*")

# Invisible / whitespace-only characters to strip
_INVISIBLE_CHARS_RE = re.compile(
    r"[\u00ad\u200b\u200c\u200d\u200e\u200f\ufeff\u00a0]"
)

# Private-use area characters that are rendering artifacts, not content
_PRIVATE_USE_RE = re.compile(r"[\uf000-\uf0ff]")

# Multiple spaces (but not newlines) → single space
_MULTI_SPACE_RE = re.compile(r"[ \t]{2,}")

# Trailing hyphen at end of line indicating a broken word across PDF lines
_TRAILING_HYPHEN_RE = re.compile(r"-\s*$")

# Lines that are clearly section headings: ALL_CAPS, short, no trailing punct
_HEADING_RE = re.compile(r"^[A-Z][A-Z0-9 \-–:,]{3,60}$")

# Numbered section pattern e.g. "1.2.3 Page Replacement" or "UNIT-V"
_NUMBERED_SECTION_RE = re.compile(
    r"^(?:(?:UNIT[-\s]?\w+)|(?:\d+(?:\.\d+){0,3})\s+[A-Z][A-Za-z])"
)

# CID (character ID) artifacts from unembedded fonts: (cid:127) etc.
# pdfplumber emits these when it cannot map a glyph to a Unicode character.
_CID_ARTIFACT_RE = re.compile(r"\(cid:\d+\)", re.IGNORECASE)

# Footer/header lines that contain a page-number pattern ANYWHERE in the line.
# These catch composite lines like "Course Name | Page 3" or "Lecture Notes p.5"
# even though the full line varies per page (preventing frequency detection).
_FOOTER_WITH_PAGENUM_RE = re.compile(
    r"(?i)(?:page\s*:?\s*\d{1,4}|\|\s*\d{1,4}\s*$|p\.\s*\d{1,4}\s*$"
    r"|\bpg\.?\s*\d{1,4}\b|\d{1,4}\s*\|\s*p\s*a\s*g\s*e|p\s*a\s*g\s*e\s*\|\s*\d{1,4})"
)
# Trailing page numbers attached to content lines (e.g. "... POLYTECHNIC 1 | P a ge")
_TRAILING_PAGENUM_RE = re.compile(
    r"(?i)(?:\s*\|\s*\d{1,4}\s*$|\s+\d{1,4}\s*\|\s*p\s*a\s*g\s*e\s*$|\s+page\s*:?\s*\d{1,4}\s*$)"
)
# Maximum line length for the composite footer pattern to apply.
_FOOTER_MAX_CHARS = 120

# TOC line: text followed by page numbers like "INTRODUCTION 1-10" or "Topic Name  42"
_TOC_LINE_RE = re.compile(
    r"^.{3,60}\s+\d{1,4}(?:\s*[-–]\s*\d{1,4})?\s*$"
)

# Compound page-number: "Subject Name N" or "N Subject Name" where N is a bare number
# Used to match lines like "Operating System 1" or "3 DEPT OF CSE"
_COMPOUND_PAGENUM_TRAILING_RE = re.compile(r"^(.+?)\s+(\d{1,4})\s*$")
_COMPOUND_PAGENUM_LEADING_RE = re.compile(r"^\s*(\d{1,4})\s+(.+?)\s*$")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize_line(line: str) -> str:
    """Normalise a line for comparison: NFC unicode, lowercase, collapse spaces."""
    line = unicodedata.normalize("NFC", line)
    line = _INVISIBLE_CHARS_RE.sub(" ", line)
    # Strip CID artifacts from unembedded PDF fonts
    line = _CID_ARTIFACT_RE.sub("", line)
    # Strip private-use characters
    line = _PRIVATE_USE_RE.sub("", line)
    line = _MULTI_SPACE_RE.sub(" ", line)
    return line.strip().lower()


def _strip_trailing_number(line: str) -> Optional[str]:
    """Strip a trailing bare number from a line, returning the prefix or None.

    Used for prefix-based noise detection: "DEPT OF CSE 1", "DEPT OF CSE 2" etc.
    all share the prefix "DEPT OF CSE".
    """
    m = _COMPOUND_PAGENUM_TRAILING_RE.match(line)
    if m:
        return m.group(1).strip()
    return None


def _strip_leading_number(line: str) -> Optional[str]:
    """Strip a leading bare number from a line, returning the suffix or None.

    Used for prefix-based noise detection: "1 DEPT OF CSE", "2 DEPT OF CSE" etc.
    all share the suffix "DEPT OF CSE".
    """
    m = _COMPOUND_PAGENUM_LEADING_RE.match(line)
    if m:
        return m.group(2).strip()
    return None


def _is_page_number_line(line: str) -> bool:
    """Return True if this line is almost certainly a page-number artifact.

    Catches both pure page-number lines (e.g. '12', 'Page 3') and composite
    footer lines that contain a page number anywhere within a short line
    (e.g. 'Course Name | Page 3', 'Lecture Notes p.5').
    """
    stripped = line.strip()
    if len(stripped) > PAGE_NUM_MAX_CHARS:
        return False
    # Pure page-number lines
    if any(pat.match(stripped) for pat in _PAGE_NUM_PATTERNS):
        return True
    # Composite footer lines that contain a page-number pattern
    if len(stripped) <= _FOOTER_MAX_CHARS and _FOOTER_WITH_PAGENUM_RE.search(stripped):
        return True
    return False


def _normalize_bullet(line: str) -> str:
    """
    Convert PDF-native bullet glyphs at the START of a line into "- ".

    Mathematical or mid-sentence uses of the same symbols are preserved
    because this function only rewrites the very beginning of the line.
    """
    if not line:
        return line

    # Handle ≡ (triple bar) as bullet ONLY if at line start + followed by space
    if _TRIPLE_BAR_BULLET_RE.match(line):
        return "- " + _TRIPLE_BAR_BULLET_RE.sub("", line).strip()

    # □ (white square) at line start is almost always a bullet
    if _WHITE_SQUARE_BULLET_RE.match(line):
        return "- " + _WHITE_SQUARE_BULLET_RE.sub("", line).strip()

    # Check if first character is one of the known glyph bullets
    if line[0] in _BULLET_GLYPHS:
        rest = line[1:].lstrip()
        # "o" is only a bullet if the rest is non-empty and doesn't start with a vowel
        # (avoids converting words like "obtain", "order" etc.)
        if line[0] == "o":
            if rest and rest[0].islower():
                return line  # preserve "often ...", "occurs ..." etc.
        if rest:
            return "- " + rest

    return line


def _normalize_unicode(text: str) -> str:
    """
    Full Unicode normalization pass on a block of text.

    - Strip invisible / zero-width chars
    - Normalize to NFC
    - Convert NBSP → regular space
    - Apply bullet normalization per line
    - Collapse multiple spaces
    - Strip private-use area rendering artifacts
    """
    text = unicodedata.normalize("NFC", text)
    text = _INVISIBLE_CHARS_RE.sub(" ", text)

    lines = text.splitlines()
    normalized = []
    for line in lines:
        # Strip CID artifacts from unembedded fonts
        line = _CID_ARTIFACT_RE.sub("", line)
        # Strip private-use area characters (rendering artifacts)
        line = _PRIVATE_USE_RE.sub("", line)
        line = _MULTI_SPACE_RE.sub(" ", line)
        line = _normalize_bullet(line.strip())
        normalized.append(line)

    return "\n".join(normalized)


# ---------------------------------------------------------------------------
# Stage 1 — Extract pages with position metadata
# ---------------------------------------------------------------------------

# Educational keywords that indicate legitimate academic content (never strip as partial noise)
_EDUCATIONAL_KEYWORDS: frozenset[str] = frozenset([
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

PROTECTED_SECTION_TERMS: frozenset[str] = frozenset([
    "unit", "chapter", "section", "part", "module", "lecture",
    "contents", "index", "table of contents", "syllabus", "overview"
])

PAGE_NUM_TERMS: frozenset[str] = frozenset([
    "page", "pg", "p", "p a ge", "page no", "pg no"
])


def _get_noise_threshold(total_pages: int) -> int:
    """Adaptive threshold for running header/footer frequency.

    Small documents (<=5 pages): 2 occurrences
    Medium documents (<=15 pages): 3 occurrences
    Large documents (>15 pages): 8% of pages, clamped between 3 and 8.
    """
    if total_pages <= 5:
        return 2
    if total_pages <= 15:
        return 3
    return max(3, min(8, int(total_pages * 0.08)))


def _extract_pages_with_positions(filepath: str) -> list[dict]:
    """
    Extract text and position data from each PDF page.

    Uses high-speed native C++ extraction via pypdfium2 (Chromium engine) for sub-second
    processing of text PDFs, with automatic per-page OCR fallback when a page contains
    no extractable text (e.g. scanned image pages). Falls back to pdfplumber if pypdfium2
    is unavailable.

    Returns a list of dicts, one per page:
        {
            "text": str,              # raw page text
            "top_lines": list[str],   # first 3 non-empty lines (running header zone)
            "bottom_lines": list[str] # last 3 non-empty lines (running footer zone)
        }
    """
    pages = []
    
    # Strategy 1: High-performance pypdfium2 extraction
    if pdfium is not None:
        pdf = None
        try:
            pdf = pdfium.PdfDocument(filepath)
            total_pages = len(pdf)
            for idx in range(total_pages):
                page = pdf[idx]
                textpage = page.get_textpage()
                page_text = textpage.get_text_range() or ""

                # Page-level OCR fallback if page has negligible native text (e.g. scanned page)
                if len(page_text.strip()) < 30:
                    try:
                        import pytesseract
                        pil_img = page.render(scale=2.0).to_pil()
                        ocr_result = pytesseract.image_to_string(pil_img)
                        if len(ocr_result.strip()) > len(page_text.strip()):
                            page_text = ocr_result
                            logger.info("[PDFExtractor] Applied OCR fallback for scanned page %d/%d", idx + 1, total_pages)
                    except Exception as ocr_err:
                        logger.debug("[PDFExtractor] OCR fallback skipped for page %d: %s", idx + 1, ocr_err)

                lines = [l.strip() for l in page_text.splitlines() if l.strip()]
                top_lines = lines[:3] if len(lines) >= 1 else []
                bottom_lines = lines[-3:] if len(lines) >= 4 else []
                pages.append({
                    "text": page_text,
                    "top_lines": top_lines,
                    "bottom_lines": bottom_lines,
                })
            return pages
        except Exception as p_err:
            logger.warning("[PDFExtractor] pypdfium2 extraction encountered error (%s); falling back to pdfplumber", p_err)
            pages.clear()
        finally:
            if pdf is not None:
                try:
                    pdf.close()
                except Exception:
                    pass

    # Strategy 2: Fallback to pdfplumber
    try:
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                lines = [l.strip() for l in text.splitlines() if l.strip()]
                top_lines = lines[:3] if len(lines) >= 1 else []
                bottom_lines = lines[-3:] if len(lines) >= 4 else []
                pages.append({
                    "text": text,
                    "top_lines": top_lines,
                    "bottom_lines": bottom_lines,
                })
    except Exception as e:
        raise RuntimeError(f"Failed to open or parse PDF '{filepath}': {e}")

    return pages


# ---------------------------------------------------------------------------
# Stage 2 — Generic running header/footer detection
# ---------------------------------------------------------------------------

def _detect_running_noise(pages: list[dict]) -> frozenset[str]:
    """
    Identify lines that are almost certainly running headers or footers.

    Uses TWO detection strategies:
    1. Exact match: identical normalized line in header/footer zone across >= threshold pages.
    2. Core match: number-stripped line (e.g. 'operating system' from 'Operating System 1',
       'dept of cse' from 'DEPT OF CSE 1') across >= threshold pages.

    Returns a frozenset of noise strings (both exact lines and core patterns).
    """
    total_pages = len(pages)
    if total_pages <= 1:
        return frozenset()

    threshold = _get_noise_threshold(total_pages)

    top_exact: Counter = Counter()
    bot_exact: Counter = Counter()
    top_core: Counter = Counter()
    bot_core: Counter = Counter()

    for page in pages:
        seen_te, seen_tc = set(), set()
        for l in page["top_lines"]:
            if _is_page_number_line(l):
                continue
            norm = _normalize_line(l)
            core = re.sub(r"\b\d{1,4}\b", "", norm).strip(" -|–:./")
            if norm and norm not in seen_te and len(norm.split()) <= NOISE_MAX_WORDS:
                top_exact[norm] += 1
                seen_te.add(norm)
            if (
                core
                and core not in seen_tc
                and core not in PROTECTED_SECTION_TERMS
                and core not in PAGE_NUM_TERMS
                and len(core.split()) <= NOISE_MAX_WORDS
            ):
                top_core[core] += 1
                seen_tc.add(core)

        seen_be, seen_bc = set(), set()
        for l in page["bottom_lines"]:
            if _is_page_number_line(l):
                continue
            norm = _normalize_line(l)
            core = re.sub(r"\b\d{1,4}\b", "", norm).strip(" -|–:./")
            if norm and norm not in seen_be and len(norm.split()) <= NOISE_MAX_WORDS:
                bot_exact[norm] += 1
                seen_be.add(norm)
            if (
                core
                and core not in seen_bc
                and core not in PROTECTED_SECTION_TERMS
                and core not in PAGE_NUM_TERMS
                and len(core.split()) <= NOISE_MAX_WORDS
            ):
                bot_core[core] += 1
                seen_bc.add(core)

    noise_exact = {
        k for k, v in (top_exact + bot_exact).items()
        if v >= threshold and k not in PROTECTED_SECTION_TERMS and k not in PAGE_NUM_TERMS
    }
    noise_core = {
        k for k, v in (top_core + bot_core).items()
        if v >= threshold and k not in PROTECTED_SECTION_TERMS and k not in PAGE_NUM_TERMS
    }

    combined_noise = noise_exact | noise_core

    if combined_noise:
        logger.info(
            "[PDFExtractor] Detected noise: %d patterns (threshold=%d/%d pages): %s",
            len(combined_noise),
            threshold,
            total_pages,
            list(combined_noise)[:5],
        )

    return frozenset(combined_noise)


# ---------------------------------------------------------------------------
# Stage 2b — Table-of-Contents page detection
# ---------------------------------------------------------------------------

def _is_toc_page(page_text: str) -> bool:
    """Detect if a page is primarily a Table of Contents.

    A page is considered TOC if >= 60% of its non-empty lines match the
    TOC pattern (text followed by page numbers) and the page has >= 5 such lines.
    """
    lines = [l.strip() for l in page_text.splitlines() if l.strip()]
    if len(lines) < 4:
        return False

    toc_count = sum(1 for l in lines if _TOC_LINE_RE.match(l))
    # Also count lines that are pure "TOPIC" or "S.NO" style headers
    header_words = {"index", "contents", "table of contents", "s.no", "chapter",
                    "unit no", "topic", "page no", "sl.no", "sr.no"}
    header_count = sum(
        1 for l in lines
        if l.strip().lower() in header_words or
        re.match(r"^(?:s\.?no|sr\.?no|sl\.?no|unit\s*no|topic|page\s*no|chapter\s*name)\b", l.strip(), re.IGNORECASE)
    )

    toc_like = toc_count + header_count
    ratio = toc_like / len(lines) if lines else 0

    if ratio >= 0.5 and toc_count >= 3:
        logger.debug("[PDFExtractor] Detected TOC page (%.0f%% TOC lines, %d matches)", ratio * 100, toc_count)
        return True
    return False


# ---------------------------------------------------------------------------
# Stage 3–4 — Strip noise and normalize per-page
# ---------------------------------------------------------------------------

def _clean_page_text(
    page_text: str,
    noise_set: frozenset[str],
) -> str:
    """
    Apply noise removal, page-number stripping, and unicode normalization
    to a single page's text.

    Args:
        page_text: Raw extracted text for one page.
        noise_set: Normalized strings identified as running noise (exact and core).

    Returns:
        Cleaned text for this page.
    """
    lines = page_text.splitlines()
    cleaned: list[str] = []

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        # Remove page-number artifacts
        if _is_page_number_line(line):
            logger.debug("[PDFExtractor] Removed page number line: %r", line)
            continue

        # Strip trailing page-number patterns attached to line ends
        if _TRAILING_PAGENUM_RE.search(line):
            line = _TRAILING_PAGENUM_RE.sub("", line).strip()
            if not line:
                continue

        # Remove lines matching detected running noise (exact match)
        norm = _normalize_line(line)
        if norm in noise_set:
            logger.debug("[PDFExtractor] Removed noise line (exact): %r", line)
            continue

        # Remove lines matching core noise (number-stripped)
        core = re.sub(r"\b\d{1,4}\b", "", norm).strip(" -|–:./")
        if core in noise_set and core not in PROTECTED_SECTION_TERMS and core not in PAGE_NUM_TERMS:
            logger.debug("[PDFExtractor] Removed noise line (core): %r", line)
            continue

        # Strip running noise phrases appended or prepended to content lines
        # (guarded: educational keywords like 'operating system' are NEVER stripped as partial substrings)
        for noise_phrase in noise_set:
            if (
                len(noise_phrase) >= 4
                and noise_phrase not in PROTECTED_SECTION_TERMS
                and noise_phrase not in PAGE_NUM_TERMS
                and not any(w in _EDUCATIONAL_KEYWORDS for w in noise_phrase.split())
            ):
                if norm.endswith(" " + noise_phrase):
                    line = line[:-len(noise_phrase)].rstrip(" -|–:./")
                    norm = _normalize_line(line)
                elif norm.startswith(noise_phrase + " "):
                    line = line[len(noise_phrase):].lstrip(" -|–:./")
                    norm = _normalize_line(line)

        # Apply unicode/bullet normalization
        line = _normalize_bullet(line)
        line = _INVISIBLE_CHARS_RE.sub(" ", line)
        line = _PRIVATE_USE_RE.sub("", line)
        line = _CID_ARTIFACT_RE.sub("", line)
        line = _MULTI_SPACE_RE.sub(" ", line).strip()

        # Remove orphaned single characters (artifacts from header splitting)
        # e.g. the "C" left over from "COLLEGELYTECHNI C" after header removal
        if len(line) <= 1 and not line.isdigit():
            logger.debug("[PDFExtractor] Removed orphaned char: %r", line)
            continue

        if line:
            cleaned.append(line)

    return "\n".join(cleaned)


# ---------------------------------------------------------------------------
# Stage 5 — Paragraph reconstruction
# ---------------------------------------------------------------------------

def _reconstruct_paragraphs(text: str) -> str:
    """
    Merge PDF visual line-breaks back into natural sentences.

    PDF "lines" are visual rendering units, not semantic sentence ends.
    Example:
        "The operating system manages\n"
        "the resources of a computer\n"
        "system."
    → "The operating system manages the resources of a computer system."

    Rules (applied in order):
        1. Blank line → definite paragraph break (preserved)
        2. Line ending with hyphen → dehyphenate and join to next line
        3. Line ending with sentence terminal (. ! ? : ;) → keep break
        4. Next line starts with a bullet marker → keep break
        5. Next line matches a heading pattern → keep break
        6. Next line starts with a digit+dot (numbered list) → keep break
        7. Otherwise → join to next line with a space

    Mathematical and code lines are preserved because they typically
    end with symbols, numbers, or operators that prevent merging.
    """
    lines = text.splitlines()
    output: list[str] = []
    i = 0

    while i < len(lines):
        current = lines[i].strip()

        if not current:
            # Blank line → paragraph boundary
            if output and output[-1] != "":
                output.append("")
            i += 1
            continue

        # Look ahead for the next non-empty line
        j = i + 1
        while j < len(lines) and not lines[j].strip():
            j += 1

        next_line = lines[j].strip() if j < len(lines) else None

        if next_line is None:
            # Last line — just append
            output.append(current)
            i += 1
            continue

        # Rule 1: Dehyphenation — "computa-\ntion" → "computation"
        if _TRAILING_HYPHEN_RE.search(current):
            merged = _TRAILING_HYPHEN_RE.sub("", current) + next_line
            output.append(merged)
            i = j + 1
            continue

        # Rule 2: Sentence terminal → keep break
        if current[-1] in ".!?:;":
            output.append(current)
            i += 1
            continue

        # Rule 3: Next line is a bullet → keep break
        if next_line.startswith("- ") or next_line.startswith("* "):
            output.append(current)
            i += 1
            continue

        # Rule 4: Next line is a heading (ALL CAPS or numbered section)
        if _HEADING_RE.match(next_line) or _NUMBERED_SECTION_RE.match(next_line):
            output.append(current)
            i += 1
            continue

        # Rule 5: Next line starts a numbered list item "1. " / "a) "
        if re.match(r"^\s*(?:\d+[.)]\s|[a-z][.)]\s)", next_line):
            output.append(current)
            i += 1
            continue

        # Rule 6: Current line is a heading — keep break
        if _HEADING_RE.match(current) or _NUMBERED_SECTION_RE.match(current):
            output.append(current)
            i += 1
            continue

        # Default: join to next line (visual PDF wrap)
        # Skip blank lines between them that we already accounted for
        lines[j] = current + " " + next_line
        i += 1
        continue

    result = "\n".join(output)
    # Collapse 3+ consecutive newlines → double newline
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_text_from_pdf(filepath: str) -> str:
    """
    Extract all text from a PDF and run the full deterministic cleaning pipeline.

    The pipeline is entirely generic — it contains no hardcoded college names,
    course names, or document-specific patterns.

    Stages:
        1. Position-aware page extraction
        2. Running header/footer detection (statistical + position + prefix)
        3. Table-of-Contents page detection and removal
        4. Page-number artifact removal (regex)
        5. Unicode / bullet normalization
        6. Paragraph reconstruction

    Args:
        filepath: Path to a PDF file.

    Returns:
        Clean, reconstructed text ready for chunking.

    Raises:
        ValueError: PDF has no extractable text layer (scanned image).
        RuntimeError: PDF is corrupted or cannot be opened.
    """
    logger.info("[PDFExtractor] Starting extraction: %s", os.path.basename(filepath))

    pages = _extract_pages_with_positions(filepath)
    if not pages:
        raise ValueError(
            f"No pages found in '{filepath}'."
        )

    # Stage 2: detect running noise using position + frequency + core patterns
    noise_set = _detect_running_noise(pages)

    # Stages 3–4: clean each page
    cleaned_pages: list[str] = []
    for idx, page in enumerate(pages):
        # Stage 2b: skip TOC pages entirely
        if _is_toc_page(page["text"]):
            logger.info("[PDFExtractor] Skipping TOC page %d.", idx + 1)
            continue

        page_clean = _clean_page_text(page["text"], noise_set)
        if page_clean.strip():
            cleaned_pages.append(page_clean)
        else:
            logger.debug("[PDFExtractor] Page %d produced no content after cleaning.", idx + 1)

    if not cleaned_pages:
        raise ValueError(
            f"No extractable text found in '{filepath}'. "
            "The PDF may contain scanned images without an OCR text layer."
        )

    raw_join = "\n\n".join(cleaned_pages)

    # Stage 4 (global pass): unicode normalization
    normalized = _normalize_unicode(raw_join)

    # Stage 5: paragraph reconstruction
    reconstructed = _reconstruct_paragraphs(normalized)

    logger.info(
        "[PDFExtractor] Extraction complete: %d pages, %d chars raw → %d chars after cleaning",
        len(pages),
        sum(len(p["text"]) for p in pages),
        len(reconstructed),
    )

    return reconstructed


def _split_sentences(text: str) -> list[str]:
    """
    Split text into sentences using regex-based heuristics.

    Handles common abbreviations and decimal numbers to avoid
    false sentence boundaries.

    Args:
        text: Input text to split.

    Returns:
        List of sentence strings.
    """
    # Protect common abbreviations
    protected = text
    abbreviations = [
        "Dr.", "Mr.", "Mrs.", "Ms.", "Prof.", "Jr.", "Sr.",
        "Inc.", "Ltd.", "Corp.", "vs.", "etc.", "i.e.", "e.g.",
        "Fig.", "Eq.", "No.", "Vol.", "Ch.", "Sec.", "Dept.",
        "approx.", "est.", "ref.", "ibid.",
    ]
    for abbr in abbreviations:
        protected = protected.replace(abbr, abbr.replace(".", "<DOT>"))

    # Split on sentence-ending punctuation followed by whitespace and uppercase
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", protected)

    # Restore abbreviations
    sentences = [s.replace("<DOT>", ".").strip() for s in parts]
    return [s for s in sentences if s]


def chunk_text(text: str, sentences_per_chunk: Optional[int] = None) -> list[str]:
    """
    Split text into overlapping chunks of N sentences each.

    Groups consecutive sentences into chunks for embedding. Short chunks
    (below MIN_CHUNK_WORDS) are filtered out as they typically contain
    remaining headers, page numbers, or other non-content text.

    Args:
        text: Full extracted text to chunk.
        sentences_per_chunk: Number of sentences per chunk. Defaults to
            config.SENTENCES_PER_CHUNK.

    Returns:
        List of text chunks, each containing multiple sentences.
    """
    if sentences_per_chunk is None:
        sentences_per_chunk = SENTENCES_PER_CHUNK

    sentences = _split_sentences(text)
    if not sentences:
        return []

    chunks: list[str] = []
    max_chunk_words = 220  # Safeguards token length to stay strictly within 384 max_seq_length

    for i in range(0, len(sentences), sentences_per_chunk):
        chunk_sentences = sentences[i : i + sentences_per_chunk]
        full_chunk = " ".join(chunk_sentences)
        words = full_chunk.split()

        if len(words) <= max_chunk_words:
            if len(words) >= MIN_CHUNK_WORDS:
                chunks.append(full_chunk)
        else:
            # Sub-divide oversized chunk so tokens never exceed model max_seq_length (384)
            cur_words = []
            for s in chunk_sentences:
                s_words = s.split()
                if len(s_words) > max_chunk_words:
                    sub_parts = s.split("\n")
                    for sp in sub_parts:
                        sp_words = sp.split()
                        if not sp_words:
                            continue
                        if len(cur_words) + len(sp_words) > max_chunk_words and len(cur_words) >= MIN_CHUNK_WORDS:
                            chunks.append(" ".join(cur_words))
                            cur_words = list(sp_words)
                        else:
                            cur_words.extend(sp_words)
                elif len(cur_words) + len(s_words) > max_chunk_words and len(cur_words) >= MIN_CHUNK_WORDS:
                    chunks.append(" ".join(cur_words))
                    cur_words = list(s_words)
                else:
                    cur_words.extend(s_words)
            if len(cur_words) >= MIN_CHUNK_WORDS:
                chunks.append(" ".join(cur_words))
            elif cur_words and chunks:
                chunks[-1] = chunks[-1] + " " + " ".join(cur_words)
            elif cur_words:
                chunks.append(" ".join(cur_words))

    logger.debug(
        "[PDFExtractor] Chunked %d sentences → %d chunks (min_words=%d)",
        len(sentences),
        len(chunks),
        MIN_CHUNK_WORDS,
    )
    return chunks
