"""
PDF Text Extraction and Chunking Module.

Extracts raw text from PDF files using pdfplumber and splits the text
into semantically meaningful chunks of configurable sentence length.
Chunking is a critical preprocessing step: chunks that are too small
lose context, while chunks that are too large dilute the semantic signal
for embedding-based comparison.
"""

import re

import pdfplumber

from config import SENTENCES_PER_CHUNK, MIN_CHUNK_WORDS


def extract_text_from_pdf(filepath: str) -> str:
    """Extract all text content from a PDF file.

    Uses pdfplumber for text-layer extraction. Handles corrupted files
    and scanned-image PDFs (which yield no extractable text) gracefully.

    Args:
        filepath: Absolute or relative path to the PDF file.

    Returns:
        Concatenated text from all pages.

    Raises:
        ValueError: If the PDF contains no extractable text (e.g., scanned images).
        RuntimeError: If the PDF file is corrupted or cannot be opened.
    """
    try:
        with pdfplumber.open(filepath) as pdf:
            pages_text = []
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages_text.append(text)
            full_text = "\n".join(pages_text)
    except Exception as e:
        raise RuntimeError(f"Failed to open or parse PDF '{filepath}': {e}")

    if not full_text.strip():
        raise ValueError(
            f"No extractable text found in '{filepath}'. "
            "The PDF may contain scanned images without an OCR text layer."
        )

    return full_text


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences using regex-based heuristics.

    Handles common abbreviations (e.g., Dr., Mr., etc.) and decimal numbers
    to avoid false sentence boundaries.

    Args:
        text: Input text to split.

    Returns:
        List of sentence strings.
    """
    # Replace common abbreviations to avoid false splits
    protected = text
    abbreviations = [
        "Dr.", "Mr.", "Mrs.", "Ms.", "Prof.", "Jr.", "Sr.",
        "Inc.", "Ltd.", "Corp.", "vs.", "etc.", "i.e.", "e.g.",
        "Fig.", "Eq.", "No.", "Vol.", "Ch.", "Sec.",
    ]
    for abbr in abbreviations:
        protected = protected.replace(abbr, abbr.replace(".", "<DOT>"))

    # Split on sentence-ending punctuation followed by whitespace and uppercase
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', protected)

    # Restore abbreviations
    sentences = [s.replace("<DOT>", ".").strip() for s in parts]
    return [s for s in sentences if s]


def chunk_text(text: str, sentences_per_chunk: int = None) -> list[str]:
    """Split text into chunks of N sentences each.

    Groups consecutive sentences into chunks for embedding. Short chunks
    (below MIN_CHUNK_WORDS) are filtered out as they typically contain
    headers, page numbers, or other non-content text.

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

    chunks = []
    for i in range(0, len(sentences), sentences_per_chunk):
        chunk = " ".join(sentences[i:i + sentences_per_chunk])
        word_count = len(chunk.split())
        if word_count >= MIN_CHUNK_WORDS:
            chunks.append(chunk)

    return chunks
