"""
Deduplication Evaluation Script — Computes precision, recall, and F1 score
for the semantic deduplication system against manual labels.

Also performs a threshold sweep to find the optimal similarity threshold.

Usage: 
    python -m evaluation.evaluate_dedup

Requires:
    evaluation/output/dedup_pairs.csv with 'manual_label' column filled (1/0).

Outputs:
    evaluation/output/dedup_results.txt
"""
 
import csv
import os
 

def compute_metrics(y_true: list[int], y_pred: list[int]) -> dict:
    """Compute precision, recall, and F1 from binary labels."""
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 1)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t == 0 and p == 1)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == 1 and p == 0)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {"precision": precision, "recall": recall, "f1": f1, "tp": tp, "fp": fp, "fn": fn}


def main():
    input_path = os.path.join(os.path.dirname(__file__), "output", "dedup_pairs.csv")

    if not os.path.exists(input_path):
        print(f"File not found: {input_path}")
        print("Run label_dedup_pairs.py first to generate the CSV.")
        return

    # Read labeled pairs
    rows = []
    with open(input_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row["manual_label"].strip() in ("0", "1"):
                rows.append(row)

    if not rows:
        print("No labeled rows found. Fill the 'manual_label' column with 1 or 0 first.")
        return

    manual_labels = [int(r["manual_label"]) for r in rows]
    predicted_labels = [int(r["predicted_duplicate"]) for r in rows]
    similarities = [float(r["cosine_similarity"]) for r in rows]

    # Evaluate system predictions
    results = []
    metrics = compute_metrics(manual_labels, predicted_labels)
    results.append("=" * 60)
    results.append("DEDUPLICATION EVALUATION RESULTS")
    results.append("=" * 60)
    results.append(f"Total labeled pairs: {len(rows)}")
    results.append(f"True positives: {metrics['tp']}")
    results.append(f"False positives: {metrics['fp']}")
    results.append(f"False negatives: {metrics['fn']}")
    results.append(f"Precision: {metrics['precision']:.4f}")
    results.append(f"Recall:    {metrics['recall']:.4f}")
    results.append(f"F1 Score:  {metrics['f1']:.4f}")

    # Threshold sweep
    results.append("")
    results.append("-" * 60)
    results.append("THRESHOLD SWEEP")
    results.append(f"{'Threshold':<12} {'Precision':<12} {'Recall':<12} {'F1':<12}")
    results.append("-" * 60)

    for threshold in [0.75, 0.80, 0.85, 0.90]:
        swept_pred = [1 if s > threshold else 0 for s in similarities]
        swept_metrics = compute_metrics(manual_labels, swept_pred)
        results.append(
            f"{threshold:<12.2f} {swept_metrics['precision']:<12.4f} "
            f"{swept_metrics['recall']:<12.4f} {swept_metrics['f1']:<12.4f}"
        )

    results.append("=" * 60)

    # Print and save
    output_text = "\n".join(results)
    print(output_text)

    output_path = os.path.join(os.path.dirname(__file__), "output", "dedup_results.txt")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(output_text)
    print(f"\nResults saved to: {output_path}")


if __name__ == "__main__":
    main()
