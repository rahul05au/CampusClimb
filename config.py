"""
CampusClimb — Global Configuration

Tunable parameters for NLP processing, chunking, and importance scoring.
Adjust these values for experimentation (paper's Results section).
"""

# Sentence-Transformers model
MODEL_NAME = "all-MiniLM-L6-v2"

# Text chunking
SENTENCES_PER_CHUNK = 4
MIN_CHUNK_WORDS = 20

# Semantic deduplication
DEDUP_SIMILARITY_THRESHOLD = 0.85

# Topic importance scoring thresholds
IMPORTANCE_LOW_THRESHOLD = 0.05
IMPORTANCE_HIGH_THRESHOLD = 0.15
