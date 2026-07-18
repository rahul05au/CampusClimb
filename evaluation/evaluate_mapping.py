"""
Topic Mapping Evaluation Script — Evaluates the accuracy of semantic
topic mapping by comparing system predictions against manual labels.

Modes:
    Generate CSV:  python -m evaluation.evaluate_mapping
    Evaluate:      python -m evaluation.evaluate_mapping --evaluate

Outputs:
    evaluation/output/mapping_pairs.csv    (generate mode)
    evaluation/output/mapping_results.txt  (evaluate mode)
"""

import argparse
import csv
import json
import os
import random

from app.database import SessionLocal
from app.models import NoteChunk, SyllabusTopic
from core.topic_mapper import map_chunk_to_topic

def generate_csv():
    """Sample chunks and output CSV for manual topic-mapping labeling."""
    db = SessionLocal()
    try:
        chunks = db.query(NoteChunk).filter(
            NoteChunk.matched_topic_id.isnot(None),
            NoteChunk.embedding.isnot(None),
        ).all()

        if not chunks:
            print("No mapped chunks in database. Upload notes first.")
            return

        # Sample up to 50 chunks
        sample = random.sample(chunks, min(50, len(chunks)))

        # Load all topic embeddings for top-3 computation
        topics = db.query(SyllabusTopic).all()
        topic_embeddings = [
            (t.id, json.loads(t.embedding)) for t in topics
            if t.embedding
        ]
        topic_names = {t.id: t.topic_name for t in topics}

        output_dir = os.path.join(os.path.dirname(__file__), "output")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, "mapping_pairs.csv")

        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "chunk_id", "chunk_text", "predicted_topic_id",
                "predicted_topic_name", "top3_topic_ids",
                "manual_correct_topic_id",
            ])

            for chunk in sample:
                chunk_emb = json.loads(chunk.embedding)

                # Compute similarities to all topics for top-3
                sims = []
                for tid, temb in topic_embeddings:
                    from core.embeddings import cosine_sim
                    sim = cosine_sim(chunk_emb, temb)
                    sims.append((tid, sim))
                sims.sort(key=lambda x: x[1], reverse=True)
                top3_ids = [str(s[0]) for s in sims[:3]]

                writer.writerow([
                    chunk.id,
                    chunk.chunk_text[:200],
                    chunk.matched_topic_id,
                    topic_names.get(chunk.matched_topic_id, "Unknown"),
                    "|".join(top3_ids),
                    "",  # manual_correct_topic_id — to be filled
                ])

        print(f"Sampled {len(sample)} chunks.")
        print(f"Output: {output_path}")
        print("Fill 'manual_correct_topic_id' then run with --evaluate flag.")
        print(f"\nAvailable topics for reference:")
        for tid, tname in sorted(topic_names.items()):
            print(f"  {tid}: {tname}")

    finally:
        db.close()


def evaluate():
    """Compute accuracy from manually labeled CSV."""
    input_path = os.path.join(os.path.dirname(__file__), "output", "mapping_pairs.csv")

    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        print("Run without --evaluate first to generate the CSV.")
        return

    rows = []
    with open(input_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["manual_correct_topic_id"].strip():
                rows.append(row)

    if not rows:
        print("No labeled rows found. Fill 'manual_correct_topic_id' column first.")
        return

    total = len(rows)
    correct = 0
    top3_correct = 0

    for row in rows:
        predicted = int(row["predicted_topic_id"])
        manual = int(row["manual_correct_topic_id"])
        top3 = [int(x) for x in row["top3_topic_ids"].split("|")]

        if predicted == manual:
            correct += 1
        if manual in top3:
            top3_correct += 1

    accuracy = correct / total
    top3_accuracy = top3_correct / total

    results = []
    results.append("=" * 50)
    results.append("TOPIC MAPPING EVALUATION RESULTS")
    results.append("=" * 50)
    results.append(f"Total labeled chunks: {total}")
    results.append(f"Correct (top-1):      {correct}/{total}")
    results.append(f"Accuracy (top-1):     {accuracy:.4f}")
    results.append(f"Correct (top-3):      {top3_correct}/{total}")
    results.append(f"Accuracy (top-3):     {top3_accuracy:.4f}")
    results.append("=" * 50)

    output_text = "\n".join(results)
    print(output_text)

    output_path = os.path.join(os.path.dirname(__file__), "output", "mapping_results.txt")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output_text)
    print(f"\nResults saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Topic mapping evaluation")
    parser.add_argument("--evaluate", action="store_true", help="Evaluate labeled CSV instead of generating it")
    args = parser.parse_args()

    if args.evaluate:
        evaluate()
    else:
        generate_csv()


if __name__ == "__main__":
    main()
