"""
Semantic Deduplication Module — Clusters similar note chunks using Union-Find.

When multiple students write notes on the same topic, significant content
overlap is expected. This module identifies semantically duplicate chunks
within each topic group using cosine similarity and clusters them using a
Union-Find (disjoint set) data structure. For each cluster, the longest
chunk is selected as the representative (it typically contains the most
detail and context).

Algorithm:
    1. Group chunks by matched_topic_id (only compare within same topic)
    2. For each topic group, compute pairwise cosine similarity
    3. If similarity > threshold, union the two chunks
    4. Extract connected components as dedup clusters
    5. Mark the longest chunk in each cluster as representative
"""

from collections import defaultdict

from core.embeddings import cosine_sim
from config import DEDUP_SIMILARITY_THRESHOLD


class _UnionFind:
    """Disjoint Set Union (Union-Find) data structure.

    Supports efficient union and find operations with path compression
    and union by rank for near-constant amortized time complexity.
    """

    def __init__(self):
        self.parent = {}
        self.rank = {}

    def find(self, x):
        """Find the root representative of the set containing x."""
        if x not in self.parent:
            self.parent[x] = x
            self.rank[x] = 0
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])  # Path compression
        return self.parent[x]

    def union(self, x, y):
        """Merge the sets containing x and y."""
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return
        # Union by rank
        if self.rank[rx] < self.rank[ry]:
            rx, ry = ry, rx
        self.parent[ry] = rx
        if self.rank[rx] == self.rank[ry]:
            self.rank[rx] += 1


def deduplicate_chunks(
    chunks: list[dict],
    threshold: float = None,
) -> list[dict]:
    """Cluster semantically similar chunks and select representatives.

    Only compares chunks within the same matched_topic_id to reduce
    computation and ensure meaningful comparisons. Chunks about different
    topics are unlikely to be true duplicates even if superficially similar.

    Args:
        chunks: List of dicts with keys:
            - id: Chunk database ID
            - chunk_text: The text content
            - embedding: The embedding vector (list of floats)
            - matched_topic_id: The assigned topic ID
        threshold: Cosine similarity threshold above which two chunks
            are considered duplicates. Defaults to config value (0.85).

    Returns:
        Updated list of chunk dicts with added keys:
            - cluster_id: Integer identifying the dedup cluster
            - is_representative: True if this chunk represents its cluster
    """
    if threshold is None:
        threshold = DEDUP_SIMILARITY_THRESHOLD

    # Group chunks by topic
    topic_groups = defaultdict(list)
    for chunk in chunks:
        topic_id = chunk.get("matched_topic_id")
        if topic_id is not None:
            topic_groups[topic_id].append(chunk)

    uf = _UnionFind()
    # Initialize all chunk IDs in union-find
    for chunk in chunks:
        uf.find(chunk["id"])

    # Pairwise comparison within each topic group
    for topic_id, group in topic_groups.items():
        n = len(group)
        for i in range(n):
            for j in range(i + 1, n):
                sim = cosine_sim(group[i]["embedding"], group[j]["embedding"])
                if sim > threshold:
                    uf.union(group[i]["id"], group[j]["id"])

    # Build clusters from union-find roots
    clusters = defaultdict(list)
    for chunk in chunks:
        root = uf.find(chunk["id"])
        clusters[root].append(chunk)

    # Assign cluster_id and pick representative (longest chunk)
    for cluster_id_counter, (root, members) in enumerate(clusters.items()):
        # Sort by text length descending — longest chunk is representative
        members.sort(key=lambda c: len(c["chunk_text"]), reverse=True)
        for i, member in enumerate(members):
            member["cluster_id"] = cluster_id_counter
            member["is_representative"] = (i == 0)

    return chunks
