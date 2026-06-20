# CampusClimb — NLP-Based Syllabus-Aligned Notes System

[![Python](https://img.shields.io/badge/Python-3.11+-3776ab?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479a1?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com)

**NLP-Based System for Syllabus-Aligned Organization and Semantic Deduplication of Crowdsourced Student Notes with PYQ-Based Topic Importance Estimation**

Pilot subject: **Operating Systems**

---

## Overview

CampusClimb is a research prototype that:

1. **Parses a syllabus** into structured topics (units → topics)
2. **Ingests student notes** (PDF), chunks them, and semantically maps each chunk to the most relevant syllabus topic using sentence embeddings
3. **Deduplicates** overlapping note chunks within each topic using cosine similarity and Union-Find clustering
4. **Analyzes Previous Year Questions (PYQs)** to estimate topic importance based on question frequency
5. **Presents a dashboard** showing syllabus topics ranked by importance with deduplicated, organized notes

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Language | Python 3.11+ |
| Backend | FastAPI |
| Database | MySQL (SQLAlchemy ORM) |
| NLP | sentence-transformers (`all-MiniLM-L6-v2`), scikit-learn |
| PDF Parsing | pdfplumber |
| Frontend | Jinja2 templates + Bootstrap 5 |
| Embeddings | JSON-serialized vectors in MySQL |

## Setup Instructions

### 1. Prerequisites

- Python 3.11 or higher
- MySQL 8.0 or higher (running locally)
- pip (Python package manager)

### 2. Create MySQL Database

```sql
CREATE DATABASE campusclimb_nlp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Clone and Install

```bash
git clone https://github.com/rahul05au/CampusClimb.git
cd CampusClimb
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
```

### 4. Configure Environment

```bash
copy .env.example .env
```

Edit `.env` with your MySQL credentials:

```
DATABASE_URL=mysql+pymysql://root:yourpassword@localhost:3306/campusclimb_nlp
```

### 5. Run the Application

```bash
uvicorn app.main:app --reload
```

Open http://localhost:8000 in your browser.

### 6. NLTK Data (First Run)

The sentence tokenizer requires NLTK's `punkt_tab` data. It will be downloaded automatically on first use, or you can pre-download:

```python
import nltk
nltk.download('punkt_tab')
```

## Usage Workflow

1. **Upload Syllabus** — Upload a `.txt` or `.pdf` file with the syllabus structured as:
   ```
   UNIT 1: Introduction to Operating Systems
   - Process Management
   - CPU Scheduling
   UNIT 2: Memory Management
   - Paging
   - Segmentation
   ```

2. **Upload Notes** — Upload student note PDFs (one at a time) with the student's name. The system will automatically chunk, embed, map to topics, and deduplicate.

3. **Upload PYQs** — Upload Previous Year Question PDFs with the year. Questions are extracted, embedded, and mapped to topics to compute importance scores.

4. **View Dashboard** — See all topics ranked by PYQ-based importance with deduplicated note chunks.

## Project Structure

```
CampusClimb/
├── config.py                 # Tunable parameters (thresholds, chunk size)
├── requirements.txt          # Pinned dependencies
├── .env.example              # Environment variable template
├── app/
│   ├── main.py               # FastAPI application entry point
│   ├── database.py           # SQLAlchemy engine and session
│   ├── models.py             # ORM models (5 tables)
│   ├── routers/
│   │   ├── upload.py         # Upload endpoints (syllabus, notes, PYQs)
│   │   └── dashboard.py      # Dashboard and topic detail views
│   ├── templates/            # Jinja2 HTML templates
│   └── static/               # CSS
├── core/
│   ├── embeddings.py         # Sentence-transformers singleton + similarity
│   ├── syllabus_parser.py    # Syllabus text/PDF parser
│   ├── pdf_extractor.py      # PDF text extraction + chunking
│   ├── topic_mapper.py       # Semantic topic mapping
│   ├── deduplicator.py       # Union-Find deduplication
│   └── pyq_analyzer.py       # PYQ extraction + importance scoring
└── evaluation/
    ├── label_dedup_pairs.py   # Generate CSV for manual dedup labeling
    ├── evaluate_dedup.py      # Compute dedup precision/recall/F1
    └── evaluate_mapping.py    # Compute topic mapping accuracy
```

## Evaluation Scripts

These scripts generate the metrics needed for the research paper's Results section.

### Deduplication Evaluation

```bash
# Step 1: Generate labeled pairs CSV
python -m evaluation.label_dedup_pairs

# Step 2: Manually fill the 'manual_label' column in evaluation/output/dedup_pairs.csv (1=duplicate, 0=not)

# Step 3: Compute precision, recall, F1
python -m evaluation.evaluate_dedup
```

### Topic Mapping Evaluation

```bash
# Step 1: Generate mapping CSV
python -m evaluation.evaluate_mapping

# Step 2: Manually fill 'manual_correct_topic_id' in evaluation/output/mapping_pairs.csv

# Step 3: Compute accuracy
python -m evaluation.evaluate_mapping --evaluate
```

## Configuration

Edit `config.py` to tune parameters for experimentation:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `MODEL_NAME` | `all-MiniLM-L6-v2` | Sentence-transformers model |
| `SENTENCES_PER_CHUNK` | `4` | Sentences per text chunk |
| `MIN_CHUNK_WORDS` | `20` | Minimum words to keep a chunk |
| `DEDUP_SIMILARITY_THRESHOLD` | `0.85` | Cosine similarity threshold for dedup |
| `IMPORTANCE_LOW_THRESHOLD` | `0.05` | Below this = "Low" importance |
| `IMPORTANCE_HIGH_THRESHOLD` | `0.15` | Above this = "High" importance |

## License

MIT License
