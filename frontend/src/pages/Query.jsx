import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  Terminal, LogOut, Send, Sparkles, RefreshCw,
  AlertTriangle, Clock, Trash2, Languages, BookOpen, ChevronRight,
  UploadCloud, CheckCircle2, X, Copy, Check, FileText,
  Mic, Layers, HelpCircle,
  Cpu, BookCheck, Volume2, VolumeX, Plus, Square, Pause, Play,
  PhoneCall, Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import mermaid from 'mermaid';
import AITeacherCallModal from '../components/ai-teacher/AITeacherCallModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const DEFAULT_SUBJECTS = ['Operating Systems', 'DBMS', 'Computer Networks', 'Research'];
const SAMPLE_PROMPTS = [
  'Differentiate process vs thread with time complexity',
  'Explain deadlock and its four necessary conditions',
  'What is normalization in DBMS? Explain 1NF to BCNF',
  'How does TCP three-way handshake work?',
];

// Initialize Mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    darkMode: true,
    background: '#0a0a0a',
    primaryColor: '#0f766e',
    primaryTextColor: '#f5f5f5',
    primaryBorderColor: '#14b8a6',
    lineColor: '#2dd4bf',
    secondaryColor: '#171717',
    tertiaryColor: '#262626'
  }
});

/**
 * Clean text for SpeechSynthesis & Neural edge-tts:
 * Strips citation tags [1], markdown formatting, raw code blocks, and URLs to ensure natural speech.
 */
function cleanTextForTTS(text) {
  if (!text) return '';
  let cleaned = text;
  // Remove citation markers like [1], [2]
  cleaned = cleaned.replace(/\[\d+\]/g, '');
  // Remove code blocks and mermaid diagrams
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  // Remove markdown headers, bold, italics, bullets
  cleaned = cleaned.replace(/#{1,6}\s+/g, '');
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
  cleaned = cleaned.replace(/^[\s*•\-]+\s+/gm, '');
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, '');
  // Clean multiple whitespace and newlines
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Splits text into natural sentence chunks on '.', '?', '!', and Hindi purna viram '।'
 * Groups very short fragments so speech flows smoothly without choppy gaps.
 */
function splitIntoSentences(text) {
  if (!text) return [];
  const cleaned = cleanTextForTTS(text);
  if (!cleaned) return [];

  // Match sentences ending in punctuation including Devanagari purna viram \u0964 (।)
  const rawChunks = cleaned
    .replace(/([.!?\u0964]+)(\s+|$)/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawChunks.length === 0) return [cleaned];

  // Merge overly short fragments (< 30 characters) so speech flows smoothly without choppy gaps
  const chunks = [];
  let buffer = '';

  for (const chunk of rawChunks) {
    if (buffer) {
      buffer += ' ' + chunk;
      if (buffer.length >= 40) {
        chunks.push(buffer);
        buffer = '';
      }
    } else if (chunk.length < 30) {
      buffer = chunk;
    } else {
      chunks.push(chunk);
    }
  }

  if (buffer) {
    if (chunks.length > 0) {
      chunks[chunks.length - 1] += ' ' + buffer;
    } else {
      chunks.push(buffer);
    }
  }

  return chunks.length > 0 ? chunks : [cleaned];
}

/**
 * Live audio waveform animation indicating active neural speech playback.
 * Synced directly to HTML5 Audio element playback state.
 */
function AudioWaveform({ isPlaying }) {
  const bars = [0.4, 0.9, 0.5, 1.0, 0.6, 0.85, 0.35];
  return (
    <div className="flex items-center gap-0.5 h-4 px-1" title={isPlaying ? "Audio playing" : "Audio paused"}>
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="w-0.5 rounded-full bg-teal-400"
          animate={
            isPlaying
              ? {
                  scaleY: [h * 0.35, h * 1.3, h * 0.25],
                  opacity: [0.6, 1, 0.6],
                }
              : { scaleY: 0.2, opacity: 0.3 }
          }
          transition={{
            duration: 0.55 + (i % 3) * 0.12,
            repeat: isPlaying ? Infinity : 0,
            repeatType: 'reverse',
            ease: 'easeInOut',
            delay: i * 0.07,
          }}
          style={{ height: '100%', transformOrigin: 'bottom' }}
        />
      ))}
    </div>
  );
}

function MermaidRenderer({ chart }) {
  const containerRef = useRef(null);
  const [svg, setSvg] = useState('');
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!chart || !chart.trim()) return;

    const renderChart = async () => {
      try {
        setRenderError(false);
        const uniqueId = `mermaid-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const { svg: renderedSvg } = await mermaid.render(uniqueId, chart.trim());
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err) {
        console.warn('Mermaid rendering error:', err);
        if (isMounted) {
          setRenderError(true);
        }
      }
    };

    renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (renderError || !svg) {
    return (
      <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 text-xs font-mono text-neutral-400 overflow-x-auto">
        <pre>{chart}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-wrapper bg-neutral-950/80 p-4 rounded-lg border border-teal-500/20 overflow-x-auto flex justify-center items-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function ConfidenceBar({ score, label }) {
  const pct = Math.round((score || 0) * 100);
  const color =
    pct >= 75 ? 'bg-teal-400' : pct >= 45 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2.5 w-full sm:w-48">
      <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 14 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="text-[11px] text-neutral-400 whitespace-nowrap font-mono">
        {pct}% <span className="text-neutral-600">· {label}</span>
      </span>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="glass-card rounded-xl p-6 border border-neutral-800 space-y-4 relative overflow-hidden">
      <motion.div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-teal-500/10 to-transparent"
        animate={{ translateX: ['-100%', '100%'] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="flex justify-between items-center">
        <div className="h-4 w-48 bg-neutral-900 rounded border border-neutral-800" />
        <div className="h-4 w-28 bg-neutral-900 rounded border border-neutral-800" />
      </div>
      <div className="h-20 bg-neutral-950 rounded-lg border border-neutral-800" />
      <div className="h-24 bg-neutral-950 rounded-lg border border-neutral-800" />
    </div>
  );
}

export default function Query() {
  const { user, token, getToken, logout, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef(null);

  const initialSubject = searchParams.get('subject') || localStorage.getItem('campusclimb_active_subject') || 'Operating Systems';
  const [subjects, setSubjects] = useState(DEFAULT_SUBJECTS);
  const [subject, setSubjectState] = useState(initialSubject);

  const setSubject = (subj) => {
    setSubjectState(subj);
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
    if (paramSubj && paramSubj !== subject) {
      setSubjectState(paramSubj);
      localStorage.setItem('campusclimb_active_subject', paramSubj);
    }
  }, [searchParams]);

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
        console.warn('Failed to load dynamic subjects in query engine:', err);
      }
    };
    fetchSubjects();
  }, [token, isAuthenticated, getToken]);

  const [toast, setToast] = useState(location.state?.toast || '');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  // Source selection state (NotebookLM style)
  const [availableSources, setAvailableSources] = useState([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [deletingSourceId, setDeletingSourceId] = useState(null);

  // Citation modal/drawer state
  const [activeCitation, setActiveCitation] = useState(null);
  const [copied, setCopied] = useState(false);

  // Voice State Machine: 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING'
  const [voiceStatus, setVoiceStatus] = useState('IDLE');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [totalSentencesCount, setTotalSentencesCount] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [isTeacherCallOpen, setIsTeacherCallOpen] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    return localStorage.getItem('campusclimb_autospeak') === 'true';
  });

  // Neural edge-tts audio element & queue refs
  const audioRef = useRef(null);
  const audioQueueRef = useRef([]);
  const currentAudioUrlRef = useRef(null);
  const activeAbortControllerRef = useRef(null);
  const currentLangRef = useRef('en');
  const isVoiceModeSpeakingRef = useRef(false);
  const playNextChunkRef = useRef(null);

  // Active Voice Mode flag and speech recognition ref
  const isVoiceModeRef = useRef(false);
  const recognitionRef = useRef(null);

  const handleToggleAutoSpeak = () => {
    setAutoSpeak((prev) => {
      const next = !prev;
      localStorage.setItem('campusclimb_autospeak', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate('/login');
  }, [isAuthenticated, authLoading, navigate]);

  // Helper to load/save source persistence from localStorage
  const getStorageKey = useCallback((subj) => {
    const uid = user?.id || 'guest';
    return `campusclimb_sources_${subj}_${uid}`;
  }, [user]);

  // Fetch all user sources for current subject
  const fetchSources = useCallback(async (subj = subject) => {
    const activeToken = (await getToken?.()) || token;
    if (!activeToken) return;
    setSourcesLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/v1/agent/sources?subject=${encodeURIComponent(subj)}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      const sources = res.data?.sources || [];
      setAvailableSources(sources);

      // Restore persisted selection for this subject if available
      const savedKey = getStorageKey(subj);
      const savedRaw = localStorage.getItem(savedKey);
      if (savedRaw) {
        try {
          const parsed = JSON.parse(savedRaw);
          if (Array.isArray(parsed)) {
            // Keep only IDs that still exist
            const validSaved = parsed.filter((id) => sources.some((s) => s.id === id));
            setSelectedSourceIds(validSaved);
            return;
          }
        } catch (e) {
          console.warn('Failed to parse saved sources:', e);
        }
      }
      // Default: select all sources
      const allIds = sources.map((s) => s.id);
      setSelectedSourceIds(allIds);
      localStorage.setItem(savedKey, JSON.stringify(allIds));
    } catch (err) {
      console.warn('Failed to load user sources:', err);
    } finally {
      setSourcesLoading(false);
    }
  }, [token, subject, getStorageKey]);

  useEffect(() => {
    fetchSources(subject);
  }, [subject, fetchSources]);

  // Update localStorage when selection changes
  const handleSourceSelectionChange = (newSelectedIds) => {
    setSelectedSourceIds(newSelectedIds);
    localStorage.setItem(getStorageKey(subject), JSON.stringify(newSelectedIds));
  };

  const toggleSource = (sourceId) => {
    const next = selectedSourceIds.includes(sourceId)
      ? selectedSourceIds.filter((id) => id !== sourceId)
      : [...selectedSourceIds, sourceId];
    handleSourceSelectionChange(next);
  };

  const handleSelectAllSources = () => {
    const allIds = availableSources.map((s) => s.id);
    handleSourceSelectionChange(allIds);
  };

  const handleDeselectAllSources = () => {
    handleSourceSelectionChange([]);
  };

  const handleDeleteSource = async (sourceId, sourceName) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${sourceName}"?`)) {
      return;
    }
    setDeletingSourceId(sourceId);
    try {
      await axios.delete(`${API_BASE_URL}/api/v1/agent/sources/${sourceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const remainingSources = availableSources.filter((s) => s.id !== sourceId);
      const remainingSelected = selectedSourceIds.filter((id) => id !== sourceId);
      setAvailableSources(remainingSources);
      handleSourceSelectionChange(remainingSelected);
      setToast(`Deleted "${sourceName}" successfully.`);
    } catch (err) {
      console.error('Failed to delete source:', err);
      alert('Failed to delete source. Please try again.');
    } finally {
      setDeletingSourceId(null);
    }
  };


  // Track if SpeechRecognition is actively listening
  const isListeningRef = useRef(false);

  /**
   * Helper to start listening safely without InvalidStateError
   */
  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListeningRef.current) return;
    try {
      recognitionRef.current.start();
      isListeningRef.current = true;
      setVoiceStatus('LISTENING');
    } catch (err) {
      if (err?.name === 'InvalidStateError') {
        isListeningRef.current = true;
        setVoiceStatus('LISTENING');
      } else {
        console.debug('Recognition start error:', err);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    isListeningRef.current = false;
  }, []);

  /**
   * Immediately stops all active neural audio and clears the sentence queue
   */
  const stopSpeaking = useCallback(() => {
    // 1. Abort in-flight network request
    if (activeAbortControllerRef.current) {
      try {
        activeAbortControllerRef.current.abort();
      } catch {}
      activeAbortControllerRef.current = null;
    }

    // 2. Clear sentence queue
    audioQueueRef.current = [];
    setCurrentSentenceIndex(0);
    setTotalSentencesCount(0);

    // 3. Pause and reset HTML5 audio element
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
    }

    // 4. Revoke active blob URL
    if (currentAudioUrlRef.current) {
      try {
        URL.revokeObjectURL(currentAudioUrlRef.current);
      } catch {}
      currentAudioUrlRef.current = null;
    }

    // 5. Cancel native SpeechSynthesis fallback if running
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    setIsAudioPlaying(false);
    setVoiceStatus('IDLE');
  }, []);

  // Clean up speech synthesis & audio when component unmounts
  useEffect(() => {
    return () => {
      isVoiceModeRef.current = false;
      stopSpeaking();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [stopSpeaking]);

  /**
   * Browser SpeechSynthesis fallback if edge-tts backend is unreachable or times out
   */
  const fallbackSpeak = useCallback((sentence, lang) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (playNextChunkRef.current) playNextChunkRef.current();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(sentence);
      const currentVoices = window.speechSynthesis.getVoices() || [];
      const isHindi = /[\u0900-\u097F]/.test(sentence) || (lang && lang.toLowerCase().includes('hi'));

      if (isHindi) {
        utterance.lang = 'hi-IN';
        const hVoice = currentVoices.find((v) => v.lang.startsWith('hi') || v.name.toLowerCase().includes('hindi'));
        if (hVoice) utterance.voice = hVoice;
      } else {
        utterance.lang = 'en-IN';
        const engVoice = currentVoices.find((v) => v.lang.startsWith('en-IN') || v.lang.startsWith('en'));
        if (engVoice) utterance.voice = engVoice;
      }

      utterance.onstart = () => {
        setIsAudioPlaying(true);
        setVoiceStatus('SPEAKING');
      };
      utterance.onend = () => {
        setIsAudioPlaying(false);
        if (playNextChunkRef.current) playNextChunkRef.current();
      };
      utterance.onerror = (e) => {
        console.warn('Fallback SpeechSynthesis utterance error:', e);
        setIsAudioPlaying(false);
        if (playNextChunkRef.current) playNextChunkRef.current();
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Native speak exception:', err);
      if (playNextChunkRef.current) playNextChunkRef.current();
    }
  }, []);

  /**
   * Plays the next sentence chunk from audioQueueRef sequentially
   */
  const playNextChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      // Completed full response
      setVoiceStatus('IDLE');
      setIsAudioPlaying(false);
      setCurrentSentenceIndex(0);
      setTotalSentencesCount(0);

      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }

      // Hands-free continuous loop: if user was in voice mode, resume listening
      if (isVoiceModeSpeakingRef.current && isVoiceModeRef.current) {
        startListening();
      }
      return;
    }

    const chunkText = audioQueueRef.current.shift();
    setCurrentSentenceIndex((prev) => prev + 1);
    setVoiceStatus('SPEAKING');

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000); // 10s network timeout

    try {
      const isHindi = /[\u0900-\u097F]/.test(chunkText) || (currentLangRef.current && currentLangRef.current.toLowerCase().includes('hi'));
      const res = await fetch(`${API_BASE_URL}/api/v1/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: chunkText,
          lang: isHindi ? 'hi' : 'en',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`TTS HTTP status ${res.status}`);
      }

      const audioBlob = await res.blob();
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('Received empty audio blob from /api/v1/tts');
      }

      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      currentAudioUrlRef.current = audioUrl;

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
        await audioRef.current.play();
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        // Interrupted by user
        return;
      }
      console.warn('Backend edge-tts call failed; falling back to browser SpeechSynthesis:', err);
      fallbackSpeak(chunkText, currentLangRef.current);
    }
  }, [startListening, fallbackSpeak]);

  useEffect(() => {
    playNextChunkRef.current = playNextChunk;
  }, [playNextChunk]);

  /**
   * Speak the answer aloud using backend edge-tts with sentence chunking & browser fallback
   */
  const speakAnswer = useCallback((textToSpeak, lang = 'English', fromVoiceMode = false) => {
    stopSpeaking();

    const chunks = splitIntoSentences(textToSpeak);
    if (chunks.length === 0) {
      if (fromVoiceMode && isVoiceModeRef.current) {
        startListening();
      } else {
        setVoiceStatus('IDLE');
      }
      return;
    }

    audioQueueRef.current = [...chunks];
    currentLangRef.current = lang;
    isVoiceModeSpeakingRef.current = fromVoiceMode;
    setCurrentSentenceIndex(0);
    setTotalSentencesCount(chunks.length);

    if (playNextChunkRef.current) {
      playNextChunkRef.current();
    }
  }, [stopSpeaking, startListening]);

  const handleAudioEnded = () => {
    setIsAudioPlaying(false);
    if (playNextChunkRef.current) {
      playNextChunkRef.current();
    }
  };

  const endVoiceMode = useCallback(() => {
    isVoiceModeRef.current = false;
    stopSpeaking();
    stopListening();
    setVoiceStatus('IDLE');
  }, [stopSpeaking, stopListening]);

  const togglePauseSpeech = () => {
    if (!audioRef.current) return;
    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsAudioPlaying(true);
    }
  };

  const handleLogout = () => {
    endVoiceMode();
    logout();
    navigate('/login');
  };

  /**
   * Combines result answer, explanation, and any fallback notice into a single spoken string
   */
  const getFullSpokenText = (data) => {
    if (!data) return '';
    const parts = [];
    if (data.fallback_used && data.notice) {
      parts.push(data.notice.trim());
    }
    if (data.answer) {
      parts.push(data.answer.trim());
    }
    if (data.explanation) {
      parts.push(data.explanation.trim());
    }
    return parts.join(' ');
  };

  /**
   * Main Query Execution Engine
   */
  const runQuery = async (q, subj = subject, sourceIds = selectedSourceIds, fromVoice = false) => {
    if (!q || !q.trim()) return;
    if (!fromVoice && !autoSpeak) {
      // Normal text search: cancel active speech synthesis if autoSpeak is off
      stopSpeaking();
      isVoiceModeRef.current = false;
    }

    setQuery(q);
    setLoading(true);
    setError('');
    setResult(null);
    setVoiceStatus('THINKING');

    // Build chat history context
    const chatHistoryPayload = history.slice(0, 4).map((h) => [
      { role: 'user', content: h.query },
      { role: 'assistant', content: h.data?.answer || '' }
    ]).flat();

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/v1/agent/query`,
        {
          query: q,
          subject: subj,
          language: 'auto', // Automatic language detection in backend
          selected_source_ids: sourceIds,
          chat_history: chatHistoryPayload,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setResult(res.data);
      setHistory((h) => [
        { query: q, subject: subj, data: res.data, id: Date.now() },
        ...h,
      ].slice(0, 8));

      // Speak full answer + explanation aloud if voice mode is active OR auto-speak is enabled
      if ((fromVoice && isVoiceModeRef.current) || autoSpeak) {
        const fullSpoken = getFullSpokenText(res.data);
        speakAnswer(fullSpoken, res.data.language, Boolean(fromVoice && isVoiceModeRef.current));
      } else {
        setVoiceStatus('IDLE');
      }
    } catch (err) {
      if (fromVoice && isVoiceModeRef.current) {
        startListening();
      } else {
        setVoiceStatus('IDLE');
      }
      const apiErr = err.response?.data?.detail || 'Failed to process query. Please check your connection.';
      setError(typeof apiErr === 'string' ? apiErr : JSON.stringify(apiErr));
    } finally {
      setLoading(false);
    }
  };

  const runQueryRef = useRef(runQuery);
  useEffect(() => {
    runQueryRef.current = runQuery;
  });

  // Setup Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      // Use standard speech recognition language (supports multi-accent Hindi/English)
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        isListeningRef.current = true;
        stopSpeaking();
        setVoiceStatus('LISTENING');
      };

      recognition.onresult = (event) => {
        isListeningRef.current = false;
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setQuery(transcript);
          // Run voice query and maintain voice mode
          runQueryRef.current(transcript, subject, selectedSourceIds, true);
        }
      };

      recognition.onerror = (e) => {
        isListeningRef.current = false;
        console.warn('Speech recognition error:', e);
        if (isVoiceModeRef.current) {
          // Retry listening if still in voice mode
          setTimeout(() => {
            if (isVoiceModeRef.current && !isListeningRef.current) startListening();
          }, 600);
        } else {
          setVoiceStatus('IDLE');
        }
      };

      recognition.onend = () => {
        isListeningRef.current = false;
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechSupported(false);
    }
  }, [subject, selectedSourceIds, startListening]);

  /**
   * Single Voice Mode toggle button — pressing same button terminates speaking/listening session
   */
  const toggleVoiceMode = () => {
    if (!speechSupported || !recognitionRef.current) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }

    if (voiceStatus !== 'IDLE' || isVoiceModeRef.current) {
      // User pressed button again: terminate entire voice session immediately
      endVoiceMode();
    } else {
      // User pressed button: start voice mode & begin listening
      isVoiceModeRef.current = true;
      stopSpeaking();
      startListening();
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    isVoiceModeRef.current = false;
    runQuery(query, subject, selectedSourceIds, false);
  };

  const handleCopyAnswer = () => {
    if (!result?.answer) return;
    navigator.clipboard.writeText(result.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadFromHistory = (item) => {
    stopSpeaking();
    isVoiceModeRef.current = false;
    setQuery(item.query);
    setSubject(item.subject);
    setResult(item.data);
    setError('');
  };

  // Render inline clickable citation chips in answer text
  const renderFormattedAnswer = (text, citations = []) => {
    if (!text) return null;
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const citationId = parseInt(match[1], 10);
        const cit = citations.find((c) => c.citation_id === citationId);
        return (
          <button
            key={i}
            type="button"
            aria-label={`Inspect citation ${citationId}`}
            onClick={() => cit && setActiveCitation(cit)}
            className="inline-flex items-center justify-center px-1.5 py-0.2 mx-0.5 text-[11px] font-mono font-semibold text-teal-300 bg-teal-950/80 hover:bg-teal-900 border border-teal-500/40 rounded transition-all hover:scale-105 cursor-pointer align-baseline shadow-sm shadow-teal-500/10"
            title={cit ? `Source: ${cit.source_name}` : `Citation [${citationId}]`}
          >
            [{citationId}]
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="min-h-screen bg-[#070707] text-neutral-100 flex flex-col font-sans selection:bg-teal-500/20 selection:text-teal-300">
      {/* ── Top Navbar ── */}
      <header className="border-b border-neutral-800/80 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link to="/dashboard" className="flex items-center gap-2 group shrink-0">
              <div className="p-1.5 sm:p-2 rounded-lg bg-teal-950/60 border border-teal-500/30 group-hover:border-teal-400 transition-colors">
                <Terminal className="w-4 h-4 sm:w-5 sm:h-5 text-teal-400" />
              </div>
              <span className="font-mono font-bold text-xs sm:text-sm tracking-wide text-neutral-200">
                CAMPUS<span className="text-teal-400">CLIMB</span>
              </span>
            </Link>
            <span className="text-neutral-600 font-mono text-xs hidden sm:inline">/</span>
            <span className="text-xs text-teal-400 font-mono font-semibold tracking-wider hidden sm:inline">
              AGENT Q&amp;A
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <Link
              to={`/upload?subject=${encodeURIComponent(subject)}`}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-teal-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-2 sm:px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              title="Upload Notes"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Upload Notes</span>
            </Link>
            <Link
              to={`/dashboard?subject=${encodeURIComponent(subject)}`}
              className="text-xs text-neutral-400 hover:text-white px-2 sm:px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900/50 hover:bg-neutral-800 transition-colors"
            >
              Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="p-1.5 text-neutral-400 hover:text-red-400 rounded-lg hover:bg-neutral-900 transition-colors cursor-pointer"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content Container ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* ── Left Column: NotebookLM-Style Sources Panel ── */}
          <aside className="glass-card rounded-xl border border-neutral-800 p-4 lg:sticky lg:top-24 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-400" />
                <h3 className="text-xs font-mono font-bold text-neutral-200 uppercase tracking-wider">
                  Sources ({availableSources.length})
                </h3>
              </div>
              <Link
                to={`/upload?subject=${encodeURIComponent(subject)}`}
                className="flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300 font-sans cursor-pointer"
                title="Add new course material"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </Link>
            </div>

            {/* Subject Selector for Sources */}
            <div className="space-y-1">
              <label className="text-[10px] text-neutral-500 font-mono uppercase">Notebook Subject</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs rounded-lg px-2.5 py-2 outline-none focus:border-teal-500/50 cursor-pointer"
              >
                {subjects.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Quick Bulk Select / Deselect */}
            {availableSources.length > 0 && (
              <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                <span>
                  <strong className="text-teal-400">{selectedSourceIds.length}</strong> of {availableSources.length} active
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllSources}
                    className="text-[10px] text-teal-400 hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-neutral-700">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllSources}
                    className="text-[10px] text-neutral-500 hover:text-red-400 hover:underline cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
            )}

            {/* Sources List */}
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {sourcesLoading ? (
                <div className="flex items-center gap-2 text-xs text-neutral-500 py-3">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-teal-400" />
                  <span>Loading sources...</span>
                </div>
              ) : availableSources.length === 0 ? (
                <div className="text-center py-6 px-2 bg-neutral-950/60 rounded-lg border border-dashed border-neutral-800/80 space-y-2">
                  <BookOpen className="w-5 h-5 text-neutral-600 mx-auto" />
                  <p className="text-[11px] text-neutral-500">
                    No files uploaded for {subject}.
                  </p>
                  <Link
                    to={`/upload?subject=${encodeURIComponent(subject)}`}
                    className="inline-block text-[11px] text-teal-400 hover:underline font-mono"
                  >
                    + Upload First PDF
                  </Link>
                </div>
              ) : (
                availableSources.map((src) => {
                  const isSelected = selectedSourceIds.includes(src.id);
                  const isDeleting = deletingSourceId === src.id;
                  return (
                    <div
                      key={src.id}
                      className={`group flex items-center justify-between gap-2 p-2 rounded-lg border text-xs transition-colors ${
                        isSelected
                          ? 'bg-teal-950/30 border-teal-500/40 text-neutral-200'
                          : 'bg-neutral-950/50 border-neutral-800/80 text-neutral-500 hover:border-neutral-700'
                      }`}
                    >
                      <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSource(src.id)}
                          className="mt-0.5 accent-teal-500 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-sans font-medium text-[11px] truncate" title={src.filename}>
                            {src.filename}
                          </p>
                          <div className="flex items-center gap-1.5 text-[9px] text-neutral-500 font-mono">
                            <span className="text-teal-400/80">Ready</span>
                            <span>•</span>
                            <span>{src.chunk_count} chunks</span>
                          </div>
                        </div>
                      </label>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDeleteSource(src.id, src.filename)}
                        aria-label={`Delete source ${src.filename}`}
                        className="w-8 h-8 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-md text-neutral-400 opacity-60 hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 focus:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500/80 focus-visible:outline-offset-1 transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Delete source permanently"
                      >
                        {isDeleting ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-red-400" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            
            <p className="text-[10px] text-neutral-600 font-sans leading-relaxed pt-1">
              💡 Deselecting excludes a file from search without deleting it.
            </p>
          </aside>

          {/* ── Middle Column: Q&A Interaction & Results (Spans 2 columns on lg) ── */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Toast Banner */}
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-3 bg-teal-500/10 border border-teal-500/40 p-3.5 rounded-xl text-xs text-teal-300 font-mono shadow-lg shadow-teal-500/5"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>{toast}</span>
                </div>
                <button
                  onClick={() => setToast('')}
                  className="p-1 text-teal-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}

            {/* Call Your AI Teacher CTA Banner (Section 4) */}
            <motion.div
              whileHover={{ scale: 1.008 }}
              className="relative overflow-hidden rounded-xl border border-teal-500/40 bg-gradient-to-r from-teal-950/70 via-neutral-900/90 to-teal-950/50 p-4 sm:p-5 flex items-center justify-between gap-4 shadow-xl shadow-teal-950/40 backdrop-blur-md"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 shadow-lg shadow-teal-500/20 shrink-0">
                  <PhoneCall className="w-5 h-5 text-teal-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-neutral-100 flex items-center gap-2">
                    <span>Call Your AI Teacher</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold tracking-wider">
                      LIVE VOICE
                    </span>
                  </h3>
                  <p className="text-xs text-neutral-400 font-sans mt-0.5">
                    Talk naturally with your AI Teacher using your notes in Hindi, English, or Hinglish.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  setIsTeacherCallOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold tracking-wide shadow-lg shadow-teal-600/30 transition-all cursor-pointer shrink-0"
              >
                <Phone className="w-4 h-4" />
                <span>Start Call</span>
              </button>
            </motion.div>

            {/* Query Form & Voice Loop Control */}
            <div className="glass-card rounded-xl p-5 border border-neutral-800 space-y-4 shadow-xl">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs text-teal-400">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-medium">NotebookLM-Style Dual-Mode Intelligence &amp; Live Voice</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono">
                  {/* Auto-Speak Toggle Button */}
                  <button
                    type="button"
                    onClick={handleToggleAutoSpeak}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors cursor-pointer ${
                      autoSpeak
                        ? 'bg-teal-950/80 border-teal-500/50 text-teal-300 shadow-sm shadow-teal-500/10'
                        : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                    title={autoSpeak ? 'Auto-Speak is ON: Every answer is spoken aloud' : 'Auto-Speak is OFF: Click to enable voice readout for all answers'}
                  >
                    {autoSpeak ? <Volume2 className="w-3.5 h-3.5 text-teal-400" /> : <VolumeX className="w-3.5 h-3.5 text-neutral-500" />}
                    <span>Auto-Speak: {autoSpeak ? 'ON' : 'OFF'}</span>
                  </button>

                  <div className="flex items-center gap-1 text-neutral-400">
                    <span className="text-neutral-500">Language:</span>
                    <span className="text-teal-400 font-semibold">Auto-Detect</span>
                  </div>
                </div>
              </div>

              {/* Main Query Input */}
              <form onSubmit={handleSearch} className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Ask anything (English, Hindi, or Hinglish)..."
                      className="input-well w-full border border-neutral-800 focus:border-teal-500 text-neutral-200 text-sm rounded-lg pl-4 pr-12 py-3 outline-none transition-colors font-sans"
                    />
                    {/* SINGLE PROMINENT VOICE / CALL ICON */}
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                      <button
                        type="button"
                        onClick={toggleVoiceMode}
                        aria-label={voiceStatus === 'IDLE' ? 'Start voice conversation' : 'End voice mode'}
                        className={`p-2 rounded-md transition-all cursor-pointer ${
                          voiceStatus === 'LISTENING'
                            ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/40'
                            : voiceStatus === 'SPEAKING'
                            ? 'bg-teal-500 text-white animate-bounce shadow-lg shadow-teal-500/40'
                            : voiceStatus === 'THINKING'
                            ? 'bg-amber-500/80 text-white animate-spin'
                            : 'text-neutral-400 hover:text-teal-300 hover:bg-neutral-900'
                        }`}
                        title={
                          voiceStatus === 'LISTENING'
                            ? 'Listening... Click to stop voice mode'
                            : voiceStatus === 'SPEAKING'
                            ? 'Speaking answer... Click to stop'
                            : voiceStatus === 'THINKING'
                            ? 'Analyzing query...'
                            : 'Start Voice Mode (Hands-free conversational loop)'
                        }
                      >
                        {voiceStatus === 'LISTENING' ? (
                          <Mic className="w-4 h-4 text-white" />
                        ) : voiceStatus === 'SPEAKING' ? (
                          <Volume2 className="w-4 h-4 text-white" />
                        ) : (
                          <Mic className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !query.trim()}
                    className="px-5 py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer shrink-0 shadow-md shadow-teal-600/20"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span className="hidden sm:inline">Ask</span>
                  </button>
                </div>
              </form>

              {/* Voice State Banner */}
              {voiceStatus !== 'IDLE' && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between bg-teal-950/60 border border-teal-500/30 px-3.5 py-2.5 rounded-lg text-xs text-teal-300 font-mono"
                >
                  <div className="flex items-center gap-2">
                    {voiceStatus === 'LISTENING' && (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                        <span className="text-red-400 font-semibold">🎙 Listening... Speak naturally in English, Hindi, or Hinglish</span>
                      </>
                    )}
                    {voiceStatus === 'THINKING' && (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 text-teal-400 animate-spin" />
                        <span>⏳ Resolving context &amp; generating answer...</span>
                      </>
                    )}
                    {voiceStatus === 'SPEAKING' && (
                      <div className="flex items-center gap-2.5">
                        <AudioWaveform isPlaying={isAudioPlaying} />
                        <span className="text-teal-300 font-semibold font-mono">
                          🔊 Neural Speech (edge-tts)
                        </span>
                        {totalSentencesCount > 1 && (
                          <span className="text-[10px] text-teal-400/80 bg-teal-900/50 px-1.5 py-0.5 rounded border border-teal-500/20">
                            chunk {currentSentenceIndex}/{totalSentencesCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {voiceStatus === 'SPEAKING' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={togglePauseSpeech}
                        className="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-[11px] text-neutral-300 border border-neutral-700 cursor-pointer transition-colors"
                      >
                        {isAudioPlaying ? 'Pause' : 'Resume'}
                      </button>
                      <button
                        type="button"
                        onClick={stopSpeaking}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-950/70 hover:bg-red-900 text-[11px] text-red-300 border border-red-500/40 cursor-pointer transition-colors"
                        title="Stop speech playback immediately"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>Stop</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Sample Prompt Chips */}
              {!result && !loading && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {SAMPLE_PROMPTS.map((p) => (
                    <motion.button
                      key={p}
                      whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(20, 184, 166, 0.15)' }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => runQuery(p, subject, selectedSourceIds, false)}
                      className="text-[11px] text-neutral-400 hover:text-teal-400 bg-neutral-950 hover:border-teal-500/40 border border-neutral-800 rounded-full px-3 py-1.5 transition-colors cursor-pointer font-sans"
                    >
                      {p}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* Error Banner */}
            {error && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 p-4 rounded-lg text-xs text-red-400 font-sans">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Loading Skeleton */}
            {loading && <ResultSkeleton />}

            {/* Empty State */}
            {!result && !loading && !error && (
              <div className="glass-card rounded-xl border border-dashed border-neutral-800 p-8 flex flex-col items-center text-center gap-3">
                <BookOpen className="w-6 h-6 text-neutral-600" />
                <p className="text-sm text-neutral-400 max-w-sm font-sans">
                  Ask a question from your course notes or general knowledge. CampusClimb grounds answers strictly in your uploaded notes with exact citations.
                </p>
                <p className="text-[11px] text-neutral-600 font-mono">
                  Speak naturally in English or Hinglish using the mic button ↑
                </p>
              </div>
            )}

            {/* Result Card */}
            <AnimatePresence mode="wait">
              {result && !loading && (
                <motion.div
                  key={result.matched_topic + query}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={{
                    hidden: { opacity: 0, y: 15 },
                    visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
                    exit: { opacity: 0, transition: { duration: 0.15 } }
                  }}
                  className="glass-card rounded-xl p-6 border border-teal-500/30 space-y-6 text-left relative"
                >
                  {/* Top Bar: Matched Topic, Answer Mode Badge, Confidence & Actions */}
                  <motion.div
                    variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-4"
                  >
                    <div className="flex items-center flex-wrap gap-2.5">
                      <span className="text-xs text-neutral-300 font-semibold font-mono">
                        Topic: <span className="text-teal-400">{result.matched_topic}</span>
                      </span>

                      {/* Answer Mode Badge */}
                      {result.source_type === 'notes' && !result.fallback_used ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-950/80 text-teal-300 border border-teal-500/40 shadow-sm shadow-teal-500/10 font-sans">
                          <BookCheck className="w-3.5 h-3.5 text-teal-400" />
                          <span>📚 From Your Notes</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/10 font-sans">
                          <Cpu className="w-3.5 h-3.5 text-amber-400" />
                          <span>⚡ General Knowledge</span>
                        </span>
                      )}

                      {/* Detected Language Tag */}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800">
                        <Languages className="w-3 h-3 text-teal-400" />
                        <span>{result.language}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <ConfidenceBar score={result.confidence_score} label={result.confidence_label} />

                      {/* Manual Read Aloud Button */}
                      <button
                        type="button"
                        onClick={() => (voiceStatus === 'SPEAKING' ? stopSpeaking() : speakAnswer(getFullSpokenText(result), result.language, false))}
                        aria-label={voiceStatus === 'SPEAKING' ? 'Stop reading answer aloud' : 'Read full answer and explanation aloud'}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
                          voiceStatus === 'SPEAKING'
                            ? 'bg-teal-950/90 border-teal-400 text-teal-300 shadow-md shadow-teal-500/20'
                            : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300 hover:text-teal-300'
                        }`}
                        title={voiceStatus === 'SPEAKING' ? 'Stop reading aloud' : 'Read answer and concept explanation aloud'}
                      >
                        {voiceStatus === 'SPEAKING' ? (
                          <>
                            <AudioWaveform isPlaying={isAudioPlaying} />
                            <VolumeX className="w-3.5 h-3.5 text-teal-400 ml-1" />
                            <span>Stop Audio</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-teal-400" />
                            <span>Read Aloud</span>
                          </>
                        )}
                      </button>

                      {/* Copy Answer Button */}
                      <button
                        type="button"
                        onClick={handleCopyAnswer}
                        aria-label="Copy answer to clipboard"
                        className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                        title="Copy Answer"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </motion.div>

                  {/* General Knowledge Notice Banner */}
                  {result.fallback_used && result.notice && (
                    <motion.div
                      variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                      className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-lg text-xs text-amber-300 font-sans"
                    >
                      <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{result.notice}</span>
                    </motion.div>
                  )}

                  {/* Answer Output Section */}
                  <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <h4 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-neutral-400 font-mono">
                        <Languages className="w-3 h-3" /> Answer
                      </h4>
                    </div>
                    <div className="text-sm text-neutral-200 leading-relaxed bg-neutral-950 p-4 rounded-lg border border-neutral-800 font-sans">
                      {renderFormattedAnswer(result.answer, result.citations)}
                    </div>
                  </motion.div>

                  {/* Concept Explanation */}
                  {result.explanation && (
                    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
                      <h4 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-1.5 font-mono">
                        Concept Explanation
                      </h4>
                      <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed bg-neutral-950 p-4 rounded-lg border border-neutral-800 font-sans">
                        {result.explanation}
                      </p>
                    </motion.div>
                  )}

                  {/* Mermaid Diagram */}
                  {result.diagram_mermaid && (
                    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }} className="space-y-2">
                      <h4 className="text-[11px] uppercase tracking-wider text-teal-400 flex items-center gap-1.5 font-mono">
                        <Sparkles className="w-3.5 h-3.5" /> Source Concept Diagram
                      </h4>
                      <MermaidRenderer chart={result.diagram_mermaid} />
                    </motion.div>
                  )}

                  {/* Citations List Section (Notes Mode Only) */}
                  {result.citations && result.citations.length > 0 && (
                    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
                      <h4 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1.5 font-mono">
                        <FileText className="w-3.5 h-3.5 text-teal-400" /> Grounded Source Citations ({result.citations.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {result.citations.map((c) => (
                          <div
                            key={c.citation_id}
                            onClick={() => setActiveCitation(c)}
                            className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 hover:border-teal-500/40 transition-colors cursor-pointer group flex flex-col justify-between space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-mono font-bold text-teal-400 bg-teal-950/80 px-2 py-0.5 rounded border border-teal-500/30">
                                [{c.citation_id}] {c.source_name}
                              </span>
                              {c.similarity_score && (
                                <span className="text-[10px] text-neutral-500 font-mono">
                                  {Math.round(c.similarity_score * 100)}% match
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-300 font-sans line-clamp-2">
                              {c.snippet}
                            </p>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Suggested Follow-up Questions */}
                  {result.related_questions && result.related_questions.length > 0 && (
                    <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
                      <h4 className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2 flex items-center gap-1.5 font-mono">
                        <HelpCircle className="w-3.5 h-3.5 text-teal-400" /> Suggested Follow-up Questions
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {result.related_questions.map((rq, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => runQuery(rq, subject, selectedSourceIds, false)}
                            className="text-xs text-neutral-300 hover:text-teal-300 bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-teal-500/40 rounded-lg px-3 py-2 transition-colors cursor-pointer text-left flex items-center gap-1.5 font-sans"
                          >
                            <span className="text-teal-400 text-[10px]">→</span>
                            <span>{rq}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Right Sidebar: Session History ── */}
          <aside className="glass-card rounded-xl border border-neutral-800 p-4 lg:sticky lg:top-24 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-neutral-400 font-mono">
                <Clock className="w-3.5 h-3.5" /> Session History
              </h3>
              {history.length > 0 && (
                <button
                  onClick={() => setHistory([])}
                  className="text-neutral-600 hover:text-red-400 transition-colors cursor-pointer"
                  title="Clear history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <p className="text-[11px] text-neutral-600 font-sans">
                Queries run this session will show up here for quick recall.
              </p>
            ) : (
              <div className="space-y-1.5">
                <AnimatePresence>
                  {history.map((item) => (
                    <motion.button
                      key={item.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      whileHover={{ x: 2 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => loadFromHistory(item)}
                      className="w-full text-left group flex items-center justify-between gap-2 bg-neutral-950 hover:bg-neutral-900 border border-neutral-800 hover:border-teal-500/30 rounded-lg px-3 py-2 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] text-neutral-300 truncate font-sans">{item.query}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-neutral-600 truncate font-mono">{item.subject}</span>
                          {item.data?.source_type === 'notes' ? (
                            <span className="text-[9px] text-teal-400 bg-teal-950/60 px-1 rounded font-mono">Notes</span>
                          ) : (
                            <span className="text-[9px] text-amber-400 bg-amber-950/60 px-1 rounded font-mono">General</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-neutral-700 group-hover:text-teal-400 shrink-0" />
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </aside>

        </div>
      </main>

      {/* Citation Inspection Modal */}
      <AnimatePresence>
        {activeCitation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card rounded-xl p-6 border border-teal-500/40 max-w-lg w-full bg-[#0d0d0d] shadow-2xl space-y-4 text-left"
            >
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-teal-400 bg-teal-950 px-2.5 py-1 rounded border border-teal-500/30">
                    Citation [{activeCitation.citation_id}]
                  </span>
                  <span className="text-xs text-neutral-300 font-sans font-medium truncate max-w-[200px]" title={activeCitation.source_name}>
                    {activeCitation.source_name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCitation(null)}
                  className="p-1 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                  <span>Chunk ID: #{activeCitation.chunk_id}</span>
                  {activeCitation.similarity_score && (
                    <span className="text-teal-400">Relevance: {Math.round(activeCitation.similarity_score * 100)}%</span>
                  )}
                </div>
                <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 text-xs sm:text-sm text-neutral-200 font-sans leading-relaxed max-h-60 overflow-y-auto">
                  {activeCitation.snippet}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveCitation(null)}
                  className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-300 rounded-lg border border-neutral-700 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Hidden Audio Element for Neural Edge-TTS Playback */}
      <audio
        ref={audioRef}
        className="hidden"
        preload="auto"
        onPlay={() => setIsAudioPlaying(true)}
        onPause={() => setIsAudioPlaying(false)}
        onEnded={handleAudioEnded}
        onError={(e) => {
          console.warn('Audio playback error:', e);
          setIsAudioPlaying(false);
          handleAudioEnded();
        }}
      />

      {/* AI Teacher Call Overlay Modal */}
      <AITeacherCallModal
        isOpen={isTeacherCallOpen}
        onClose={() => setIsTeacherCallOpen(false)}
        subject={subject}
        selectedSourceIds={selectedSourceIds}
        token={token}
        initialHistory={history}
        onSyncHistory={(newEntry) => setHistory((h) => [newEntry, ...h].slice(0, 8))}
      />
    </div>
  );
}
