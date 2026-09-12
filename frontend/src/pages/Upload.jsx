import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Terminal, LogOut, UploadCloud, FileText, CheckCircle2,
  Sparkles, BarChart3, Layers, AlertTriangle, RefreshCw, X,
  Award, ArrowRight, User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import MobileNavigation from '../components/MobileNavigation';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Animated Count-Up Component
function AnimatedNumber({ value, duration = 1.0 }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let startTimestamp = null;
    const startValue = 0;
    const endValue = Number(value) || 0;

    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      setDisplayValue(Math.floor(progress * (endValue - startValue) + startValue));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [value, duration]);

  return <span>{displayValue}</span>;
}

// Reusable SVG Draw Check Icon Component
function DrawCheckIcon() {
  return (
    <svg className="w-4 h-4 text-black stroke-[3]" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <motion.path
        d="M20 6L9 17L4 12"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
    </svg>
  );
}

// Dynamic file size formatting helper (avoids misleading 0.00 MB for small valid PDFs)
const formatFileSize = (bytes) => {
  if (bytes === undefined || bytes === null) return '0 B';
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return '0 B';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(2)} MB`;
};

// File Preview Chip Component
function FilePreviewChip({ file, onRemove }) {
  if (!file) return null;
  const formattedSize = formatFileSize(file.size);
  return (
    <div className="flex items-center justify-between bg-neutral-900 border border-teal-500/40 rounded-lg p-3 text-xs text-neutral-200">
      <div className="flex items-center gap-2.5 truncate">
        <FileText className="w-4 h-4 text-teal-400 shrink-0" />
        <span className="truncate font-semibold">{file.name}</span>
        <span className="text-neutral-500 text-[11px] shrink-0">({formattedSize})</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="p-1 text-neutral-500 hover:text-red-400 transition-colors rounded"
        title="Remove file"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// Reusable Drag & Drop Card Component
function UploadDropZone({ onFileSelected, error, loading, progress, stageText, promptText, accept = '.pdf,application/pdf' }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const validateAndSet = (file) => {
    if (!file) return;
    if (file.size === 0) {
      onFileSelected(null, 'The selected file is empty (0 bytes). Please choose a valid PDF.');
      return;
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      onFileSelected(null, `Invalid file format "${file.name}". Only PDF documents are allowed.`);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onFileSelected(null, `File size (${formatFileSize(file.size)}) exceeds max limit of ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }
    onFileSelected(file, '');
  };

  return (
    <div className="space-y-3">
      <motion.div
        animate={{
          scale: isDragging ? 1.02 : 1,
          borderColor: isDragging ? '#14b8a6' : '#262626',
          backgroundColor: isDragging ? 'rgba(20, 184, 166, 0.08)' : 'rgba(10, 10, 10, 0.5)',
        }}
        transition={{ duration: 0.2 }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); validateAndSet(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer relative overflow-hidden"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => validateAndSet(e.target.files[0])}
        />
        <UploadCloud className="w-10 h-10 text-teal-400 mx-auto mb-3 opacity-80" />
        <p className="text-xs font-semibold text-neutral-200">
          {promptText} or <span className="text-teal-400 underline">browse</span>
        </p>
        <p className="text-[10px] text-neutral-500 mt-1">PDF format only (Max {MAX_FILE_SIZE_MB}MB)</p>
      </motion.div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="space-y-2 pt-1">
          <div className="flex justify-between text-[11px] text-neutral-400">
            <span>
              {stageText === 'uploading' || !stageText
                ? 'Uploading file to server...'
                : stageText === 'extracting'
                ? 'Extracting text from PDF (native fast engine)...'
                : stageText === 'chunking'
                ? 'Chunking & reconstructing sentences...'
                : stageText === 'embedding'
                ? 'Generating semantic embeddings (SentenceTransformer)...'
                : stageText === 'indexing'
                ? 'Mapping topics & running deduplication...'
                : stageText === 'completed'
                ? 'Processing complete!'
                : `Processing (${stageText})...`}
            </span>
            {stageText === 'uploading' || !stageText ? (
              <span className="text-teal-400 font-semibold">{progress}%</span>
            ) : (
              <span className="text-teal-400 font-semibold animate-pulse">Processing</span>
            )}
          </div>
          <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
            {stageText === 'uploading' || !stageText ? (
              <motion.div
                className="h-full bg-teal-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.2 }}
              />
            ) : (
              <motion.div
                className="h-full bg-teal-500 rounded-full"
                animate={{
                  x: ['-100%', '100%'],
                  width: ['30%', '60%', '30%'],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 1.4,
                  ease: 'easeInOut',
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Upload() {
  const { user, token, getToken, logout, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSubject = searchParams.get('subject') || localStorage.getItem('campusclimb_active_subject') || 'Operating Systems';
  const [subjects, setSubjects] = useState(['Operating Systems', 'DBMS', 'Computer Networks', 'Research']);
  const [selectedSubject, setSelectedSubjectState] = useState(initialSubject);

  const setSelectedSubject = (subj) => {
    setSelectedSubjectState(subj);
    localStorage.setItem('campusclimb_active_subject', subj);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('subject', subj);
      return next;
    }, { replace: true });
  };

  // Keep state in sync if URL subject param changes
  useEffect(() => {
    const paramSubj = searchParams.get('subject');
    if (paramSubj && paramSubj !== selectedSubject) {
      setSelectedSubjectState(paramSubj);
      localStorage.setItem('campusclimb_active_subject', paramSubj);
    }
  }, [searchParams]);

  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState({ 1: false, 2: false, 3: false });

  // Step 1: Syllabus
  const [syllabusFile, setSyllabusFile] = useState(null);
  const [syllabusError, setSyllabusError] = useState('');
  const [syllabusProgress, setSyllabusProgress] = useState(0);
  const [syllabusLoading, setSyllabusLoading] = useState(false);
  const [syllabusResult, setSyllabusResult] = useState(null);
  const [existingTopicCount, setExistingTopicCount] = useState(0);
  const [showReuploadDropzone, setShowReuploadDropzone] = useState(false);

  // Step 2: Notes
  const [notesFile, setNotesFile] = useState(null);
  const [notesError, setNotesError] = useState('');
  const [notesProgress, setNotesProgress] = useState(0);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesStage, setNotesStage] = useState('');
  const [notesResult, setNotesResult] = useState(null);
  const activePollRef = useRef(null);

  useEffect(() => {
    return () => {
      if (activePollRef.current) {
        clearTimeout(activePollRef.current);
        activePollRef.current = null;
      }
    };
  }, []);

  // Step 3: PYQs (Optional)
  const [pyqYear, setPyqYear] = useState(2024);
  const [pyqFile, setPyqFile] = useState(null);
  const [pyqError, setPyqError] = useState('');
  const [pyqProgress, setPyqProgress] = useState(0);
  const [pyqLoading, setPyqLoading] = useState(false);
  const [pyqResult, setPyqResult] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/login');
  }, [isAuthenticated, authLoading, navigate]);

  // Fetch status on mount and when subject changes
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/v1/status/${encodeURIComponent(selectedSubject)}`);
        if (res.data) {
          const topicCount  = res.data.topic_count || 0;
          const hasSyllabus = topicCount > 0;
          const hasNotes    = res.data.note_chunk_count > 0;
          const hasPyqs     = res.data.pyq_count > 0;

          setExistingTopicCount(topicCount);
          setCompletedSteps({ 1: hasSyllabus, 2: hasNotes, 3: hasPyqs });
          setShowReuploadDropzone(false);

          if (!hasSyllabus) setCurrentStep(1);
          else if (!hasNotes) setCurrentStep(2);
          else setCurrentStep(3);
        }
      } catch (err) {
        console.error('Status fetch failed:', err);
      }
    };
    fetchStatus();
  }, [selectedSubject]);

  // Dynamically fetch subjects from database with authentication
  useEffect(() => {
    const fetchSubjects = async () => {
      try {
        const activeToken = (await getToken?.()) || token;
        const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
        const res = await axios.get(`${API_BASE_URL}/api/v1/subjects`, { headers });
        const list = Array.isArray(res.data) ? res.data : (res.data?.subjects || []);
        if (list.length > 0) {
          setSubjects(list);
        }
      } catch (err) {
        console.error('Failed to fetch subjects:', err);
      }
    };
    if (isAuthenticated || token) {
      fetchSubjects();
    }
  }, [token, isAuthenticated, getToken]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatApiError = (err, fallback) => {
    if (!err) return fallback;
    if (err.response) {
      const status = err.response.status;
      const detail = err.response.data?.detail;
      if (status === 401) return 'Your session expired. Please sign in again.';
      if (status === 403) return "You don't have permission to access this resource.";
      if (status === 413) return typeof detail === 'string' ? detail : 'File size exceeds upload limit.';
      if (status === 422) return 'Please check the selected file/subject format.';
      if (typeof detail === 'string' && detail.trim()) return detail;
      if (detail && typeof detail === 'object') return JSON.stringify(detail);
      if (status >= 500) return 'Upload service encountered an internal error. Please retry.';
    }
    if (err.message && err.message.toLowerCase().includes('network error')) {
      return 'Connection lost. Check your internet connection and retry.';
    }
    return fallback;
  };

  // Upload Syllabus
  const handleUploadSyllabus = async () => {
    if (!syllabusFile) return;
    setSyllabusLoading(true);
    setSyllabusError('');
    setSyllabusProgress(0);

    const formData = new FormData();
    formData.append('file', syllabusFile);
    formData.append('subject', selectedSubject);

    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = {
        'Content-Type': 'multipart/form-data',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      };
      const res = await axios.post(`${API_BASE_URL}/upload/syllabus`, formData, {
        headers,
        onUploadProgress: (e) => setSyllabusProgress(Math.round((e.loaded * 100) / e.total)),
      });
      setSyllabusResult(res.data);
      setCompletedSteps((prev) => ({ ...prev, 1: true }));
      setCurrentStep(2);
    } catch (err) {
      setSyllabusError(formatApiError(err, 'Syllabus upload failed. Please check the file.'));
    } finally {
      setSyllabusLoading(false);
    }
  };

  // Upload Notes
  const handleUploadNotes = async () => {
    if (!notesFile) return;
    setNotesLoading(true);
    setNotesError('');
    setNotesProgress(0);
    setNotesStage('uploading');

    const formData = new FormData();
    formData.append('file', notesFile);
    formData.append('subject', selectedSubject);
    formData.append('student_name', user?.email || 'Student');

    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = {
        'Content-Type': 'multipart/form-data',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      };
      const res = await axios.post(`${API_BASE_URL}/upload/notes`, formData, {
        headers,
        onUploadProgress: (e) => setNotesProgress(Math.round((e.loaded * 100) / e.total)),
      });

      const initialData = res.data;
      if (initialData.status === 'COMPLETED') {
        setNotesResult(initialData);
        setCompletedSteps((prev) => ({ ...prev, 2: true }));
        setCurrentStep(3);
        setNotesStage('completed');
        setNotesLoading(false);
        return;
      }

      // If PROCESSING, poll the status endpoint until terminal outcome
      const noteId = initialData.note_id;
      if (!noteId) {
        setNotesResult(initialData);
        setCompletedSteps((prev) => ({ ...prev, 2: true }));
        setCurrentStep(3);
        setNotesLoading(false);
        return;
      }

      setNotesStage(initialData.stage || 'extracting');

      let pollAttempts = 0;
      const maxPollAttempts = 150; // up to ~3 minutes
      let pollDelay = 1000;

      const pollStatus = async () => {
        if (pollAttempts >= maxPollAttempts) {
          setNotesError('Processing is taking longer than expected. It is continuing in the background; you can check the Dashboard shortly.');
          setNotesLoading(false);
          return;
        }
        pollAttempts++;

        try {
          const authHeaders = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
          const statusRes = await axios.get(`${API_BASE_URL}/api/v1/upload/status/${noteId}`, { headers: authHeaders });
          const statusData = statusRes.data;

          if (statusData.status === 'COMPLETED') {
            setNotesResult(statusData);
            setCompletedSteps((prev) => ({ ...prev, 2: true }));
            setCurrentStep(3);
            setNotesStage('completed');
            setNotesLoading(false);
            return;
          } else if (statusData.status === 'FAILED') {
            setNotesError(statusData.error_message || 'Notes processing failed. Please check the file.');
            setNotesStage('failed');
            setNotesLoading(false);
            return;
          } else {
            // Still processing: update stage text
            setNotesStage(statusData.stage || 'indexing');
            if (pollAttempts > 20) pollDelay = 2000;
            activePollRef.current = setTimeout(pollStatus, pollDelay);
          }
        } catch (pollErr) {
          if (pollErr.response?.status === 401 || pollErr.response?.status === 404) {
            setNotesError(formatApiError(pollErr, 'Unable to verify upload status.'));
            setNotesLoading(false);
            return;
          }
          // Transient network hiccup: back off and retry
          pollDelay = 3000;
          activePollRef.current = setTimeout(pollStatus, pollDelay);
        }
      };

      activePollRef.current = setTimeout(pollStatus, pollDelay);

    } catch (err) {
      setNotesError(formatApiError(err, 'Notes upload failed. Please check the file.'));
      setNotesLoading(false);
    }
  };

  // Upload PYQs
  const handleUploadPYQs = async () => {
    if (!pyqFile) return;
    setPyqLoading(true);
    setPyqError('');
    setPyqProgress(0);

    const formData = new FormData();
    formData.append('file', pyqFile);
    formData.append('subject', selectedSubject);
    formData.append('year', pyqYear);

    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = {
        'Content-Type': 'multipart/form-data',
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      };
      const res = await axios.post(`${API_BASE_URL}/upload/pyqs`, formData, {
        headers,
        onUploadProgress: (e) => setPyqProgress(Math.round((e.loaded * 100) / e.total)),
      });
      setPyqResult(res.data);
      setCompletedSteps((prev) => ({ ...prev, 3: true }));
    } catch (err) {
      setPyqError(formatApiError(err, 'PYQs upload failed. Please check the file.'));
    } finally {
      setPyqLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    localStorage.setItem('campusclimb_active_subject', selectedSubject);
    navigate(`/dashboard?subject=${encodeURIComponent(selectedSubject)}`);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-neutral-100 font-mono flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 text-teal-400 animate-spin" />
          <span className="text-xs text-neutral-400 tracking-wider">Verifying authenticated session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app-workspace min-h-screen bg-[#0a0a0a] text-neutral-100 font-mono flex flex-col">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-[#0a0a0a]/90 backdrop-blur-md px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
            <Terminal className="w-4 h-4 text-teal-400" />
          </div>
          <span className="text-sm sm:text-base font-bold tracking-tight text-white font-mono truncate">
            CampusClimb <span className="text-xs text-teal-400 font-normal hidden sm:inline">/ Ingestion Wizard</span>
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-4 text-xs shrink-0">
          <Link
            to={`/dashboard?subject=${encodeURIComponent(selectedSubject)}`}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition-colors"
            title="Dashboard"
          >
            <span>Dashboard</span>
          </Link>
          <Link
            to={`/query?subject=${encodeURIComponent(selectedSubject)}`}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-teal-950/80 hover:bg-teal-900 border border-teal-500/30 text-teal-300 font-medium transition-colors"
            title="Query Engine"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Query Engine</span>
          </Link>
          <span className="text-neutral-400 hidden lg:inline">
            Auth: <span className="text-teal-400 font-semibold">{user?.email || 'Student'}</span>
          </span>
          <button
            onClick={handleLogout}
            aria-label="Sign Out"
            title="Sign Out"
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-red-400 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 space-y-8">
        
        {/* Subject Selector & Title */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-xs text-teal-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>CAPT-M Multi-Modal Ingestion Pipeline</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Knowledge Base Ingestion Wizard
          </h1>

          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="text-xs text-neutral-400">Target Subject:</span>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="bg-neutral-900 border border-teal-500/40 text-teal-300 text-xs font-semibold rounded-lg px-3 py-1.5 outline-none cursor-pointer focus:border-teal-400 transition-colors"
            >
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Stepper Header with Stagger & SVG Check Draw ── */}
        <div className="glass-card rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center justify-between">
            {[
              { num: 1, title: 'Syllabus PDF', sub: 'Mandatory', req: true },
              { num: 2, title: 'Lecture Notes', sub: 'Recommended', req: false },
              { num: 3, title: 'PYQ Papers', sub: 'Optional', req: false },
            ].map((step, idx) => {
              const isDone   = completedSteps[step.num];
              const isActive = currentStep === step.num;

              return (
                <React.Fragment key={step.num}>
                  {idx > 0 && <div className="w-8 h-px bg-neutral-800 shrink-0 mx-1" />}
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08, duration: 0.3 }}
                    onClick={() => setCurrentStep(step.num)}
                    className={`flex-1 flex items-center gap-3 p-2.5 rounded-lg transition-all cursor-pointer ${
                      isActive ? 'bg-teal-500/10 border border-teal-500/30' : 'hover:bg-neutral-900/60'
                    }`}
                  >
                    <div className="relative">
                      {isActive && (
                        <motion.div
                          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.2, 0.6] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          className="absolute -inset-1 rounded-full bg-teal-500/30"
                        />
                      )}
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 relative transition-all ${
                          isDone
                            ? 'bg-teal-500 text-black'
                            : isActive
                            ? 'bg-teal-600 text-white ring-2 ring-teal-400/50'
                            : 'bg-neutral-900 text-neutral-500 border border-neutral-800'
                        }`}
                      >
                        {isDone ? <DrawCheckIcon /> : step.num}
                      </div>
                    </div>

                    <div className="hidden sm:block min-w-0">
                      <p className={`text-xs font-semibold truncate ${isActive ? 'text-teal-400' : 'text-neutral-300'}`}>
                        {step.num}. {step.title}
                      </p>
                      <p className={`text-[10px] truncate ${step.req ? 'text-teal-400 font-semibold' : 'text-neutral-500'}`}>
                        [{step.sub}]
                      </p>
                    </div>
                  </motion.div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* ── Cards Container with Smooth Crossfade Page Transition ── */}
        <AnimatePresence mode="wait">
          
          {/* STEP 1: SYLLABUS */}
          {currentStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="glass-card rounded-xl p-6 border border-teal-500/50 space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-teal-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Step 1: Upload Syllabus PDF</h3>
                    <p className="text-[11px] text-neutral-400">Establishes topic taxonomy for {selectedSubject}. Required to run queries.</p>
                  </div>
                </div>
                {completedSteps[1] && (
                  <span className="text-[10px] bg-teal-500/10 text-teal-400 border border-teal-500/30 px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Step 1 Active
                  </span>
                )}
              </div>

              {/* Pre-loaded Syllabus State */}
              {!syllabusResult && existingTopicCount > 0 && !showReuploadDropzone && (
                <div className="space-y-4 bg-teal-950/40 p-5 rounded-lg border border-teal-500/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-teal-300 font-semibold text-xs sm:text-sm">
                      <CheckCircle2 className="w-4.5 h-4.5 text-teal-400 shrink-0" />
                      <span>✓ Syllabus already loaded ({existingTopicCount} topics active)</span>
                    </div>
                    <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2.5 py-1 rounded-full border border-teal-500/30 font-semibold">
                      {selectedSubject}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Topic taxonomy for <strong className="text-white">{selectedSubject}</strong> is active in the database. You can proceed directly to upload lecture notes or optional PYQ papers.
                  </p>

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(2)}
                      className="w-full sm:w-auto px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-teal-600/20"
                    >
                      <span>Proceed to Lecture Notes (Step 2) →</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReuploadDropzone(true)}
                      className="w-full sm:w-auto px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Re-upload / Replace Syllabus</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Upload Drop Zone (Show if no syllabus exists OR if user clicked Re-upload) */}
              {!syllabusResult && (existingTopicCount === 0 || showReuploadDropzone) && (
                <div className="space-y-4">
                  {showReuploadDropzone && existingTopicCount > 0 && (
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span>Replacing active syllabus for {selectedSubject}</span>
                      <button
                        type="button"
                        onClick={() => setShowReuploadDropzone(false)}
                        className="text-teal-400 hover:underline"
                      >
                        ← Back to Syllabus Summary
                      </button>
                    </div>
                  )}

                  <UploadDropZone
                    promptText={`Drag & drop ${selectedSubject} Syllabus PDF`}
                    error={syllabusError}
                    loading={syllabusLoading}
                    progress={syllabusProgress}
                    onFileSelected={(file, err) => { setSyllabusFile(file); setSyllabusError(err); }}
                  />

                  {syllabusFile && (
                    <div className="space-y-3">
                      <FilePreviewChip file={syllabusFile} onRemove={() => setSyllabusFile(null)} />
                      <button
                        type="button"
                        onClick={handleUploadSyllabus}
                        disabled={syllabusLoading}
                        className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 uppercase tracking-wider shadow-lg shadow-teal-600/20"
                      >
                        {syllabusLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        <span>{syllabusLoading ? 'Processing Syllabus...' : 'Parse & Embed Syllabus'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {syllabusResult && (
                <div className="space-y-4 bg-neutral-950 p-5 rounded-lg border border-teal-500/30">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 flex flex-col items-center justify-center">
                      <span className="text-2xl sm:text-3xl font-extrabold text-teal-400">
                        <AnimatedNumber value={syllabusResult.unit_count} />
                      </span>
                      <span className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold mt-1">Units Parsed</span>
                    </div>
                    <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 flex flex-col items-center justify-center">
                      <span className="text-2xl sm:text-3xl font-extrabold text-teal-400">
                        <AnimatedNumber value={syllabusResult.topic_count} />
                      </span>
                      <span className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold mt-1">Topics Embedded</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-teal-400 font-semibold">✓ Syllabus Ready</span>
                    <button
                      onClick={() => setCurrentStep(2)}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                    >
                      <span>Proceed to Notes →</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 2: LECTURE NOTES */}
          {currentStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="glass-card rounded-xl p-6 border border-teal-500/50 space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-teal-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Step 2: Upload Lecture Notes PDF</h3>
                    <p className="text-[11px] text-neutral-400">Extracts text chunks, maps to syllabus topics, and filters duplicates.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGoToDashboard}
                  className="text-xs text-teal-400 hover:text-teal-300 underline font-sans"
                >
                  Skip — go to Dashboard →
                </button>
              </div>

              {/* Authenticated User Email Banner */}
              <div className="flex items-center gap-2 bg-neutral-950 p-3 rounded-lg border border-neutral-800 text-xs text-neutral-400">
                <User className="w-4 h-4 text-teal-400 shrink-0" />
                <span>Uploading notes under contributor account: <strong className="text-neutral-200">{user?.email || 'Student'}</strong></span>
              </div>

              {!completedSteps[1] && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Notes can be uploaded directly. Once a syllabus is provided, chunks are mapped into unit topics and mastery weights automatically.</span>
                </div>
              )}

              {!notesResult && (
                <div className="space-y-4">
                  <UploadDropZone
                    promptText={`Drag & drop ${selectedSubject} Lecture Notes PDF`}
                    error={notesError}
                    loading={notesLoading}
                    progress={notesProgress}
                    stageText={notesStage}
                    onFileSelected={(file, err) => { setNotesFile(file); setNotesError(err); }}
                  />

                  {notesFile && (
                    <div className="space-y-3">
                      <FilePreviewChip file={notesFile} onRemove={() => setNotesFile(null)} />
                      <button
                        type="button"
                        onClick={handleUploadNotes}
                        disabled={notesLoading}
                        className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 uppercase tracking-wider shadow-lg shadow-teal-600/20"
                      >
                        {notesLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        <span>{notesLoading ? (notesStage ? `Processing (${notesStage})...` : 'Processing Notes...') : 'Upload & Deduplicate Notes'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {notesResult && (
                <div className="space-y-4 bg-neutral-950 p-5 rounded-lg border border-teal-500/30">
                  {notesResult.syllabus_warning && (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                      <span>{notesResult.syllabus_warning} <button type="button" onClick={() => setCurrentStep(1)} className="underline ml-1 text-amber-400 hover:text-amber-300">Upload syllabus →</button></span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 flex flex-col items-center justify-center">
                      <span className="text-2xl sm:text-3xl font-extrabold text-teal-400">
                        <AnimatedNumber value={notesResult.chunk_count} />
                      </span>
                      <span className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold mt-1">Chunks Extracted</span>
                    </div>
                    <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 flex flex-col items-center justify-center">
                      <span className="text-2xl sm:text-3xl font-extrabold text-amber-400">
                        ⚡ <AnimatedNumber value={notesResult.deduplicated} />
                      </span>
                      <span className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold mt-1">Duplicates Filtered</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={handleGoToDashboard}
                      className="text-xs text-neutral-400 hover:text-white underline"
                    >
                      Skip PYQs — View Dashboard →
                    </button>
                    <button
                      onClick={() => setCurrentStep(3)}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                    >
                      <span>Add Optional PYQs →</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 3: PYQ PAPERS (OPTIONAL) */}
          {currentStep === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="glass-card rounded-xl p-6 border border-neutral-800 space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-teal-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Step 3: Upload PYQ Paper PDF
                      <span className="text-[10px] text-teal-400 font-normal border border-teal-500/30 px-2 py-0.5 rounded-full">Optional</span>
                    </h3>
                    <p className="text-[11px] text-neutral-400">Extracts exam questions &amp; ranks topic importance weights.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleGoToDashboard}
                  className="text-xs text-teal-400 hover:text-teal-300 underline font-sans"
                >
                  Skip — go to Dashboard →
                </button>
              </div>

              {!completedSteps[1] && (
                <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-neutral-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0 text-teal-400" />
                  <span>PYQs can be uploaded at any time. Topic exam weights will be computed once a syllabus is available.</span>
                </div>
              )}

              {!pyqResult && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-neutral-400">Exam Year:</label>
                    <select
                      value={pyqYear}
                      onChange={(e) => setPyqYear(Number(e.target.value))}
                      className="bg-neutral-950 border border-neutral-800 text-teal-300 text-xs rounded-lg px-3 py-1.5 outline-none"
                    >
                      {[2024, 2023, 2022, 2021, 2020].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <UploadDropZone
                    promptText={`Drag & drop ${selectedSubject} PYQ Paper PDF`}
                    error={pyqError}
                    loading={pyqLoading}
                    progress={pyqProgress}
                    onFileSelected={(file, err) => { setPyqFile(file); setPyqError(err); }}
                  />

                  {pyqFile && (
                    <div className="space-y-3">
                      <FilePreviewChip file={pyqFile} onRemove={() => setPyqFile(null)} />
                      <button
                        type="button"
                        onClick={handleUploadPYQs}
                        disabled={pyqLoading}
                        className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 uppercase tracking-wider shadow-lg shadow-teal-600/20"
                      >
                        {pyqLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        <span>{pyqLoading ? 'Processing PYQs...' : 'Analyze & Score Topic Importance'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* PYQ Results with Staggered Growing Bars */}
              {pyqResult && (
                <div className="space-y-5 bg-neutral-950 p-5 rounded-lg border border-teal-500/30">
                  <div className="bg-neutral-900 p-4 rounded-lg border border-neutral-800 flex flex-col items-center justify-center">
                    <span className="text-2xl sm:text-3xl font-extrabold text-teal-400">
                      <AnimatedNumber value={pyqResult.question_count} />
                    </span>
                    <span className="text-[11px] text-neutral-400 uppercase tracking-wider font-semibold mt-1">Questions Analyzed</span>
                  </div>

                  {pyqResult.topic_importance?.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[11px] uppercase tracking-wider text-neutral-400">Topic Exam Weight Ranking</h4>
                      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                        {pyqResult.topic_importance.map((item, idx) => {
                          const scorePct = Math.round((item.importance_score || 0) * 100);
                          const barColor = item.importance_label === 'High' ? 'bg-teal-500' : item.importance_label === 'Medium' ? 'bg-amber-400' : 'bg-neutral-700';
                          return (
                            <div key={idx} className="bg-neutral-900 p-3 rounded-lg border border-neutral-800 space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="text-neutral-200 font-medium truncate">{item.topic_name}</span>
                                <span className="text-teal-400 font-semibold">{item.importance_label} ({item.question_count} qs)</span>
                              </div>
                              <div className="w-full h-1.5 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800">
                                <motion.div
                                  className={`h-full rounded-full ${barColor}`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.max(scorePct, 8)}%` }}
                                  transition={{ duration: 0.6, delay: idx * 0.08, ease: 'easeOut' }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGoToDashboard}
                    className="w-full py-3 bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-teal-500/30 flex items-center justify-center gap-2"
                  >
                    <span>View Dashboard →</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>

        {/* Readiness Summary Bar */}
        {completedSteps[1] && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-xl p-5 border border-teal-500/40 bg-teal-950/20 flex flex-col sm:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 text-left">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Knowledge Base Ready for {selectedSubject}</p>
                <p className="text-[11px] text-neutral-400">Syllabus is active. Notes and PYQs are optional enhancements.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGoToDashboard}
              className="px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs uppercase tracking-wider rounded-lg transition-all shadow-md shadow-teal-500/20 shrink-0 flex items-center gap-2"
            >
              <span>View Dashboard →</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}

      </main>
      <MobileNavigation subject={selectedSubject} />
    </div>
  );
}
