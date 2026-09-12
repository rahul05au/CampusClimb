# 🚀 CampusClimb — Post-Clone Setup Essentials

This guide contains everything required to run and collaborate on **CampusClimb** immediately after cloning the repository on a new machine or a teammate's laptop.

---

## 📌 1. Prerequisites Checklist
Before starting, ensure the machine has:
1. **Python 3.10+** (check: `python --version`)
2. **Node.js 18+ & npm** (check: `node -v` and `npm -v`)
3. **Git** (check: `git --version`)
4. **Database** (Either MySQL local server or SQLite)

---

## 🔑 2. Environment Variables Configuration (MANDATORY)

> **Why are API keys missing after clone?**  
> For security, `.env` files are in `.gitignore` so private credentials are never pushed to public GitHub repositories. You must manually create these two `.env` files.

---

### A. Root Backend `.env`
Create a file named `.env` in the root folder: `CampusClimb/.env`

```env
# =================================================================
# 1. Database Connection
# =================================================================
# Option A: MySQL (Default local setup)
DATABASE_URL=mysql+pymysql://root:your_mysql_password@localhost:3306/campusclimb_nlp

# Option B: SQLite (Zero-setup alternative if your friend doesn't have MySQL)
# DATABASE_URL=sqlite:///./campusclimb.db

# =================================================================
# 2. Supabase Authentication (Shared Project Keys)
# =================================================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_JWT_SECRET=your_supabase_jwt_secret_here

# =================================================================
# 3. Google Gemini API (Required for Agent Q&A)
# =================================================================
GEMINI_API_KEY=your_gemini_api_key_here  # Paste from team lead or get free from https://aistudio.google.com/app/apikey
GEMINI_MODEL=gemini-flash-lite-latest

# =================================================================
# 4. RAG Engine Network & Retry Settings
# =================================================================
RAG_HTTP_TIMEOUT=30.0
RAG_MAX_RETRIES=2

# =================================================================
# 5. Networking / CORS
# =================================================================
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

### B. Frontend `.env`
Create a file named `.env` inside the `frontend` folder: `CampusClimb/frontend/.env`

```env
# Backend API Base URL
VITE_API_URL=http://localhost:8000

# Supabase Auth
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

---

## 💻 3. Step-by-Step Run Instructions

### Step 1: Backend Setup (Terminal 1)

Open your terminal in the project root directory (`CampusClimb`):

```bash
# 1. Create a virtual environment
python -m venv venv

# 2. Activate the virtual environment
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Windows Command Prompt (cmd):
# .\venv\Scripts\activate.bat
# On macOS / Linux:
# source venv/bin/activate

# 3. Upgrade pip and install dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt

# 4. Initialize Database Tables
python -c "from app.database import engine, Base; import app.models; Base.metadata.create_all(bind=engine); print('Database tables successfully verified/created.')"

# 5. Start the FastAPI backend server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

> 🌐 **Backend API:** `http://localhost:8000`  
> 📑 **Interactive Swagger Docs:** `http://localhost:8000/docs`

---

### Step 2: Frontend Setup (Terminal 2)

Open a **second terminal** and navigate into the `frontend` folder:

```bash
# 1. Enter the frontend directory
cd frontend

# 2. Install dependencies
npm install

# 3. Start the Vite development server
npm run dev
```

> 🌐 **Frontend Application:** `http://localhost:5173`

---

## 🛠️ 4. Common Troubleshooting & Fixes

### 1. PowerShell Script Execution Error (`Activate.ps1 cannot be loaded`)
If Windows blocks activating the venv, run this command in PowerShell:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

### 2. `RuntimeError: DATABASE_URL environment variable is not set`
- Ensure you created the `.env` file in the **root** folder, not inside `app/` or `frontend/`.
- Ensure `DATABASE_URL` is spelled correctly without spaces around `=`.
- If MySQL is not running on your laptop, switch to SQLite:
  ```env
  DATABASE_URL=sqlite:///./campusclimb.db
  ```

### 3. Agent returns `Gemini API key is not configured`
- Ensure `GEMINI_API_KEY` is present in `CampusClimb/.env`.
- You can get a free key from [Google AI Studio](https://aistudio.google.com/app/apikey).

### 4. Port Conflicts (Port 8000 or 5173 already in use)
- Backend on different port:
  ```bash
  uvicorn app.main:app --reload --port 8001
  ```
  *(Remember to update `VITE_API_URL=http://localhost:8001` in `frontend/.env`)*
- Frontend on different port:
  ```bash
  npm run dev -- --port 5174
  ```

---

## 🤝 5. Team Git Collaboration Workflow

Follow these rules when working together to prevent conflicts:

1. **Before writing code each day**, always pull the latest changes:
   ```bash
   git pull origin main
   ```
2. **Work in Feature Branches**:
   ```bash
   # Create and switch to a feature branch
   git checkout -b feature/your-feature-name

   # Make changes, then commit
   git add .
   git commit -m "feat: describe what you built"

   # Push your branch
   git push origin feature/your-feature-name
   ```
3. **Never force push** (`git push --force`) to `main`.
4. **Never commit `.env` files** — they remain local on each machine.
