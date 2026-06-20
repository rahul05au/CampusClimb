"""
Embedding Service — Singleton loader for sentence-transformers model.

Uses the all-MiniLM-L6-v2 model to generate 384-dimensional dense vector
representations of text. The model is loaded once and reused across all
requests to avoid redundant memory allocation and loading time.

Methodology: Sentence embeddings capture semantic meaning of text passages,
enabling cosine-similarity-based comparison for topic mapping and
deduplication tasks.
"""

from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine
import numpy as np

from config import MODEL_NAME

_model = None


def _get_model() -> SentenceTransformer:
    """Load the sentence-transformers model (singleton pattern).

    Returns the cached model instance, loading it only on the first call.
    This avoids reloading the ~80MB model on every embedding request.
    """
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def get_embedding(text: str) -> list[float]:
    """Generate a dense vector embedding for a single text string.

    Args:
        text: Input text to encode.

    Returns:
        A list of floats representing the 384-dimensional embedding vector.
    """
    model = _get_model()
    embedding = model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def batch_embed(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts efficiently.

    Batch encoding is significantly faster than encoding texts one at a time
    because it leverages GPU/CPU parallelism within the transformer model.

    Args:
        texts: List of input texts to encode.

    Returns:
        A list of embedding vectors (each a list of floats).
    """
    model = _get_model()
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return embeddings.tolist()


def cosine_sim(vec1: list[float], vec2: list[float]) -> float:
    """Compute cosine similarity between two embedding vectors.

    Cosine similarity measures the cosine of the angle between two vectors,
    yielding a value in [-1, 1] where 1 indicates identical direction
    (maximum semantic similarity) and 0 indicates orthogonality.

    Args:
        vec1: First embedding vector.
        vec2: Second embedding vector.

    Returns:
        Cosine similarity score as a float.
    """
    a = np.array(vec1).reshape(1, -1)
    b = np.array(vec2).reshape(1, -1)
    return float(sklearn_cosine(a, b)[0][0])
