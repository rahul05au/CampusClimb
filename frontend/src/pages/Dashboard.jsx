import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Terminal, LogOut, UploadCloud, Sparkles, Database, FileText,
  CheckCircle2, Search, ChevronDown, ChevronUp, Layers, AlertCircle,
  RefreshCw, ArrowRight, BookOpen, Zap, GitMerge, Layers3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: '#09090b',
    primaryColor: '#0d9488',
    primaryTextColor: '#f4f4f5',
    primaryBorderColor: '#14b8a6',
    lineColor: '#2dd4bf',
    secondaryColor: '#18181b',
    tertiaryColor: '#27272a',
  },
  fontFamily: 'monospace, ui-monospace, sans-serif',
});

function MermaidViewer({ chart, id }) {
  const [svgHtml, setSvgHtml] = useState('');
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      if (!chart || chart === 'NO_DIAGRAM') return;
      try {
        const uniqueId = `mermaid_${id}_${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(uniqueId, chart);
        if (isMounted) {
          setSvgHtml(svg);
          setRenderError(false);
        }
      } catch (err) {
        console.warn('[Mermaid] Failed to render diagram:', err);
        if (isMounted) setRenderError(true);
      }
    };
    renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart, id]);

  if (!chart || chart === 'NO_DIAGRAM' || renderError || !svgHtml) return null;

  return (
    <div className="mt-3 p-3 rounded-lg bg-neutral-900/90 border border-teal-500/20 overflow-x-auto">
      <div className="flex items-center gap-2 mb-2 pb-1 border-b border-neutral-800 text-[11px] font-mono text-teal-400 font-semibold">
        <Layers3 className="w-3.5 h-3.5 text-teal-400" />
        <span>Synthesized Concept Flow / Architecture Diagram</span>
      </div>
      <div
        className="flex justify-center [&>svg]:max-w-full [&>svg]:h-auto py-2"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    </div>
  );
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function Dashboard() {
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

  // Sync state if URL subject param changes
  useEffect(() => {
    const paramSubj = searchParams.get('subject');
    if (paramSubj && paramSubj !== selectedSubject) {
      setSelectedSubjectState(paramSubj);
      localStorage.setItem('campusclimb_active_subject', paramSubj);
    }
  }, [searchParams]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'High' | 'Medium' | 'Low'
  const [expandedMergedSources, setExpandedMergedSources] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Dynamically fetch subjects from database
  useEffect(() => {
    const fetchSubjects = async () => {
      const activeToken = (await getToken?.()) || token;
      if (!activeToken || !isAuthenticated) return;
      try {
        const res = await axios.get(`${API_BASE_URL}/api/v1/subjects`, {
          headers: { Authorization: `Bearer ${activeToken}` }
        });
        const list = Array.isArray(res.data) ? res.data : (res.data?.subjects || []);
        if (list.length > 0) {
          setSubjects(list);
        }
      } catch (err) {
        console.warn('Failed to load dynamic subjects in dashboard:', err);
      }
    };
    fetchSubjects();
  }, [token, isAuthenticated, getToken]);

  const fetchDashboardData = useCallback(async (subj) => {
    const activeToken = (await getToken?.()) || token;
    if (!activeToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/v1/dashboard?subject=${encodeURIComponent(subj)}`,
        { headers: { Authorization: `Bearer ${activeToken}` } }
      );
      setData(res.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      const detail = err.response?.data?.detail || 'Failed to load dashboard telemetry.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  }, [token, getToken]);

  useEffect(() => {
    if (isAuthenticated && (token || user)) {
      fetchDashboardData(selectedSubject);
    }
  }, [selectedSubject, isAuthenticated, token, user, fetchDashboardData]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleMergedSources = (cardKey) => {
    setExpandedMergedSources((prev) => ({
      ...prev,
      [cardKey]: !prev[cardKey],
    }));
  };

  // Filter topics by active tab and search query
  const filteredTopics = (data?.topics || []).filter((t) => {
    const matchesTab = activeTab === 'ALL' || t.importance_label === activeTab;
    const matchesSearch =
      !searchQuery.trim() ||
      t.topic_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.unit_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const stats = data?.stats || {
    total_notes: 0,
    total_topics: 0,
    total_pyqs: 0,
    total_user_chunks: 0,
    representative_chunks: 0,
    dedup_reduction_pct: 0,
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-100 font-mono flex flex-col selection:bg-teal-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-neutral-800 bg-[#0a0a0a]/90 backdrop-blur-md px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
            <Terminal className="w-4 h-4 text-teal-400" />
          </div>
          <span className="text-sm sm:text-base font-bold tracking-tight text-white font-mono truncate">
            CampusClimb <span className="text-xs text-teal-400 font-normal hidden sm:inline">/ Student Dashboard</span>
          </span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-4 text-xs shrink-0">
          <Link
            to={`/upload?subject=${encodeURIComponent(selectedSubject)}`}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition-colors"
            title="Upload Notes"
          >
            <UploadCloud className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Upload Notes</span>
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
            User: <span className="text-teal-400 font-semibold">{user?.email || 'Authenticated Student'}</span>
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

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Page Title & Subject Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Syllabus-Aligned Merged Notes &amp; Deduplication Telemetry
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-sans tracking-tight">
              Topic Importance &amp; Merged Notes
            </h1>
          </div>

          <div className="flex items-center gap-3 bg-neutral-950 p-2 rounded-xl border border-neutral-800">
            <span className="text-xs text-neutral-400 font-mono">Subject:</span>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="bg-neutral-900 border border-teal-500/40 text-teal-300 text-xs font-semibold rounded-lg px-3.5 py-1.5 outline-none cursor-pointer focus:border-teal-400 transition-colors"
            >
              {subjects.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Overview Metric Strip (4 Cards) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-5 rounded-xl border border-neutral-800 text-left relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <FileText className="w-5 h-5 text-teal-400" />
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Your Data</span>
            </div>
            <p className="text-3xl font-extrabold text-white">{stats.total_notes}</p>
            <p className="text-[11px] text-neutral-400 mt-1 font-sans">Uploaded Note PDFs</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="glass-card p-5 rounded-xl border border-neutral-800 text-left relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <Layers className="w-5 h-5 text-teal-400" />
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Curriculum</span>
            </div>
            <p className="text-3xl font-extrabold text-white">{stats.total_topics}</p>
            <p className="text-[11px] text-neutral-400 mt-1 font-sans">Syllabus Topics</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="glass-card p-5 rounded-xl border border-neutral-800 text-left relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <Database className="w-5 h-5 text-teal-400" />
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-mono">Global Exam</span>
            </div>
            <p className="text-3xl font-extrabold text-white">{stats.total_pyqs}</p>
            <p className="text-[11px] text-neutral-400 mt-1 font-sans">PYQ Questions Mapped</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24 }}
            className="glass-card p-5 rounded-xl border border-neutral-800 text-left relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <span className="text-[10px] text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 font-bold">Scoped</span>
            </div>
            <p className="text-3xl font-extrabold text-amber-400">{stats.dedup_reduction_pct}%</p>
            <p className="text-[11px] text-neutral-400 mt-1 font-sans">Global Dedup Reduction</p>
          </motion.div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="w-6 h-6 text-teal-400 animate-spin mx-auto" />
            <p className="text-xs text-neutral-400 font-mono">Loading telemetry for {selectedSubject}...</p>
          </div>
        )}

        {/* Dashboard Content */}
        {!loading && data && (
          <>
            {/* Search Bar & Importance Tabs */}
            <div className="glass-card rounded-xl p-4 border border-neutral-800 flex flex-col md:flex-row items-center justify-between gap-4">
              
              {/* Search Bar */}
              <div className="relative w-full md:w-80">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search topic or unit name..."
                  className="input-well w-full border border-neutral-800 focus:border-teal-500 text-neutral-200 text-xs rounded-lg px-3.5 py-2.5 pl-9 outline-none transition-colors"
                />
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>

              {/* Importance Tabs */}
              <div className="flex items-center gap-1.5 w-full md:w-auto bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs font-mono">
                {['ALL', 'High', 'Medium', 'Low'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3.5 py-1.5 rounded-md font-medium transition-all ${
                      activeTab === tab
                        ? 'bg-teal-600 text-white shadow'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {tab === 'ALL' ? 'All Importance' : `${tab} Priority`}
                  </button>
                ))}
              </div>
            </div>

            {/* Empty State: 0 User Notes for Subject */}
            {stats.total_notes === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-card rounded-2xl border border-dashed border-neutral-800 p-12 text-center space-y-4 max-w-2xl mx-auto"
              >
                <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400">
                  <BookOpen className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-white font-sans">
                  No Notes Uploaded Yet for {selectedSubject}
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed font-sans max-w-md mx-auto">
                  Upload your lecture notes PDF to extract deduplicated concept bullet points, match against PYQs, and build your personalized study dashboard.
                </p>
                <div className="pt-2">
                  <Link
                    to={`/upload?subject=${encodeURIComponent(selectedSubject)}`}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-teal-600/20"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Upload First Note PDF</span>
                  </Link>
                </div>
              </motion.div>
            ) : (
              /* Topic Cards List */
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
                  <span>Showing {filteredTopics.length} topics ({selectedSubject})</span>
                  <span>{stats.representative_chunks} merged study notes</span>
                </div>

                <div className="space-y-4">
                  <AnimatePresence>
                    {filteredTopics.map((topic, idx) => {
                      const badgeColor =
                        topic.importance_label === 'High'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : topic.importance_label === 'Medium'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-neutral-900 text-neutral-400 border-neutral-800';

                      const hasMultipleSources = topic.source_count > 1;
                      const mergedNotesList = topic.merged_notes && topic.merged_notes.length > 0 
                        ? topic.merged_notes 
                        : (topic.chunks || []).map((c) => ({
                            cluster_id: c.cluster_id || 0,
                            representative_chunk_id: c.id,
                            representative_note_id: c.note_id,
                            representative_source_note: c.source_note || `Note #${c.id}`,
                            representative_source_filename: c.source_note || `Note #${c.id}`,
                            representative_text: c.chunk_text,
                            source_count: 1,
                            merged_count: 0,
                            duplicates: [],
                          }));

                      return (
                        <motion.div
                          key={topic.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                          className="glass-card rounded-xl border border-neutral-800/90 hover:border-neutral-700 transition-colors p-5 sm:p-6 text-left font-mono"
                        >
                          {/* 1. Header row: topic_name, importance_label, Asked Nx */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800/80 pb-3.5">
                            <div>
                              <span className="text-[10px] text-neutral-500 uppercase tracking-wider block mb-1">
                                Unit {topic.unit_number}: {topic.unit_name}
                              </span>
                              <h4 className="text-base sm:text-lg font-bold text-white font-sans">
                                {topic.topic_name}
                              </h4>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold ${badgeColor}`}>
                                {topic.importance_label} Priority
                              </span>
                              <span className="text-[11px] text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded border border-teal-500/20 font-semibold">
                                Asked {topic.question_count}x
                              </span>
                              <span className="text-[11px] text-neutral-400 bg-neutral-900 px-2.5 py-0.5 rounded border border-neutral-800">
                                {topic.chunk_count} raw chunks
                              </span>
                            </div>
                          </div>

                          {/* 2. Dedup proof badge (Research Stat Strip) */}
                          {hasMultipleSources && (
                            <div className="mt-3 py-2 px-3 rounded-lg bg-teal-950/30 border border-teal-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <GitMerge className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                <span className="text-teal-300 font-semibold font-mono">
                                  Merged from {topic.source_count} sources
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-amber-400 font-bold font-mono">
                                  {topic.dedup_reduction_pct}% duplicate content removed
                                </span>
                                <span className="text-[10px] text-neutral-500 font-mono hidden sm:inline">
                                  (Union-Find · Cosine ≥ 0.85)
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Content Container */}
                          <div className="pt-4 space-y-4">
                            {mergedNotesList.length === 0 ? (
                              <p className="text-xs text-neutral-600 italic">No notes chunks mapped to this topic yet.</p>
                            ) : (
                              mergedNotesList.map((mergedNote, mIdx) => {
                                const cardKey = `${topic.id}_${mergedNote.representative_chunk_id || mergedNote.cluster_id || mIdx}`;
                                const isSourceExpanded = !!expandedMergedSources[cardKey];
                                const hasMergedDuplicates = mergedNote.duplicates && mergedNote.duplicates.length > 0;

                                return (
                                  <div
                                    key={cardKey}
                                    className="bg-neutral-950 rounded-xl border border-neutral-800/90 overflow-hidden"
                                  >
                                    {/* 3. Representative Note (Primary Content) */}
                                    <div className="p-4 sm:p-5 space-y-3">
                                      <div className="flex items-center justify-between gap-2 text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.6)]" />
                                          <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider font-mono">
                                            Representative Merged Note
                                          </span>
                                        </div>
                                        <span className="text-[10px] text-neutral-500 font-mono bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                                          Source: {mergedNote.representative_source_note}
                                        </span>
                                      </div>

                                      {/* Formatted Clean Note Display */}
                                      <div className="text-sm text-neutral-200 font-sans leading-relaxed space-y-2">
                                        {mergedNote.representative_text ? (
                                          mergedNote.representative_text.split('\n').map((line, lIdx) => {
                                            const trimmed = line.trim();
                                            if (!trimmed) return null;
                                            
                                            // Heading 3 / ###
                                            if (trimmed.startsWith('### ')) {
                                              return (
                                                <h4 key={lIdx} className="text-sm font-bold text-teal-300 pt-2 pb-1 border-b border-neutral-800/60 font-mono">
                                                  {trimmed.replace(/^###\s+/, '')}
                                                </h4>
                                              );
                                            }
                                            // Bullet point (- or • or *)
                                            if (/^[-*•]\s+/.test(trimmed)) {
                                              const content = trimmed.replace(/^[-*•]\s+/, '');
                                              const parts = content.split(/(\*\*.*?\*\*)/g);
                                              return (
                                                <div key={lIdx} className="flex items-start gap-2 text-xs sm:text-sm text-neutral-300 pl-2">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                                                  <span>
                                                    {parts.map((p, pIdx) => {
                                                      if (p.startsWith('**') && p.endsWith('**')) {
                                                        return <strong key={pIdx} className="text-neutral-100 font-semibold">{p.slice(2, -2)}</strong>;
                                                      }
                                                      return p;
                                                    })}
                                                  </span>
                                                </div>
                                              );
                                            }
                                            // Standard paragraph with bold parsing
                                            const parts = trimmed.split(/(\*\*.*?\*\*)/g);
                                            return (
                                              <p key={lIdx} className="text-xs sm:text-sm text-neutral-300">
                                                {parts.map((p, pIdx) => {
                                                  if (p.startsWith('**') && p.endsWith('**')) {
                                                    return <strong key={pIdx} className="text-neutral-100 font-semibold">{p.slice(2, -2)}</strong>;
                                                  }
                                                  return p;
                                                })}
                                              </p>
                                            );
                                          })
                                        ) : (
                                          <p className="text-xs text-neutral-500 italic">No note text available.</p>
                                        )}
                                      </div>

                                      {/* Render Mermaid Diagram if Synthesized */}
                                      {mergedNote.diagram_mermaid && (
                                        <MermaidViewer
                                          chart={mergedNote.diagram_mermaid}
                                          id={mergedNote.representative_chunk_id || cardKey}
                                        />
                                      )}

                                      {/* 4. Expandable "View merged sources" button */}
                                      {hasMergedDuplicates && (
                                        <div className="pt-2 flex items-center justify-between border-t border-neutral-800/60">
                                          <button
                                            type="button"
                                            onClick={() => toggleMergedSources(cardKey)}
                                            className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1.5 font-mono py-1 transition-colors"
                                          >
                                            <GitMerge className="w-3.5 h-3.5" />
                                            <span>
                                              {isSourceExpanded
                                                ? 'Hide merged sources'
                                                : `View ${mergedNote.duplicates.length} merged ${mergedNote.duplicates.length === 1 ? 'source' : 'sources'}`}
                                            </span>
                                            {isSourceExpanded ? (
                                              <ChevronUp className="w-3.5 h-3.5" />
                                            ) : (
                                              <ChevronDown className="w-3.5 h-3.5" />
                                            )}
                                          </button>
                                          
                                          <span className="text-[10px] text-neutral-500 font-mono">
                                            {mergedNote.duplicates.length} near-duplicate {mergedNote.duplicates.length === 1 ? 'version' : 'versions'} clustered
                                          </span>
                                        </div>
                                      )}
                                    </div>

                                    {/* 5. Smooth Framer Motion Accordion for Merged Sources */}
                                    <AnimatePresence initial={false}>
                                      {hasMergedDuplicates && isSourceExpanded && (
                                        <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: 'auto', opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                                          className="overflow-hidden border-t border-neutral-800/80 bg-neutral-900/40"
                                        >
                                          <div className="p-4 space-y-2.5">
                                            <div className="text-[11px] text-neutral-400 font-mono flex items-center gap-1.5 pb-1">
                                              <Layers3 className="w-3 h-3 text-teal-400" />
                                              <span>Near-duplicate chunks merged into this representative:</span>
                                            </div>

                                            {mergedNote.duplicates.map((dup) => (
                                              <div
                                                key={dup.id}
                                                className="bg-neutral-950/80 p-3 rounded-lg border border-neutral-800/80 text-xs space-y-1.5 font-sans"
                                              >
                                                <div className="flex items-center justify-between text-[10px] font-mono">
                                                  <span className="text-neutral-400 font-semibold">
                                                    From: {dup.source_note}
                                                  </span>
                                                  <span className="text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 font-bold">
                                                    {dup.similarity_pct}% similar
                                                  </span>
                                                </div>
                                                <p className="text-neutral-300 leading-relaxed">
                                                  {dup.chunk_text}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </>
        )}

      </main>

      {/* Sticky Bottom Query CTA Bar */}
      <footer className="sticky bottom-0 z-40 bg-[#0a0a0a]/95 backdrop-blur-md border-t border-neutral-800 py-3.5 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-neutral-300 font-mono">
            <CheckCircle2 className="w-4 h-4 text-teal-400" />
            <span>Ready to test your knowledge on {selectedSubject}?</span>
          </div>
          <Link
            to="/query"
            className="w-full sm:w-auto px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md shadow-teal-600/20"
          >
            <span>Launch Query Engine</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
