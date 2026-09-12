"""
Embedding Service — Thread-safe Singleton loader and bounded LRU cache for sentence-transformers model.

Uses the fine-tuned CAPT-M / all-MiniLM model to generate dense vector
representations of text. The model is loaded once process-wide and reused across all
requests with thread-safety and bounded LRU embedding caching to eliminate redundant inference.

Methodology: Sentence embeddings capture semantic meaning of text passages,
enabling cosine-similarity-based comparison for topic mapping and
deduplication tasks.
"""

from collections import OrderedDict
import hashlib
import logging
import os
import re
import threading
from typing import Optional

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine
import torch

from config import MODEL_NAME

logger = logging.getLogger(__name__)

_MODEL: Optional[SentenceTransformer] = None
_MODEL_LOCK = threading.Lock()
_EMBED_LOCK = threading.Lock()

_NORMALIZE_WS_RE = re.compile(r"\s+")


class LRUEmbeddingCache:
    """Thread-safe, bounded in-memory LRU cache for deterministic text embeddings.

    Prevents memory exhaustion by evicting oldest entries when max_size is reached.
    Keys are prefixed by model version to strictly prevent cross-model cache pollution.
    """

    def __init__(self, max_size: int = 20000):
        self.max_size = max_size
        self._cache: OrderedDict[str, list[float]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[list[float]]:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
            return None

    def put(self, key: str, embedding: list[float]) -> None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            else:
                if len(self._cache) >= self.max_size:
                    self._cache.popitem(last=False)
                self._cache[key] = embedding

    def size(self) -> int:
        with self._lock:
            return len(self._cache)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


_EMBEDDING_CACHE = LRUEmbeddingCache(max_size=20000)


def _configure_cpu_threads() -> None:
    """Configure PyTorch CPU thread count to avoid oversubscription while maximizing throughput."""
    try:
        cpu_count = os.cpu_count() or 8
        optimal_threads = min(14, max(4, cpu_count - 2))
        torch.set_num_threads(optimal_threads)
        logger.info("[Embeddings] Configured PyTorch CPU threads: %d (system logical cores: %d)", optimal_threads, cpu_count)
    except Exception as e:
        logger.debug("[Embeddings] CPU thread configuration notice: %s", e)


def _get_model() -> SentenceTransformer:
    """Load the sentence-transformers model (thread-safe singleton pattern).

    Returns the cached model instance, loading it only on the first call.
    Reused across all uploads and queries to eliminate multi-second initialization penalties.
    """
    global _MODEL
    if _MODEL is None:
        with _MODEL_LOCK:
            if _MODEL is None:
                _configure_cpu_threads()
                device = "cuda" if torch.cuda.is_available() else "cpu"
                logger.info("[Embeddings] Initializing SentenceTransformer '%s' on %s", MODEL_NAME, device)
                model = SentenceTransformer(MODEL_NAME, device=device)
                model.eval()
                _MODEL = model
    return _MODEL


# Alias for compatibility
get_model = _get_model


def _normalize_text_for_embedding(text: str) -> str:
    """Deterministic normalization before embedding and cache key derivation."""
    if not text:
        return ""
    cleaned = text.strip()
    return _NORMALIZE_WS_RE.sub(" ", cleaned)


def _derive_cache_key(normalized_text: str) -> str:
    """Derive a deterministic cache key binding model version and normalized chunk SHA-256."""
    chunk_hash = hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()
    return f"{MODEL_NAME}:{chunk_hash}"


def get_embedding(text: str) -> list[float]:
    """Generate a dense vector embedding for a single text string.

    Uses bounded LRU cache if available.

    Args:
        text: Input text to encode.

    Returns:
        A list of floats representing the embedding vector.
    """
    normalized = _normalize_text_for_embedding(text)
    if not normalized:
        return []

    cache_key = _derive_cache_key(normalized)
    cached = _EMBEDDING_CACHE.get(cache_key)
    if cached is not None:
        return cached

    embeddings = batch_embed([text], batch_size=1)
    return embeddings[0] if embeddings else []


def batch_embed(texts: list[str], batch_size: int = 64) -> list[list[float]]:
    """Generate embeddings for a batch of texts with exact deduplication and LRU caching.

    Pipeline:
    1. Deterministic text normalization
    2. Exact-string deduplication within batch
    3. Query bounded LRU cache for already-known vectors
    4. Batch encode only uncached unique texts via SentenceTransformer
    5. Save new vectors to LRU cache
    6. Reconstruct complete list of embeddings in original input order

    Args:
        texts: List of input texts to encode.
        batch_size: Batch size for model.encode. Defaults to 64.

    Returns:
        A list of embedding vectors (each a list of floats) matching input indices.
    """
    if not texts:
        return []

    # 1. Normalize and identify unique texts
    normalized_texts = [_normalize_text_for_embedding(t) for t in texts]
    unique_norm_texts = []
    norm_to_idx = {}
    indices = []

    for norm_t in normalized_texts:
        if norm_t not in norm_to_idx:
            norm_to_idx[norm_t] = len(unique_norm_texts)
            unique_norm_texts.append(norm_t)
        indices.append(norm_to_idx[norm_t])

    # 2. Check LRU cache for each unique normalized text
    unique_embeddings: list[Optional[list[float]]] = [None] * len(unique_norm_texts)
    uncached_texts = []
    uncached_unique_indices = []

    for u_idx, u_text in enumerate(unique_norm_texts):
        if not u_text:
            # Empty text vector (zeros)
            model = _get_model()
            dim = model.get_sentence_embedding_dimension() or 768
            unique_embeddings[u_idx] = [0.0] * dim
            continue

        cache_key = _derive_cache_key(u_text)
        cached_vec = _EMBEDDING_CACHE.get(cache_key)
        if cached_vec is not None:
            unique_embeddings[u_idx] = cached_vec
        else:
            uncached_texts.append(u_text)
            uncached_unique_indices.append(u_idx)

    # 3. If there are uncached texts, run model inference with bounded concurrency
    if uncached_texts:
        model = _get_model()
        with _EMBED_LOCK:
            with torch.inference_mode():
                computed = model.encode(
                    uncached_texts,
                    batch_size=batch_size,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                )

        # Store computed embeddings in cache and unique_embeddings
        for c_idx, u_idx in enumerate(uncached_unique_indices):
            vec = computed[c_idx].tolist()
            unique_embeddings[u_idx] = vec
            cache_key = _derive_cache_key(unique_norm_texts[u_idx])
            _EMBEDDING_CACHE.put(cache_key, vec)

    # 4. Map back to original input order
    return [unique_embeddings[idx] for idx in indices]


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
    if not vec1 or not vec2:
        return 0.0
    a = np.array(vec1).reshape(1, -1)
    b = np.array(vec2).reshape(1, -1)
    return float(sklearn_cosine(a, b)[0][0])
