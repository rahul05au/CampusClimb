"""
Syllabus Parser — Extracts structured topics from syllabus files.

Parses a plain-text or PDF syllabus into a list of (unit, topic) pairs.
Expected input format (plain text):

    UNIT 1: Introduction to Operating Systems
    - Process Management
    - CPU Scheduling
    UNIT 2: Memory Management
    - Paging
    - Segmentation

Each unit heading starts with 'UNIT' (case-insensitive) followed by a number
and colon-separated name. Topics are listed as dash-prefixed lines under
their unit.
"""

import re

from core.pdf_extractor import extract_text_from_pdf


def parse_syllabus(filepath: str) -> list[dict]:
    """Parse a syllabus file into structured unit-topic records.

    Supports both .txt and .pdf file formats. PDF files are first converted
    to text using pdfplumber, then parsed with the same logic.

    Args:
        filepath: Path to the syllabus file (.txt or .pdf).

    Returns:
        List of dicts, each with keys:
            - unit_number (int)
            - unit_name (str)
            - topic_name (str)

    Raises:
        ValueError: If no valid units or topics are found in the file.
    """
    if filepath.lower().endswith(".pdf"):
        text = extract_text_from_pdf(filepath)
    else:
        with open(filepath, "r", encoding="utf-8") as f:
            text = f.read()

    return _parse_syllabus_text(text)


def _parse_syllabus_text(text: str) -> list[dict]:
    """Parse syllabus text content into structured records.

    Args:
        text: Raw syllabus text.

    Returns:
        List of unit-topic dicts.

    Raises:
        ValueError: If no valid units or topics are found.
    """
    lines = text.strip().splitlines()
    results = []
    current_unit_number = None
    current_unit_name = None

    # Pattern: UNIT 1: Name  or  Unit 1 - Name  or  UNIT I: Name
    unit_pattern = re.compile(
        r'^\s*UNIT\s+(\d+|[IVXLC]+)\s*[:\-–—]\s*(.+)',
        re.IGNORECASE
    )

    for line in lines:
        line = line.strip()
        if not line:
            continue

        unit_match = unit_pattern.match(line)
        if unit_match:
            raw_number = unit_match.group(1)
            # Handle Roman numerals
            try:
                current_unit_number = int(raw_number)
            except ValueError:
                current_unit_number = _roman_to_int(raw_number.upper())
            current_unit_name = unit_match.group(2).strip()
            continue

        # Topic line: starts with - or * or •
        topic_match = re.match(r'^\s*[-*•]\s*(.+)', line)
        if topic_match and current_unit_number is not None:
            topic_name = topic_match.group(1).strip()
            if topic_name:
                results.append({
                    "unit_number": current_unit_number,
                    "unit_name": current_unit_name,
                    "topic_name": topic_name,
                })

    if not results:
        raise ValueError(
            "No valid units or topics found in syllabus. "
            "Expected format: 'UNIT N: Name' followed by '- Topic' lines."
        )

    return results


def _roman_to_int(s: str) -> int:
    """Convert a Roman numeral string to an integer.

    Args:
        s: Roman numeral (e.g., 'IV', 'XII').

    Returns:
        Integer value.
    """
    roman_values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}
    total = 0
    prev = 0
    for char in reversed(s):
        value = roman_values.get(char, 0)
        if value < prev:
            total -= value
        else:
            total += value
        prev = value
    return total
