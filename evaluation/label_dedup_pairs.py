"""
Deduplication Pair Labeling Script — Generates a CSV of chunk pairs for
manual evaluation of the deduplication system.

Usage:
    python -m evaluation.label_dedup_pairs

Outputs:
    evaluation/output/dedup_pairs.csv
"""

import csv
import json
import os
import random
from collections import defaultdict

from app.database import SessionLocal
from app.models import NoteChunk
from core.embeddings import cosine_sim


def main():
    db = SessionLocal()
    try:
        # Query all chunks with topic assignments
        chunks = db.query(NoteChunk).filter(
            NoteChunk.matched_topic_id.isnot(None),
            NoteChunk.embedding.isnot(None),
        ).all()

        if len(chunks) < 2:
            print("Not enough chunks in database to generate pairs. Upload notes first.")
            return

        # Group chunks by topic
        topic_groups = defaultdict(list)
        for chunk in chunks:
            topic_groups[chunk.matched_topic_id].append(chunk)

        # Generate pairs (prefer same-topic pairs)
        pairs = []
        for topic_id, group in topic_groups.items():
            if len(group) < 2:
                continue
            # Generate all possible pairs within this topic
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    pairs.append((group[i], group[j]))

        # Sample up to 100 pairs
        if len(pairs) > 100:
            pairs = random.sample(pairs, 100)

        if not pairs:
            print("Not enough chunk pairs available. Upload more notes.")
            return

        # Prepare output
        output_dir = os.path.join(os.path.dirname(__file__), "output")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, "dedup_pairs.csv")

        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "chunk1_id", "chunk1_text", "chunk2_id", "chunk2_text",
                "cosine_similarity", "predicted_duplicate", "manual_label",
            ])

            for c1, c2 in pairs:
                emb1 = json.loads(c1.embedding)
                emb2 = json.loads(c2.embedding)
                sim = round(cosine_sim(emb1, emb2), 4)
                predicted = 1 if (c1.cluster_id is not None and c1.cluster_id == c2.cluster_id) else 0

                writer.writerow([
                    c1.id,
                    c1.chunk_text[:500],  # Truncate for readability
                    c2.id,
                    c2.chunk_text[:500],
                    sim,
                    predicted,
                    "",  # manual_label — to be filled by the researcher
                ])

        print(f"Generated {len(pairs)} pairs from {len(topic_groups)} topics.")
        print(f"Output: {output_path}")
        print("Fill the 'manual_label' column (1=duplicate, 0=not) then run evaluate_dedup.py")

    finally:
        db.close()


if __name__ == "__main__":
    main()
