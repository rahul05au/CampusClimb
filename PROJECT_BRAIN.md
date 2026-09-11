# CampusClimb — Project Brain & Single Source of Truth

> **System Status**: Production-Ready / Research-Validated  
> **Last Verified & Synced**: September 11, 2026 (Pre-Demo Regression & Final Hardening — AI Teacher Live Voice Call Suite, Rate Limiter Expansion, Mobile Overhaul, 80/80 Backend Tests PASS)  
> **Target Audience**: AI Coding Assistants & Human Engineers working on CampusClimb.

---

## 1. Project Overview

CampusClimb is a research-backed academic intelligence system that ingests university lecture notes, syllabi, and Previous Year Question (PYQ) papers to solve syllabus-aligned document deduplication and exam preparation. By mapping unstructured student notes against standardized syllabus topics using domain-fine-tuned sentence transformers (`CAPT-M`), the platform automatically groups semantically redundant content into connected components (Union-Find clustering) and computes empirical topic importance scores derived from historical exam question distributions. It provides university students with deduplicated, representative study material and an authenticated, multilingual explanation engine.

### Tech Stack & Exact Package Versions

#### Backend (Python 3.12 Virtual Environment)
Verified directly against `requirements.txt` and live `pip list`:
- **Web Framework**: `fastapi==0.115.6`
- **ASGI Server**: `uvicorn[standard]==0.34.0`
- **ORM**: `SQLAlchemy==2.0.36`
- **Database Driver**: `PyMySQL==1.1.1` (with `cryptography==44.0.0`)
- **Semantic Search & NLP**:
  - `sentence-transformers==3.3.1`
  - `torch==2.12.1`
  - `transformers==4.57.6`
  - `scikit-learn==1.6.1`
  - `nltk==3.9.1`
- **PDF Ingestion & Extraction**:
  - `pdfplumber==0.11.4` (with `pdfminer.six==20231228`)
  - `pypdfium2==5.10.1`, `pdf2image==1.17.0`, `pytesseract==0.3.13`
- **Authentication & Security**:
  - `PyJWT==2.13.0` (with asymmetric JWKS key caching & ES256/RS256/HS256 decoding)
  - `httpx==0.28.1` (used for async non-blocking external auth and Gemini LLM calls)
  - `python-dotenv==1.0.1`
  - `python-multipart==0.0.20`
- **Neural Text-to-Speech (TTS)**:
  - `edge-tts>=7.0.0` (installed `7.2.8` with `aiohttp` in-memory MP3 neural streaming, Microsoft Neural Voices `hi-IN-SwaraNeural` and `en-IN-NeerjaNeural`)
- **Templates & Views**: `Jinja2==3.1.5`

#### Frontend (Node.js / React Single Page Application)
Verified directly against `frontend/package.json`:
- **Core Library**: `react==^19.2.8`, `react-dom==^19.2.8`
- **Bundler & Build Tool**: `vite==^8.2.2` with `@vitejs/plugin-react==^6.1.0`
- **Routing**: `react-router-dom==^7.18.3`
- **Styling**: `tailwindcss==^4.3.3` with `@tailwindcss/vite==^4.3.3`
- **Animations**: `motion==^13.2.0` (Framer Motion v12+ modular import)
- **Icons**: `lucide-react==^1.43.0`
- **HTTP Client**: `axios==^1.20.0`
- **Auth Client**: `@supabase/supabase-js==^2.116.0`
- **Linter**: `oxlint==^1.79.0`

---

## 2. Architecture

### Full Directory Structure
```text
CampusClimb/
├── .env                                # Local backend environment secrets (MySQL, Supabase, Gemini)
├── .env.example                        # Template for backend secrets
├── .gitignore                          # Git ignore definitions
├── config.py                           # Central runtime hyperparameters & fine-tuned model path resolution
├── requirements.txt                    # Pinned Python package dependencies
├── README.md                           # Repository documentation
├── app/                                # FastAPI Web Application & Core Backend
│   ├── __init__.py
│   ├── auth.py                         # Supabase REST auth, PyJWKClient token validation, JWKS warming
│   ├── database.py                     # SQLAlchemy engine, SessionLocal, declarative Base
│   ├── main.py                         # App entrypoint, lifespan startup migrations, CORS, router inclusion
│   ├── models.py                       # SQLAlchemy database models (5 primary tables + subjects)
│   ├── rate_limiter.py                 # Thread-safe in-memory sliding-window IP rate limiters
│   ├── schemas.py                      # Pydantic request/response validation schemas
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── agent.py                    # Bilingual Q&A endpoint (/api/v1/agent/query)
│   │   ├── auth.py                     # Managed auth endpoints (/api/v1/auth/signup, /login, /me)
│   │   ├── dashboard.py                # Aggregated metrics & telemetry (/api/v1/dashboard, /api/v1/stats)
│   │   ├── tts.py                      # Neural text-to-speech endpoint (/api/v1/tts)
│   │   └── upload.py                   # Multipart upload handlers (/upload/syllabus, /notes, /pyqs, /api/v1/subjects)
│   ├── static/                         # Static CSS fallback
│   └── templates/                      # Jinja2 HTML server templates fallback
├── core/                               # Algorithmic NLP Engine
│   ├── __init__.py
│   ├── deduplicator.py                 # Cosine similarity graph clustering & Union-Find disjoint sets
│   ├── embeddings.py                   # Transformer batch embedder & cosine similarity calculation
│   ├── pdf_extractor.py                # pdfplumber layout-aware text extraction & semantic sentence chunking
│   ├── pyq_analyzer.py                 # Regular expression question segmentation & percentile importance scoring
│   ├── syllabus_parser.py              # Unit & topic hierarchy regex parser
│   └── topic_mapper.py                 # Embedding distance topic assignment
├── frontend/                           # React 19 + Tailwind v4 + Vite Web Application
│   ├── index.html                      # HTML root with Plus Jakarta Sans & JetBrains Mono font links
│   ├── package.json                    # Frontend dependencies & scripts
│   ├── vite.config.js                  # Vite configuration with Tailwind plugin
│   ├── .env                            # Frontend environment variables (VITE_API_URL, VITE_SUPABASE_*)
│   ├── public/                         # Public static assets
│   └── src/
│       ├── App.jsx                     # Router, theme provider, and route definitions
│       ├── index.css                   # Tailwind v4 import, theme CSS variables, dark/light definitions
│       ├── main.jsx                    # React DOM entry point
│       ├── components/                 # Reusable UI components (Navbar, Footer, HeroSection, etc.)
│       │   └── ai-teacher/             # Live voice AI teacher modal, teacher orb, captions, controls, quick actions
│       ├── context/
│       │   └── AuthContext.jsx         # Session state, onAuthStateChange listener, getToken() helper
│       ├── lib/
│       │   └── supabase.js             # Singleton Supabase JS client
│       └── pages/
│           ├── Home.jsx                # Landing page with live statistics and feature breakdowns
│           ├── Login.jsx               # Email/Password + Google OAuth login & signup modal
│           ├── Dashboard.jsx           # Student topic mastery, dedup stats, and syllabus importance view
│           ├── Query.jsx               # Bilingual semantic search & tutor question answering interface
│           ├── Upload.jsx              # 3-step animated stepper upload wizard with dynamic subject dropdown
│           └── AuthCallback.jsx        # Supabase OAuth redirect landing page
├── research/                           # Academic Research, Models, and Experimental Data
│   ├── models/
│   │   └── fine_tuned_capt_m_clean/    # Authoritative 768-dim fine-tuned domain sentence transformer
│   ├── data/                           # Ground truth syllabi, note corpora, and PYQ datasets
│   └── results/                        # Benchmark results, ablation tables, and statistical significance tests
├── uploads/                            # Server directory for uploaded temporary and processed PDFs
│   └── test_fixtures/                  # Generated valid PDF test fixtures for automated testing
└── scratch/                            # Ephemeral test and verification scripts
```

### Backend: FastAPI Routers & Responsibilities
1. **`app.routers.auth` (`/api/v1/auth`)**:
   - `POST /signup`: Calls Supabase Auth REST API to register a student; returns JWT bearer tokens.
   - `POST /login`: Authenticates student via Supabase password grant; returns access and refresh tokens.
   - `GET /me`: Returns `{ "id", "email" }` of the currently validated Bearer token.
2. **`app.routers.upload` (`/upload`, `/api/v1`)**:
   - `POST /upload/syllabus`: Extracts syllabus units and topics, generates topic embeddings, replaces existing subject topics (cleaning orphan foreign keys first).
   - `POST /upload/notes`: Saves student notes with `user_id`, chunks text, maps chunks to syllabus topics, and runs cumulative Union-Find deduplication across all chunks belonging to that `user_id` and `subject`.
   - `POST /upload/pyqs`: Extracts previous year questions, maps them to syllabus topics, and recalculates topic importance scores.
   - `GET /api/v1/subjects`: Returns dynamic list of unique subjects present in the `subjects` table.
   - `GET /api/v1/status/{subject}`: Returns topic count, note chunk count, and PYQ count for stepper stage validation.
3. **`app.routers.dashboard` (`/api/v1`)**:
   - `GET /api/v1/stats`: Public telemetry statistics (syllabus count, notes count, PYQ count, supported subjects) for the landing page.
   - `GET /api/v1/dashboard`: Authenticated, user-scoped metrics endpoint. Aggregates total notes uploaded by the user, chunk count, representative chunk count, deduplication percentage, and per-topic note/PYQ coverage.
4. **`app.routers.agent` (`/api/v1/agent`)**:
   - `POST /api/v1/agent/query`: Authenticated bilingual academic tutor. Embeds user query, finds top matching syllabus topic, fetches representative note chunks scoped to the current user, sanitizes query against prompt injection, and prompts Google Gemini (or generates a structured fallback) for bilingual explanations.
   - `GET /api/v1/agent/sources?subject=<name>`: Returns list of uploaded source files for the current user + subject (`{ sources: [{ id, filename, chunk_count }] }`) — used by the NotebookLM-style sources panel in `Query.jsx`.
   - `DELETE /api/v1/agent/sources/{source_id}`: Permanently deletes a source note and all its chunks for the authenticated user.
5. **`app.routers.tts` (`/api/v1/tts`)**:
   - `POST /api/v1/tts`: In-memory streaming neural text-to-speech endpoint. Accepts `{ text, lang, voice }`, dynamically resolves language/script (`hi-IN-SwaraNeural` for Hindi/Devanagari, `en-IN-NeerjaNeural` for Indian English), and yields streamed MP3 chunks with `audio/mpeg` media type. Requires zero external API keys or billing.

### Frontend: Client Routes in `App.jsx`
- `/`: **Home** (`pages/Home.jsx`) — Landing page displaying platform features, research credibility benchmarks, and live system statistics fetched from `/api/v1/stats`.
- `/login`: **Login** (`pages/Login.jsx`) — Interactive authentication card supporting mode switching (Login vs Signup) and Google OAuth popup/redirect.
- `/dashboard`: **Dashboard** (`pages/Dashboard.jsx`) — Authenticated student control center displaying deduplication efficiency, uploaded notes, and topic breakdown filtered by subject.
- `/upload`: **Upload** (`pages/Upload.jsx`) — 3-step wizard (Syllabus PDF $\rightarrow$ Notes PDF $\rightarrow$ PYQ Papers) with animated step completion, drag-and-drop zones, and dynamic database subject selection.
- `/query`: **Query** (`pages/Query.jsx`) — Full-featured bilingual AI Q&A engine with NotebookLM-style per-source selection sidebar, voice input/output loop (Web Speech API), auto-speak toggle, pause/resume controls, confidence meters, Mermaid concept diagrams, inline citation chips, follow-up question chips, and session history sidebar. Subject synced via URL `?subject=` param and `localStorage`.
- `/auth/callback`: **AuthCallback** (`pages/AuthCallback.jsx`) — Handles incoming Supabase OAuth hash fragments, extracts sessions, and routes user to `/upload`.

### Database: Models & Relationships (`app/models.py`)
- **`Subject` (`subjects`)**:
  - `id` (PK, Int), `name` (String 100, Unique, Index), `created_at` (DateTime).
  - Relationship: `notes` $\rightarrow$ `Note`.
- **`SyllabusTopic` (`syllabus_topics`)**:
  - `id` (PK, Int), `subject` (String 100, Index), `unit_number` (Int), `unit_name` (String 255), `topic_name` (String 255), `embedding` (Text, JSON vector).
  - Relationships: `chunks` $\rightarrow$ `NoteChunk`, `pyqs` $\rightarrow$ `PYQ`, `importance` $\rightarrow$ `TopicImportance`.
- **`Note` (`notes`)**:
  - `id` (PK, Int), `user_id` (String 255, Index), `student_name` (String 100), `subject` (String 100), `subject_id` (FK $\rightarrow$ `subjects.id`, Nullable, Index), `original_filename` (String 255), `upload_date` (DateTime).
  - Relationships: `subject_ref` $\rightarrow$ `Subject`, `chunks` $\rightarrow$ `NoteChunk`.
- **`NoteChunk` (`note_chunks`)**:
  - `id` (PK, Int), `note_id` (FK $\rightarrow$ `notes.id`), `chunk_text` (Text), `embedding` (Text, JSON vector), `matched_topic_id` (FK $\rightarrow$ `syllabus_topics.id`, Nullable), `similarity_score` (Float), `cluster_id` (Int, Nullable), `is_representative` (Boolean, default False).
  - Relationships: `note` $\rightarrow$ `Note`, `topic` $\rightarrow$ `SyllabusTopic`.
- **`PYQ` (`pyqs`)**:
  - `id` (PK, Int), `year` (Int), `question_text` (Text), `embedding` (Text, JSON vector), `matched_topic_id` (FK $\rightarrow$ `syllabus_topics.id`, Nullable).
  - Relationship: `topic` $\rightarrow$ `SyllabusTopic`.
- **`TopicImportance` (`topic_importance`)**:
  - `id` (PK, Int), `topic_id` (FK $\rightarrow$ `syllabus_topics.id`, Unique/O2O), `question_count` (Int), `importance_score` (Float), `importance_label` (String 20: High/Medium/Low).
  - Relationship: `topic` $\rightarrow$ `SyllabusTopic`.

---

## 3. Data Model & Scoping Rules

### Global vs. User Scoping
The data model uses a hybrid architecture separating authoritative curriculum data from user-contributed notes:
- **Global / Shared Data**:
  - `Subject`: Shared curriculum taxonomy.
  - `SyllabusTopic`: Shared university syllabus structure.
  - `PYQ`: Shared previous year university exam questions.
  - `TopicImportance`: Shared statistical weightings calculated across all PYQs.
- **Per-User Scoped Data**:
  - `Note`: Uploaded note files associated with `user_id` (Supabase UUID).
  - `NoteChunk`: Text segments derived from a user's uploaded note.

### Scoping Enforcement in Code (Direct File & Line References)
1. **Note Chunk Retrieval for AI Agent**:
   - File: [`app/routers/agent.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/routers/agent.py#L206-L229)
   - Enforcement:
     ```python
     user_id = _current_user.get("id")
     chunks = db.query(NoteChunk).join(Note).filter(
         Note.user_id == user_id,
         NoteChunk.matched_topic_id == matched_topic_id,
         NoteChunk.is_representative == True,
     ).limit(5).all()
     ```
   - User notes are never leaked across users in the agent explanation context.
2. **Dashboard Metrics & Topic Breakdown**:
   - File: [`app/routers/dashboard.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/routers/dashboard.py#L58-L98)
   - Enforcement:
     ```python
     user_id = _current_user.get("id")
     user_notes = db.query(Note).filter(Note.user_id == user_id, Note.subject == subject_clean).all()
     user_note_ids = [n.id for n in user_notes]
     total_chunks = db.query(NoteChunk).filter(NoteChunk.note_id.in_(user_note_ids)).count()
     ```
   - Telemetry strictly reflects the requesting user's uploaded notes.

### Cumulative Deduplication Behavior
- **Implementation**: [`app/routers/upload.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/routers/upload.py#L385-L399) and [`core/deduplicator.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/deduplicator.py#L58-L121).
- **Scope**: Deduplication is **cumulative across all notes belonging to the same user and subject**:
  ```python
  _run_deduplication(db, user_id=user_id, subject=subject)
  ```
- **Algorithm**:
  1. All chunks for `user_id` and `subject` mapped to a valid `matched_topic_id` are grouped by topic.
  2. Pairwise cosine similarity is computed within each topic group.
  3. Pairs with similarity $\ge 0.85$ (`DEDUP_SIMILARITY_THRESHOLD` in `config.py`) are unified using a Disjoint Set Union (`_UnionFind`).
  4. Each connected component forms a cluster. The chunk with the longest text is designated `is_representative = True`; all other chunks in the cluster become `is_representative = False`.
  5. The database records are updated in place upon every new note upload.

### Note Cleaning, Bullet Normalization & Diagram Synthesis Pipeline
- **Implementation**: [`core/note_formatter.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/note_formatter.py) and [`core/pdf_extractor.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/pdf_extractor.py#L18-L100).
- **Three-Stage Sanitization**:
  1. **Pre-extraction PDF Noise Stripping & Glyph Normalization**: `_strip_pdf_noise()` dynamically samples top & bottom lines across all PDF pages to statistically detect recurring headers/footers (threshold $\ge 10\%$ of pages). It purges inline institutional artifacts (e.g. `NMIET COLLEGE`, `COLLEGELYTECHNI`, document page numbers, isolated letters) and immediately converts PDF-native bullet glyphs (`≡`, `□`, `■`, `•`, ``, `▶`, `→`, `⇒`) into standard Markdown `- ` bullets.
  2. **AI Study-Note Formatting**: Representative note chunks (`is_representative=True`) are cleaned and structured into crisp Markdown study guides via Google Gemini (`gemini-3.5-flash-lite`).
  3. **Structural Concept Diagram Synthesis**: When content describes an inherently visual or sequential concept (state diagrams, hierarchical flows, or comparison tables), Gemini synthesizes valid Mermaid.js code (`stateDiagram-v2` or `flowchart TD`) stored in `note_chunks.diagram_mermaid`. If content is unstructured prose, Gemini returns `"NO_DIAGRAM"` to prevent hallucinating diagrams.
  4. **Frontend Rendering**: Handled in [`frontend/src/pages/Dashboard.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/pages/Dashboard.jsx) with custom markdown rendering and dynamic client-side `mermaid` package integration (`MermaidViewer`).
  5. **Full Database Coverage**: 100% of all representative chunks across all notes, subjects, and users are backfilled (`SELECT COUNT(*) FROM note_chunks WHERE is_representative = 1 AND cleaned_text IS NULL` returns `0`).

---

## 4. Authentication Architecture

### Identity Provider
CampusClimb delegates user authentication to **Supabase Auth**, supporting both **Email/Password** credentials and **Google OAuth**.

### Token Format & Verification Mechanics
- **Algorithm**: Modern Supabase instances issue JWTs signed via asymmetric ECDSA P-256 (`ES256`) or RSA (`RS256`).
- **JWKS Key Resolution**:
  - Implemented in [`app/auth.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/auth.py#L148-L214).
  - Uses `jwt.PyJWKClient` pointing to `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` with a 1-hour key cache (`lifespan=3600`) and a strict 5.0-second timeout.
  - Pre-warmed during application startup (`warm_jwks_cache()`) in `main.py` lifespan so user requests experience no cold-start network fetch penalty.
  - Seamlessly falls back to symmetric `HS256` validation against `SUPABASE_JWT_SECRET` for legacy tokens.

### Client-Side Storage & Refresh Handling
- **Definitive Storage Finding (`AuthContext.jsx`)**:
  - **Access Token**: Stored **strictly in React memory state** (`const [token, setToken] = useState(null)`). It is **not** stored as a standalone raw access token in `localStorage`, protecting against cross-site script access.
  - **User Profile Metadata**: Non-sensitive profile data (`id`, `email`, `name`) is serialized to `localStorage.getItem('campusclimb_user')` purely to preserve user identity displays across page reloads.
  - **Supabase SDK Internal Storage**: The Supabase JS client maintains its own internal local storage key (`sb-<project-ref>-auth-token`) for session recovery and automated silent token renewal.
  - **Refresh Flow**: `AuthContext.jsx` registers `supabase.auth.onAuthStateChange()`. In addition, an explicit async `getToken()` method guarantees that long-running sessions refresh expired tokens via `supabase.auth.getSession()` before initiating uploads.

---

## 5. Known Issues & Resolved Work

### Resolved in Latest Session
1. **[RESOLVED] TTS reads only `answer` field (not `explanation`)**:
   - `getFullSpokenText()` in `Query.jsx` now composes `notice + answer + explanation` into a unified speech string with punctuation preserved.
2. **[RESOLVED] Chrome TTS silent truncation**:
   - Solved by implementing sentence chunking on `. ! ?` and Hindi purna viram `।`, streaming chunks sequentially into an HTML5 `<audio>` element with `onEnded` queue progression.
3. **[RESOLVED] System TTS voice quality**:
   - Replaced browser Web Speech Synthesis with backend neural TTS powered by `edge-tts` (Microsoft Neural Voices: `hi-IN-SwaraNeural` and `en-IN-NeerjaNeural`).
4. **[RESOLVED] Delete-source button inaccessible on mobile & keyboard**:
   - Removed `opacity-0 group-hover:opacity-100` pattern, enlarged tap target to $\ge 32\times 32\text{px}$, and added `focus-visible` focus ring.

### Open Items
1. **Hindi STT not captured**:
   - `recognition.lang = 'en-IN'` cannot capture Devanagari Hindi speech. Fix: detect language from recognized text or provide a lang toggle.
2. **No response streaming**:
   - The Gemini pipeline returns a complete JSON block after full generation. Users experience wait time before initial output. Streaming (`StreamingResponse` / SSE) will reduce perceived latency.

---

## 6. Conventions & Rules to Follow

### Security & Hardening Rules
- **No Hardcoded Secrets**: Secrets must only reside in `.env`. Never commit credentials or service account JSON files.
- **Fail Loudly at Boot**: Never silently catch DDL migrations or fundamental environment misconfigurations. Use `RuntimeError` during startup if critical resources fail.
- **Sanitize File Paths**: All upload endpoints must strictly use `os.path.basename()` and allowlist regex filters (`re.compile(r"[^\w\-. ]")`) before saving files to disk.
- **File Validation by Magic Bytes**: Inspect file headers (`%PDF-`) directly in memory; do not trust caller-supplied `Content-Type` headers or file extensions.
- **Rate Limiting**: All public/unauthenticated endpoints (auth, upload, AI agent queries) must declare and invoke sliding-window rate limiters.
- **Zero Mock / Fallback Data in Core Pipeline**: Do not stub database queries or invent placeholder return objects. Database and embedding calculations must run against actual records.

### Frontend Aesthetics & Design System
- **Theme Palette**: Research-Lab Terminal Palette (`#0a0a0a` true black background, zero generic blue slop).
- **Signal Color**: Accent Signal Teal (`#14b8a6` in dark mode, `#0f766e` in light mode).
- **Typography**:
  - Sans-serif: `Plus Jakarta Sans`, `-apple-system`, `sans-serif`.
  - Monospace: `JetBrains Mono`, `monospace` (used for code badges, metrics, telemetry headers, and buttons).
- **Cards & Surfaces**: Glassmorphism with subtle top light-source highlight (`border-top: 1px solid rgba(255, 255, 255, 0.15)`).

---

## 7. Environment Variables Required

### Backend (`.env` in Root)
- `DATABASE_URL`: MySQL SQLAlchemy connection string.  
  *Referenced in*: [`app/database.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/database.py#L15)
- `SUPABASE_URL`: Supabase project URL (e.g. `https://<ref>.supabase.co`).  
  *Referenced in*: [`app/auth.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/auth.py#L26)
- `SUPABASE_ANON_KEY`: Supabase project public anon key.  
  *Referenced in*: [`app/auth.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/auth.py#L27)
- `SUPABASE_JWT_SECRET`: Symmetric secret fallback for HS256 validation.  
  *Referenced in*: [`app/auth.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/auth.py#L28)
- `GEMINI_API_KEY`: API key for Google Gemini generation.  
  *Referenced in*: [`core/rag_engine.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/rag_engine.py#L710)
- `GEMINI_MODEL` *(Optional, Default: `gemini-flash-latest`)*: Primary model. Fallback chain tries `gemini-flash-latest` → `gemini-flash-lite-latest` → `gemini-pro-latest` automatically.  
  *Referenced in*: [`core/rag_config.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/rag_config.py#L33)
- `RAG_HTTP_TIMEOUT` *(Optional, Default: `45.0`)*: Read timeout in seconds for Gemini API calls. Connect timeout is always 10s. Increased from 10s to fix Windows IPv6 TCP drop errors.  
  *Referenced in*: [`core/rag_config.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/rag_config.py#L38)
- `RAG_MAX_RETRIES` *(Optional, Default: `2`)*: Retry attempts per model on transient network errors (`TimeoutException`, `NetworkError`, `RemoteProtocolError`) before trying the next fallback model.  
  *Referenced in*: [`core/rag_config.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/rag_config.py#L39)
- `UPLOAD_RATE_LIMIT` *(Optional, Default: `30`)*: Max file uploads per 60-second window per IP.  
  *Referenced in*: [`app/rate_limiter.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/rate_limiter.py#L67)
- `CORS_ORIGINS` *(Optional)*: Comma-separated allowlist of origins.  
  *Referenced in*: [`app/main.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/main.py#L123)
- `GOOGLE_APPLICATION_CREDENTIALS` *(Optional)*: Path to Google Cloud service account JSON for Vision OCR.

### Frontend (`frontend/.env`)
- `VITE_API_URL`: Base URL of the running FastAPI backend (e.g. `http://localhost:8000`).  
  *Referenced in*: [`frontend/src/pages/Upload.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/pages/Upload.jsx#L12), [`Query.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/pages/Query.jsx#L12), [`Login.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/pages/Login.jsx#L12), [`Dashboard.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/pages/Dashboard.jsx#L12), [`LiveStatsSection.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/components/LiveStatsSection.jsx#L6)
- `VITE_SUPABASE_URL`: Supabase project URL.  
  *Referenced in*: [`frontend/src/lib/supabase.js`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/lib/supabase.js#L3)
- `VITE_SUPABASE_ANON_KEY`: Supabase public anon key.  
  *Referenced in*: [`frontend/src/lib/supabase.js`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/lib/supabase.js#L4)

---

## 8. Session Change Log (September 11, 2026)

### 8.1 Data-Sync Bug Fix — Subject State Across Pages

**Problem**: After uploading a PDF for subject X, navigating to Dashboard showed "please upload a PDF" because Dashboard always initialized with `'Operating Systems'` as default and fetched data for the wrong subject. Same issue between Query and Upload pages — no shared subject state.

**Root Cause**: Each page independently defaulted to `'Operating Systems'` with no cross-page state mechanism.

**Fix**:
- **`localStorage` key `campusclimb_active_subject`**: Single source of truth for active subject. Written on every subject change in Upload, Dashboard, and Query.
- **URL `?subject=` query param**: Every navigation passes `subject` in the URL so the destination page initializes correctly even on a full page reload.
- **`/api/v1/subjects` auth fix**: All three pages now correctly pass the Bearer token when fetching the subjects list (was silently 401ing before, falling back to the hardcoded static list).
- **Upload → Dashboard navigation**: Changed from React Router `state` (lost on reload) to `navigate('/dashboard?subject=...')` + `localStorage.setItem()`.

**Files**: [`Upload.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/pages/Upload.jsx), [`Dashboard.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/pages/Dashboard.jsx), [`Query.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/pages/Query.jsx)

---

### 8.2 Query Page Full Overhaul

[`frontend/src/pages/Query.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/pages/Query.jsx) rewritten to 1412 lines with these major additions:

#### Three-Column Layout
| Column | Content |
|---|---|
| Left sidebar | **NotebookLM-style Sources Panel** — per-file checkboxes, select/deselect all, delete source, subject selector |
| Center (2 cols) | Query input + voice button + auto-speak toggle + full result card |
| Right sidebar | Session history (last 8 queries, click to reload) |

#### Voice State Machine (`IDLE → LISTENING → THINKING → SPEAKING → LISTENING`)
- Single mic button controls the entire conversational loop.
- `isVoiceModeRef` (React ref, not state) prevents stale closure bugs in async Speech API callbacks.
- `activeUtteranceRef` holds the live `SpeechSynthesisUtterance` — prevents Chrome's GC bug that silently kills mid-sentence speech.
- Pause/resume controls appear while speaking.

#### Subject Sync Logic
```js
// Priority: URL param → localStorage → 'Operating Systems'
const initialSubject = searchParams.get('subject')
  || localStorage.getItem('campusclimb_active_subject')
  || 'Operating Systems';

// Every change writes both:
localStorage.setItem('campusclimb_active_subject', subj);
setSearchParams({ subject: subj }, { replace: true });
```

#### Source-Filtered Queries
Selected source IDs from the sidebar are included in every query payload:
```js
{ query, subject, language: 'auto', selected_source_ids: [...], chat_history: [...] }
```
Last 4 history items sent as chat context for conversational follow-up resolution.

#### Result Card Features
- Answer section with inline clickable citation chips `[1]` → opens snippet modal.
- Concept Explanation section.
- Mermaid diagram rendering (via `mermaid` package, same as Dashboard).
- Source citations grid with similarity score.
- Suggested follow-up question chips.
- "Read Aloud" button + Copy button on every result.

---

### 8.3 Gemini API Network Retry Hardening

**Problem**: `stream reading error: wsarecv: A connection attempt failed` — Windows IPv6 TCP mid-stream RST on `generativelanguage.googleapis.com`. Old code did `except (TimeoutException, NetworkError): break`, abandoning the model with zero retries.

**Fix** in [`core/rag_engine.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/rag_engine.py) `_call_gemini_json()`:

| Dimension | Before | After |
|---|---|---|
| Timeout object | `timeout=10.0` (flat) | `httpx.Timeout(connect=10s, read=45s, write=10s, pool=5s)` |
| On `TimeoutException` | `break` → gave up | Exponential backoff retry (0.5s, 1s), then next model |
| Also catches | `TimeoutException, NetworkError` | + `RemoteProtocolError` (Windows stream RST) |
| `MAX_RETRIES` default | `1` | `2` |
| `HTTP_TIMEOUT_SECONDS` default | `10.0` | `45.0` |

**New `.env` entries** (explicitly set to override defaults):
```
RAG_HTTP_TIMEOUT=45.0
RAG_MAX_RETRIES=2
```

**Files**: [`core/rag_engine.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/rag_engine.py), [`core/rag_config.py`](file:///c:/Users/rahul/Downloads/CampusClimb/core/rag_config.py), [`.env`](file:///c:/Users/rahul/Downloads/CampusClimb/.env)

---

### 8.4 Voice Interaction Technical Audit

Full audit of the voice stack. No external audio libraries are used anywhere in the project.

| Layer | Technology | Detail |
|---|---|---|
| STT | Web Speech API | `lang='en-IN'`, `continuous=false`, `interimResults=false` |
| TTS | Web Speech Synthesis | `rate=1.0`, `pitch=1.0`, system OS voice |
| Audio recording | ❌ None | No `MediaRecorder`, no `getUserMedia` |
| Audio playback | ❌ None | No `<audio>` element, no Web Audio API |
| Backend audio | ❌ None | No `pyaudio`, `whisper`, `torchaudio` in requirements.txt |
| Response delivery | ❌ Not streamed | Complete JSON block, 9–36s latency before first word |

**Deficiencies** → tracked in Section 5 (Known Issues #2–5).

**Recommended free upgrades** (not yet implemented):
- Sentence-chunk TTS to fix Chrome truncation (zero dependencies, pure frontend).
- Read `answer + explanation` in one speech flow (one-line fix).
- Google Cloud TTS WaveNet free tier (4M chars/month) for neural voice.
- ElevenLabs free tier (10k chars/month) for emotional voice.

---

### 8.5 Anti-Hardcoding Audit — PASS

Ran [`scratch/audit_hardcoding.py`](file:///c:/Users/rahul/Downloads/CampusClimb/scratch/audit_hardcoding.py) scanning `core/`, `app/`, `frontend/src/` for domain-specific terms.

**Result: PASS — 0 production hardcoded rules.**

| Category | Count |
|---|---|
| D — Production hardcoded routing rules | **0** ✅ |
| A — Test fixtures | 57 |
| B — Docs / comments / UI labels | 56 |
| C — Config defaults / env vars | 8 |

---

### 8.6 Delete-Source Button Accessibility & Mobile Usability Fix

- **Problem**: The delete button on source items in `Query.jsx` used `opacity-0 group-hover:opacity-100`, making it invisible on touch devices, undiscoverable on mobile, and unreachable via keyboard navigation.
- **Fix**:
  - Replaced hover-only hiding with default persistent `opacity-60`, highlighting to `opacity-100` on hover/focus.
  - Increased button footprint to $\ge 32\times 32\text{px}$ (`w-8 h-8 min-w-[32px] min-h-[32px]`) with centered icon.
  - Added explicit focus ring: `focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500/80 focus-visible:outline-offset-1`.
  - Added descriptive `aria-label={`Delete source ${src.filename}`}`.
  - Audited `Query.jsx` and `Upload.jsx`; confirmed no other action buttons use hidden hover-only patterns.
- **Verification**: Verified via Playwright automation: 32x32px measured bounding box, keyboard Tab focus detection, and mobile touch tap triggering delete confirmation dialog.

---

### 8.7 Edge-TTS Backend Neural Voice Integration & Sentence-Chunk Streaming

- **Problem**: Browser-native Web Speech Synthesis sounded robotic/synthetic, truncated responses silently on long texts (>200 words), and read only the `answer` omitting the `explanation`.
- **Backend Architecture**:
  - Added `edge-tts>=7.0.0` to `requirements.txt`.
  - Created [`app/routers/tts.py`](file:///c:/Users/rahul/Downloads/CampusClimb/app/routers/tts.py) registering `POST /api/v1/tts`.
  - Microsoft Neural Voices: `"hi-IN-SwaraNeural"` (Hindi) and `"en-IN-NeerjaNeural"` (Indian English).
  - Uses in-memory generator yielding raw MP3 frames directly into `StreamingResponse(media_type="audio/mpeg")` with header `X-TTS-Voice`.
  - Includes IPv4 socket connector (`family=socket.AF_INET`) to prevent Windows IPv6 dual-stack delays.
- **Frontend Architecture**:
  - Replaced `speechSynthesis.speak()` with HTML5 `<audio ref={audioRef} />` playing object URLs.
  - `getFullSpokenText()` combines `notice` + `answer` + `explanation`.
  - `splitIntoSentences()` chunks text on `. ! ?` and Hindi purna viram `।` (`\u0964`).
  - Escaped hyphen in bullet-stripping regex (`^[\s*•\-]+\s+`) to prevent matching Devanagari Unicode character range (`U+0900`–`U+097F`).
  - Chunks play sequentially via an active queue (`audioQueueRef`) advancing on `onEnded`.
  - Fail-safe fallback to `window.speechSynthesis` via `fallbackSpeak()` if network fails.
  - Real-time animated audio waveform, sentence chunk counter (`chunk X/Y`), Pause/Resume, and Stop controls.
- **Verification**: Verified end-to-end with real Hindi query (`"ऑपरेटिंग सिस्टम क्या है?"`), generating 6 sequential chunks totaling 299,088 valid MP3 bytes (~18 seconds of fluent neural speech) with full UI playback in Edge browser.

---

### 8.8 "Call Your AI Teacher" Live Voice State Machine & Neural Conversational Suite

- **Motivation**: Moving beyond static text queries, university students learn faster through real-time conversational dialogue in their native vernacular (Hindi, Indian English, Hinglish) grounded strictly in their uploaded lecture notes.
- **Frontend Architecture (`frontend/src/components/ai-teacher/`)**:
  - [`AITeacherCallModal.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/components/ai-teacher/AITeacherCallModal.jsx): Full-screen conversational overlay with backdrop blur, keyboard accessibility, and state machine lifecycle: `CALLING` -> `CONNECTED` -> `LISTENING` -> `THINKING` -> `SPEAKING` -> `ERROR` / `IDLE`.
  - [`TeacherOrb.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/components/ai-teacher/TeacherOrb.jsx): Organic animated visualizer representing teacher voice states (pulsing waves for speaking, rotating particles for thinking, gentle idle breathing).
  - [`CallCaptions.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/components/ai-teacher/CallCaptions.jsx): Dual real-time captioning displaying student transcript (interim + final) and teacher response with sentence-by-sentence karaoke highlighting.
  - [`CallControls.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/components/ai-teacher/CallControls.jsx): Bottom control bar featuring duration timer, mic mute/unmute, instant teacher interruption (`handleInterrupt`), language switcher (`auto` / `hi-IN` / `en-IN`), and clean call termination (`handleEndCall`).
  - [`CallQuickActions.jsx`](file:///c:/Users/rahul/Downloads/CampusClimb/frontend/src/components/ai-teacher/CallQuickActions.jsx): Context-aware 1-tap guidance pills:
    - *"Explain Simpler"* (`सरल भाषा में`): Requests beginner-friendly analogies.
    - *"Real-World Example"* (`Practical Example`): Requests concrete industrial/practical use-cases.
    - *"Explain in Hindi"* / *"English Summary"*: Dynamic bidirectional vernacular translation.
    - *"Quiz Me"* (`मुझसे Quiz लो`): Prompts the AI teacher to ask a conceptual question to test student retention.
- **Interruption & Disconnect Protection**:
  - `handleInterrupt`: Aborts pending audio fetches, drains `audioQueueRef`, resets teacher audio, and immediately re-enables microphone listening.
  - `add_security_headers` middleware in `app/main.py`: Gracefully handles client disconnects or aborted streams by returning HTTP 204 instead of throwing unhandled broken pipe exceptions.
- **Verification**: Verified live via Playwright test with real Hindi speech (`"प्रोसेस और थ्रेड में क्या मुख्य अंतर है?"`), receiving HTTP 200, 30,672 bytes of neural MP3 streaming audio, automatic follow-up listening, Quick Action execution, and clean hang-up.

---

### 8.9 Pre-Demo End-to-End Regression & Full Stack Quality Audit

- **13/13 User Flow Steps Verified Live**:
  1. Landing Page (`/`): PASS (Hero, brand assets, CTA routing).
  2. Signup: PASS (Supabase Auth user registration with unique email).
  3. Login: PASS (Authenticated session with JWT verification).
  4. Google OAuth: PASS (Google brand mark button with Supabase OAuth provider hook).
  5. PDF Upload & Dedup: PASS (`operating_systems_notes.pdf` uploaded, chunked, deduplicated with 356 duplicates filtered, auto-advanced to Step 3 PYQ).
  6. Dashboard: PASS (5 telemetry cards, clean merged notes without raw PDF artifacts, dynamic DBMS subject switching).
  7. Notes-Grounded Query: PASS (*"What is CPU scheduling and process state?"* -> 94% High confidence, `📚 From Your Notes`, 5 citation pills).
  8. General Knowledge Fallback: PASS (*"What is quantum computing qubit superposition?"* -> `⚡ General Knowledge` badge, conceptual explanation without hallucinated citations).
  9. AI Teacher Voice Call: PASS (Hindi STT, 30,672 bytes Edge-TTS audio, auto-listening, Quick Action "Explain Simpler", clean hang-up).
  10. Post-Call Query Integrity: PASS (Text query executed smoothly after call with zero DOM/audio corruption).
  11. Sign Out: PASS (Session cleared, redirected to `/login`).
  12. Console Audit: PASS/WARNING (0 fatal exceptions, 2 non-fatal Supabase registration rate-limits).
  13. Mobile Viewport (390x844): PASS (Login = 390px, Dashboard = 390px, Query = 390px, Call Modal = 390px — zero horizontal overflow).
- **Backend Test Suite**: `pytest core/tests` -> **80 / 80 passed in 20.67s (100% pass rate)**.
- **Frontend Production Build**: `npm run build` -> Clean build in **2.03s** (zero errors).
- **Security & Config**:
  - Both root `.gitignore` and `frontend/.gitignore` ignore all `.env` files (`git status --ignored -s` confirmed).
  - Re-grepped codebase for `eyJ` -> 0 hardcoded demo tokens or backdoors found.
  - Rate limiters expanded in `app/rate_limiter.py` (`ai_rate_limiter = 60 req/min`, `auth_rate_limiter = 30 req/min`).

