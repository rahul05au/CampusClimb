# CampusClimb — Academic Intelligence & Semantic PYQ Engine

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-3776ab?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![MySQL](https://img.shields.io/badge/MySQL-8.0+-4479a1?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com)
[![Tests](https://img.shields.io/badge/Tests-111%2F111%20PASS-brightgreen?style=for-the-badge&logo=pytest&logoColor=white)](https://pytest.org)
[![Build](https://img.shields.io/badge/Frontend%20Build-PASS-success?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)

**CampusClimb** is a research-backed Academic Intelligence Operating System. It ingests university lecture notes, standardized syllabi, and Previous Year Question (PYQ) papers to solve document deduplication, historical exam importance weighting, syllabus-aligned semantic organization, and adaptive exam preparation.

---

## Key Capabilities

### 1. High-Performance PDF Ingestion Pipeline
* **Asynchronous Processing State Machine**: Instantaneous sub-second upload acknowledgement followed by background extraction, chunking, embedding, and indexing (`PROCESSING` $\rightarrow$ `COMPLETED`).
* **Multi-Tier Extraction**: Layout-aware digital extraction powered by `pypdfium2` with automatic OCR fallback (`pytesseract` + `pdf2image`) for scanned notes.
* **Optimized Embeddings**: Thread-safe singleton model (`SharedModelManager`) wrapping domain fine-tuned `CAPT-M` / `all-mpnet-base-v2`, batched encoding (`batch_size=32`), and in-memory LRU embedding cache.
* **Empirical Speed**: First-time ingestion of 154-page PDFs (~320 chunks) executes in **~42.9s**, warm cached ingestion completes in **1.93s**, and duplicate files are detected via SHA-256 in **6.9ms**.

### 2. Semantic Deduplication & Representative Merged Notes
* **Union-Find Clustering**: Connected-component graph clustering using cosine similarity ($\tau \ge 0.85$) groups semantically redundant note chunks across multi-author submissions.
* **Telemetry Markers**: Complete transparency with live metadata:
  * `REPRESENTATIVE MERGED NOTE` identifier
  * `Merged from X sources` counter
  * `X% duplicate content removed` metric
  * `(Union-Find · Cosine ≥ 0.85)` algorithm badge
  * `Source Note #...` lineage citation
* **Structured Academic Format**: Formats dense student notes into scannable sections:
  * **Concept Summary (`What is it?`)**
  * **Key Points** (bulleted takeaways)
  * **Exam Focus** (high-yield exam callouts)

### 3. Closed-Loop Adaptive Study Engine
* **Dynamic Study Planner**: Knapsack-style greedy scheduler computing **Value-per-Minute** ($\rho = \frac{\text{Exam Value}}{\text{Study Minutes}}$) across three modes: *Emergency* (1–2h), *Sprint* (3–5h), and *Mastery* (Full syllabus).
* **Next Best Action**: Live recommendation engine calculating the single highest-yield topic to study next.
* **Explainable Mastery & Readiness**: Multi-signal scoring combining quiz accuracy, revision status, PYQ importance, and flashcard retention.
* **Active Recall Spaced Repetition**: 4-rating flashcards (`Again`, `Hard`, `Good`, `Easy`) with weighted retention forecasting.
* **Rapid Diagnostic Quizzes**: 5-question high-yield quizzes with immediate rationale explanations.

### 4. Grounded University Mock Exams
* **University Pattern Match**: Built specifically for university formats (e.g. JNTU R22: Part A 10 short compulsory questions $\times$ 2M + Part B 5 deep analytical questions $\times$ 10M).
* **Marking Rubrics**: Transparent rubric breakdown (Concept: 3M, Diagram/Working: 4M, Edge Cases: 3M) grounded in syllabus topic excerpts.

### 5. Multilingual Q&A & Live AI Teacher
* **Source-Grounded RAG**: Retrieval-Augmented Generation with strict syllabus guardrails (`[IN SYLLABUS]` / `[OUTSIDE SYLLABUS]`) and inline citation badges (`[1]`, `[2]`).
* **Neural Voice Synthesis**: In-memory streaming audio using Microsoft Neural Voices (`hi-IN-SwaraNeural` for Hindi, `en-IN-NeerjaNeural` for Indian English) via `edge-tts`.

---

## Tech Stack

| Domain | Technologies & Libraries |
|---|---|
| **Backend Framework** | FastAPI `0.115`, Uvicorn `0.34`, Pydantic v2 |
| **Database & ORM** | MySQL 8.0, SQLAlchemy `2.0`, PyMySQL `1.1` |
| **NLP & Deep Learning** | PyTorch `2.12`, `sentence-transformers` `3.3.1`, Transformers `4.57`, scikit-learn `1.6` |
| **PDF Extraction & OCR** | `pypdfium2` `5.10`, `pdfplumber` `0.11`, `pytesseract` `0.3.13`, `pdf2image` `1.17` |
| **Auth & Security** | Supabase Auth, `PyJWT` `2.13` (asymmetric JWKS caching), secure multi-tenant isolation |
| **Voice & Speech** | `edge-tts` `7.2.8` (streaming async neural speech synthesis) |
| **Frontend Framework** | React `19.2`, Vite `8.2`, React Router `v7` |
| **Styling & Animation** | Tailwind CSS `v4.3`, Motion (Framer Motion v13), Lucide Icons |

---

## System Architecture

```text
Syllabus + Lecture Notes + PYQ Papers
                 │
                 ▼
 ┌────────────────────────────────────────────────────────┐
 │            High-Speed Asynchronous Ingestion          │
 │  pypdfium2 / OCR  ──►  Batched MPNet Embeddings (32)   │
 │  In-Memory LRU Cache ──►  SHA-256 Duplicate Hashing    │
 └────────────────────────────────────────────────────────┘
                 │
                 ▼
 ┌────────────────────────────────────────────────────────┐
 │           Algorithmic Knowledge Organization           │
 │  Topic Distance Mapper ──► Cosine Union-Find (τ ≥ 0.85)│
 │  Historical PYQ Weighting ──► Representative Notes     │
 └────────────────────────────────────────────────────────┘
                 │
                 ▼
 ┌────────────────────────────────────────────────────────┐
 │             Continuous Study Engine Loop               │
 │  Value-per-Minute Planner ──► Next Best Action         │
 │  2-Min Quick Revision ──► Active Recall Flashcards     │
 │  5-Question Diagnostic Quiz ──► Multi-Signal Mastery   │
 │  Grounded University Mock Exams (JNTU R22 Rubrics)     │
 └────────────────────────────────────────────────────────┘
                 │
                 ▼
 ┌────────────────────────────────────────────────────────┐
 │             Interactive Student Interfaces             │
 │  Executive Dashboard  │  Bilingual RAG Q&A Engine      │
 │  Live Voice AI Teacher│  Mobile & Desktop Web UI       │
 └────────────────────────────────────────────────────────┘
```

---

## Setup & Local Installation

### Prerequisites
* **Python**: 3.11 or 3.12
* **Node.js**: 18+ (with `npm`)
* **MySQL**: 8.0 or higher
* **Tesseract OCR** (Optional, for scanned PDF OCR fallback)

---

### 1. Backend Setup

```bash
# Clone repository
git clone https://github.com/rahul05au/CampusClimb.git
cd CampusClimb

# Create and activate Python virtual environment
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
copy .env.example .env   # On macOS/Linux: cp .env.example .env
```

Edit `.env` with your credentials:
```ini
DATABASE_URL=mysql+pymysql://root:yourpassword@localhost:3306/campusclimb_nlp
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-key
GEMINI_API_KEY=your-gemini-api-key
```

Run database initialization and start the FastAPI server:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend API documentation will be accessible at: `http://127.0.0.1:8000/docs`

---

### 2. Frontend Setup

```bash
cd frontend

# Install npm packages
npm install

# Configure environment variables
copy .env.example .env   # On macOS/Linux: cp .env.example .env
```

Ensure `frontend/.env` contains:
```ini
VITE_API_URL=http://127.0.0.1:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Start the Vite development server:
```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Test & Verification Suite

### 1. Run Complete Backend Unit & Integration Tests
```bash
pytest core/tests -q
```
*Current status*: **111 / 111 PASS** (100% pass rate in ~27s).

### 2. Run Study Engine & Hardening Tests
```bash
pytest core/tests/test_study_engine.py core/tests/test_e2e_hardening.py -q
```
*Current status*: **31 / 31 PASS**.

### 3. Run Golden End-to-End Live Verification Pipeline
```bash
python scripts/verify_golden_e2e_flow.py
```
*Current status*: **12 / 12 stages PASS** on live server with real database persistence.

### 4. Build Production Frontend Bundle
```bash
npm --prefix frontend run build
```
*Current status*: **PASS** (zero lint/type errors, production bundle compiled in ~2.2s).

---

## Responsive & Browser QA Matrix

Verified across 5 standard viewport form factors under authenticated user sessions:

| Device Viewport | Resolution | Layout Verification |
|---|---|---|
| **Mobile (iPhone SE)** | `375 x 667` | Zero horizontal overflow, responsive drawer navigation, stacked study cards |
| **Mobile (iPhone 12/13/14)** | `390 x 844` | Touch targets calibrated, typography scale verified, telemetry wrapped |
| **Tablet (iPad Portrait)** | `768 x 1024` | 2-column responsive grid layout, interactive modal centering |
| **Laptop** | `1280 x 800` | Full dashboard workspace, side navigation, study engine controls |
| **Desktop** | `1440 x 900` | Widescreen layout, comprehensive RAG query and study workspace |

---

## Evaluation & Research Benchmarks

* **Embedding Model**: Domain fine-tuned `CAPT-M` 768-dimensional model.
* **Deduplication Performance**: Evaluated against multi-annotator ground truth with $\tau = 0.82 - 0.85$ achieving balanced Precision, Recall, and F1.
* **Cold Ingestion Speed**: 154-page PDF (~320 chunks) ingested in ~42.9s on CPU without GPU acceleration.
* **Warm Ingestion Speed**: 1.93s using memory-cached representations.
* **Read Latency**: Study Overview endpoint average latency: **10.81ms**.

---

## License

This project is licensed under the [MIT License](LICENSE).
