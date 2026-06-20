"""
Topic Mapper — Maps text chunks to syllabus topics via semantic similarity.

For each note chunk or PYQ question, computes cosine similarity against all
syllabus topic embeddings and assigns the chunk to the most semantically
similar topic. This is the core alignment mechanism that organizes
unstructured notes into syllabus-defined categories.
"""

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity


def map_chunk_to_topic(
    chunk_embedding: list[float],
    topic_embeddings: list[tuple[int, list[float]]],
) -> tuple[int, float]:
    """Map a single chunk to the most similar syllabus topic.

    Computes cosine similarity between the chunk embedding and every topic
    embedding, returning the topic with the highest similarity score.

    Args:
        chunk_embedding: Embedding vector of the text chunk.
        topic_embeddings: List of (topic_id, embedding_vector) tuples
            for all syllabus topics.

    Returns:
        Tuple of (best_topic_id, similarity_score).
    """
    chunk_vec = np.array(chunk_embedding).reshape(1, -1)
    topic_ids = [t[0] for t in topic_embeddings]
    topic_vecs = np.array([t[1] for t in topic_embeddings])

    similarities = cosine_similarity(chunk_vec, topic_vecs)[0]
    best_idx = int(np.argmax(similarities))

    return topic_ids[best_idx], float(similarities[best_idx])


def map_chunks_batch(
    chunk_embeddings: list[list[float]],
    topic_embeddings: list[tuple[int, list[float]]],
) -> list[tuple[int, float]]:
    """Map a batch of chunks to their most similar syllabus topics.

    Vectorized batch computation is more efficient than calling
    map_chunk_to_topic in a loop, as it leverages matrix multiplication
    for the entire similarity computation at once.

    Args:
        chunk_embeddings: List of chunk embedding vectors.
        topic_embeddings: List of (topic_id, embedding_vector) tuples.

    Returns:
        List of (best_topic_id, similarity_score) tuples, one per chunk.
    """
    chunk_vecs = np.array(chunk_embeddings)
    topic_ids = [t[0] for t in topic_embeddings]
    topic_vecs = np.array([t[1] for t in topic_embeddings])

    # Shape: (num_chunks, num_topics)
    sim_matrix = cosine_similarity(chunk_vecs, topic_vecs)

    results = []
    for i in range(len(chunk_embeddings)):
        best_idx = int(np.argmax(sim_matrix[i]))
        results.append((topic_ids[best_idx], float(sim_matrix[i][best_idx])))

    return results
