import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { Phone, PhoneOff, AlertTriangle, BookOpen } from 'lucide-react';
import TeacherOrb from './TeacherOrb';
import CallCaptions from './CallCaptions';
import CallControls from './CallControls';
import CallQuickActions from './CallQuickActions';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Strips citation tags, markdown formatting, and raw URLs for natural speech synthesis
 */
function cleanTextForTTS(text) {
  if (!text) return '';
  let cleaned = text;
  cleaned = cleaned.replace(/\[\d+\]/g, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/#{1,6}\s+/g, '');
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
  // Safe bullet stripping with escaped hyphen to avoid Unicode range collision on Devanagari
  cleaned = cleaned.replace(/^[\s*•\-]+\s+/gm, '');
  cleaned = cleaned.replace(/https?:\/\/\S+/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

/**
 * Splits text into sentence chunks on punctuation including Devanagari purna viram
 */
function splitIntoSentences(text) {
  if (!text) return [];
  const cleaned = cleanTextForTTS(text);
  if (!cleaned) return [];

  const rawChunks = cleaned
    .replace(/([.!?\u0964]+)(\s+|$)/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawChunks.length === 0) return [cleaned];

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
 * AITeacherCallModal: The full-screen production "Call Your AI Teacher" experience.
 * Manages the live state machine, STT, agent querying, Edge-TTS streaming, and continuous follow-ups.
 */
export default function AITeacherCallModal({
  isOpen = false,
  onClose,
  subject = 'Operating Systems',
  selectedSourceIds = [],
  token = null,
  initialHistory = [],
  onSyncHistory,
}) {
  // Call State Machine: 'CALLING' | 'CONNECTED' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR'
  const [callState, setCallState] = useState('CALLING');
  const [connectedAt, setConnectedAt] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Conversation & Caption States
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [teacherText, setTeacherText] = useState('');
  const [currentSentence, setCurrentSentence] = useState('');
  const [groundingMode, setGroundingMode] = useState(null);
  const [matchedTopic, setMatchedTopic] = useState('');
  const [sttLanguage, setSttLanguage] = useState('auto'); // 'auto' | 'hi-IN' | 'en-IN'

  // History accumulated during the call
  const callHistoryRef = useRef([...initialHistory]);

  // Audio & Speech Queue Refs
  const audioRef = useRef(null);
  const audioQueueRef = useRef([]);
  const currentAudioUrlRef = useRef(null);
  const activeAbortControllerRef = useRef(null);
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(false);
  const playNextChunkRef = useRef(null);
  const isMountedRef = useRef(true);

  // Safety Timeout Guards
  const stateTimeoutRef = useRef(null);

  const clearSafetyTimeout = useCallback(() => {
    if (stateTimeoutRef.current) {
      clearTimeout(stateTimeoutRef.current);
      stateTimeoutRef.current = null;
    }
  }, []);

  const setSafetyTimeout = useCallback(
    (nextState, timeoutMs = 20000, fallbackMsg = '') => {
      clearSafetyTimeout();
      stateTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        console.warn(`Call state safety timeout fired for state: ${callState} -> transitioning to ${nextState}`);
        if (fallbackMsg) setErrorMessage(fallbackMsg);
        setCallState(nextState);
      }, timeoutMs);
    },
    [callState, clearSafetyTimeout]
  );

  /**
   * Stop active speech playback and clear pending TTS queue
   */
  const stopAudioPlayback = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    audioQueueRef.current = [];
    setCurrentSentence('');

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  /**
   * Browser SpeechSynthesis fallback in case backend Edge-TTS is unreachable
   */
  const fallbackSpeak = useCallback((sentence, lang) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      if (playNextChunkRef.current) playNextChunkRef.current();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(sentence);
      const isHindi = /[\u0900-\u097F]/.test(sentence) || (lang && lang.toLowerCase().includes('hi'));
      utterance.lang = isHindi ? 'hi-IN' : 'en-IN';

      utterance.onend = () => {
        if (playNextChunkRef.current) playNextChunkRef.current();
      };
      utterance.onerror = () => {
        if (playNextChunkRef.current) playNextChunkRef.current();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      if (playNextChunkRef.current) playNextChunkRef.current();
    }
  }, []);

  /**
   * Play next sentence chunk from audioQueueRef sequentially
   */
  const playNextChunk = useCallback(async () => {
    if (audioQueueRef.current.length === 0) {
      // Completed full spoken response -> Transition automatically to LISTENING
      clearSafetyTimeout();
      setCurrentSentence('');
      setCallState('LISTENING');
      return;
    }

    const chunkText = audioQueueRef.current.shift();
    setCurrentSentence(chunkText);
    setCallState('SPEAKING');

    // Set safety timeout in case audio stalls
    setSafetyTimeout('LISTENING', 25000);

    const controller = new AbortController();
    activeAbortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const isHindi =
        /[\u0900-\u097F]/.test(chunkText) ||
        (sttLanguage && sttLanguage.includes('hi'));

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

      if (!res.ok) throw new Error(`TTS status ${res.status}`);

      const audioBlob = await res.blob();
      if (!audioBlob || audioBlob.size === 0) throw new Error('Empty audio');

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
      if (err.name === 'AbortError') return;
      console.warn('Backend TTS failed in call modal, falling back to browser voice:', err);
      fallbackSpeak(chunkText, sttLanguage);
    }
  }, [sttLanguage, fallbackSpeak, clearSafetyTimeout, setSafetyTimeout]);

  useEffect(() => {
    playNextChunkRef.current = playNextChunk;
  }, [playNextChunk]);

  /**
   * Speak the full answer + explanation via sequential Edge-TTS
   */
  const speakAnswer = useCallback(
    (fullText) => {
      stopAudioPlayback();
      const chunks = splitIntoSentences(fullText);
      if (chunks.length === 0) {
        setCallState('LISTENING');
        return;
      }

      audioQueueRef.current = [...chunks];
      if (playNextChunkRef.current) {
        playNextChunkRef.current();
      }
    },
    [stopAudioPlayback]
  );

  /**
   * Execute student query against existing `/api/v1/agent/query`
   */
  const executeQuery = useCallback(
    async (spokenQuery) => {
      if (!spokenQuery || !spokenQuery.trim()) {
        setCallState('LISTENING');
        return;
      }

      stopAudioPlayback();
      setCallState('THINKING');
      setTranscript(spokenQuery);
      setInterimTranscript('');
      setErrorMessage('');

      // Safety timeout on THINKING (18s) to prevent frozen UI if LLM times out
      setSafetyTimeout('ERROR', 18000, 'The teacher is taking longer than expected. Tap to try again.');

      // Build chat history from past call turns (last 4 items)
      const chatHistoryPayload = callHistoryRef.current
        .slice(0, 4)
        .map((h) => [
          { role: 'user', content: h.query },
          { role: 'assistant', content: h.data?.answer || '' },
        ])
        .flat();

      try {
        const res = await axios.post(
          `${API_BASE_URL}/api/v1/agent/query`,
          {
            query: spokenQuery,
            subject: subject,
            language: sttLanguage === 'hi-IN' ? 'Hindi' : 'auto',
            selected_source_ids: selectedSourceIds,
            chat_history: chatHistoryPayload,
          },
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );

        clearSafetyTimeout();
        const data = res.data;

        // Grounding status
        setGroundingMode(data.source_type === 'notes' && !data.fallback_used ? 'notes' : 'general');
        setMatchedTopic(data.matched_topic || '');

        // Compose full spoken text: notice + answer + explanation
        const parts = [];
        if (data.fallback_used && data.notice) parts.push(data.notice.trim());
        if (data.answer) parts.push(data.answer.trim());
        if (data.explanation) parts.push(data.explanation.trim());
        const fullSpoken = parts.join(' ');

        setTeacherText(fullSpoken);

        // Update call history
        const newEntry = { query: spokenQuery, subject, data, id: Date.now() };
        callHistoryRef.current = [newEntry, ...callHistoryRef.current];
        if (onSyncHistory) onSyncHistory(newEntry);

        // Speak aloud
        speakAnswer(fullSpoken);
      } catch (err) {
        clearSafetyTimeout();
        console.error('Teacher call query error:', err);
        setCallState('ERROR');
        setErrorMessage('I could not reach the teacher right now. Tap the mic to try again.');
      }
    },
    [
      subject,
      selectedSourceIds,
      token,
      sttLanguage,
      stopAudioPlayback,
      speakAnswer,
      clearSafetyTimeout,
      setSafetyTimeout,
      onSyncHistory,
    ]
  );

  /**
   * Start Speech Recognition listener
   */
  const startListening = useCallback(() => {
    if (isMuted || !recognitionRef.current) return;

    try {
      stopAudioPlayback();
      setInterimTranscript('');
      // Configure STT language
      if (sttLanguage === 'hi-IN') {
        recognitionRef.current.lang = 'hi-IN';
      } else if (sttLanguage === 'en-IN') {
        recognitionRef.current.lang = 'en-IN';
      } else {
        // Auto: defaults to Indian English which recognizes Hindi loan words / Hinglish
        recognitionRef.current.lang = 'en-IN';
      }

      recognitionRef.current.start();
      isListeningRef.current = true;
      setCallState('LISTENING');
    } catch {
      // Recognition might already be running
    }
  }, [isMuted, sttLanguage, stopAudioPlayback]);

  /**
   * Stop Speech Recognition listener
   */
  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      isListeningRef.current = false;
    }
  }, []);

  /**
   * Setup Web Speech Recognition
   */
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage('Voice calling is not supported in this browser. Please use Chrome or Edge.');
      setCallState('ERROR');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
      isListeningRef.current = true;
    };

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcriptPart;
        } else {
          interim += transcriptPart;
        }
      }

      if (interim) setInterimTranscript(interim);

      if (final && final.trim()) {
        setInterimTranscript('');
        stopListening();
        executeQuery(final.trim());
      }
    };

    recognition.onerror = (e) => {
      isListeningRef.current = false;
      if (e.error === 'not-allowed') {
        setErrorMessage('Microphone access denied. Please allow microphone permissions.');
        setCallState('ERROR');
      } else if (e.error === 'no-speech') {
        // Automatically resume listening if in call
        if (callState === 'LISTENING' && !isMuted) {
          setTimeout(() => {
            if (callState === 'LISTENING' && isMountedRef.current) startListening();
          }, 400);
        }
      }
    };

    recognition.onend = () => {
      isListeningRef.current = false;
    };

    recognitionRef.current = recognition;

    // Headless / automated testing listener for simulating speech input
    const handleSimulatedSpeech = (e) => {
      if (e.detail && typeof e.detail === 'string' && e.detail.trim()) {
        setInterimTranscript('');
        stopListening();
        executeQuery(e.detail.trim());
      }
    };
    window.addEventListener('campusclimb_simulate_speech', handleSimulatedSpeech);

    // Headless / automated testing listener for speech completion
    const handleSpeechComplete = () => {
      audioQueueRef.current = [];
      stopAudioPlayback();
      clearSafetyTimeout();
      setCurrentSentence('');
      setCallState('LISTENING');
    };
    window.addEventListener('campusclimb_finish_teacher_speech', handleSpeechComplete);

    return () => {
      window.removeEventListener('campusclimb_simulate_speech', handleSimulatedSpeech);
      window.removeEventListener('campusclimb_finish_teacher_speech', handleSpeechComplete);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [callState, isMuted, executeQuery, startListening, stopListening]);

  /**
   * Lifecycle: Call Opening Sequence (Section 5)
   * IDLE -> CALLING (~1.5s) -> CONNECTED -> LISTENING
   */
  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      setCallState('CALLING');
      setErrorMessage('');
      setTranscript('');
      setInterimTranscript('');
      setTeacherText('');
      setCurrentSentence('');
      setGroundingMode(null);

      const callingTimer = setTimeout(() => {
        if (!isMountedRef.current) return;
        setCallState('CONNECTED');
        setConnectedAt(Date.now());
        // Transition to LISTENING immediately
        setTimeout(() => {
          if (!isMountedRef.current) return;
          setCallState('LISTENING');
        }, 500);
      }, 1600);

      return () => clearTimeout(callingTimer);
    } else {
      stopListening();
      stopAudioPlayback();
      clearSafetyTimeout();
    }
  }, [isOpen, clearSafetyTimeout, stopAudioPlayback, stopListening]);

  /**
   * When callState switches to LISTENING, activate speech recognition
   */
  useEffect(() => {
    if (callState === 'LISTENING' && !isMuted && isOpen) {
      const timer = setTimeout(() => {
        startListening();
      }, 200);
      return () => clearTimeout(timer);
    } else if (callState !== 'LISTENING') {
      stopListening();
    }
  }, [callState, isMuted, isOpen, startListening, stopListening]);

  /**
   * Handle Audio Ended event on <audio>
   */
  const handleAudioEnded = useCallback(() => {
    if (playNextChunkRef.current) {
      playNextChunkRef.current();
    }
  }, []);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    const onEnded = () => handleAudioEnded();
    const onError = () => handleAudioEnded();
    audioEl.addEventListener('ended', onEnded);
    audioEl.addEventListener('error', onError);
    return () => {
      audioEl.removeEventListener('ended', onEnded);
      audioEl.removeEventListener('error', onError);
    };
  }, [handleAudioEnded, isOpen]);

  /**
   * Interrupt Teacher (Section 13)
   */
  const handleInterrupt = () => {
    stopAudioPlayback();
    clearSafetyTimeout();
    setCallState('LISTENING');
    setTimeout(() => startListening(), 150);
  };

  /**
   * Toggle Mic / Mute
   */
  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (callState === 'LISTENING') {
        setTimeout(() => startListening(), 100);
      }
    } else {
      setIsMuted(true);
      stopListening();
    }
  };

  /**
   * Hang Up (Section 23)
   */
  const handleEndCall = () => {
    isMountedRef.current = false;
    clearSafetyTimeout();
    stopListening();
    stopAudioPlayback();
    setCallState('IDLE');
    setConnectedAt(null);
    if (onClose) onClose();
  };

  /**
   * Quick Action 1-tap handler (Section 15+)
   */
  const handleQuickAction = useCallback(
    (promptText, langOverride) => {
      if (callState === 'THINKING') return;
      stopAudioPlayback();
      clearSafetyTimeout();
      if (langOverride) {
        setSttLanguage(langOverride);
      }
      executeQuery(promptText);
    },
    [callState, stopAudioPlayback, clearSafetyTimeout, executeQuery]
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
        animate={{ opacity: 1, backdropFilter: 'blur(16px)' }}
        exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-neutral-950/95 text-white overflow-hidden p-4 sm:p-6 select-none"
      >
        {/* TOP BAR */}
        <div className="w-full max-w-4xl flex items-center justify-between z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Phone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                <span>AI Academic Teacher</span>
                {callState === 'CALLING' ? (
                  <span className="text-[11px] font-mono text-amber-400 animate-pulse">Connecting...</span>
                ) : (
                  <span className="text-[11px] font-mono text-teal-400">Live Call</span>
                )}
              </h2>
              <p className="text-[11px] text-neutral-400 font-mono flex items-center gap-1.5">
                <BookOpen className="w-3 h-3 text-teal-500" />
                <span>Subject: {subject}</span>
              </p>
            </div>
          </div>

          {/* Quick End / Minimize Call Button */}
          <button
            type="button"
            onClick={handleEndCall}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-900 border border-neutral-800 text-xs font-mono transition-colors cursor-pointer"
            title="End Call"
          >
            <PhoneOff className="w-4 h-4 text-red-400" />
          </button>
        </div>

        {/* CENTER CONTENT: TEACHER ORB & LIVE CAPTIONS */}
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl my-auto z-10">
          {callState === 'CALLING' ? (
            <div className="flex flex-col items-center gap-4 my-auto">
              <TeacherOrb state="CALLING" />
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="text-sm font-mono text-teal-300"
              >
                Ringing your AI Teacher...
              </motion.p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center w-full">
              <TeacherOrb state={callState} isMuted={isMuted} />
              <CallCaptions
                transcript={transcript}
                interimTranscript={interimTranscript}
                teacherText={teacherText}
                currentSentence={currentSentence}
                groundingMode={groundingMode}
                matchedTopic={matchedTopic}
                callState={callState}
              />
            </div>
          )}

          {/* Error Notice */}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 font-sans"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMessage}</span>
            </motion.div>
          )}
        </div>

        {/* BOTTOM CONTROLS & QUICK ACTIONS (Active once connected) */}
        {callState !== 'CALLING' && (
          <div className="w-full z-20 pb-2 space-y-2">
            {/* Quick Actions (Section 15+) */}
            <CallQuickActions
              onSelectAction={handleQuickAction}
              callState={callState}
              matchedTopic={matchedTopic}
              disabled={callState === 'THINKING'}
              sttLanguage={sttLanguage}
            />

            <CallControls
              callState={callState}
              isMuted={isMuted}
              onToggleMute={handleToggleMute}
              onInterrupt={handleInterrupt}
              onEndCall={handleEndCall}
              sttLanguage={sttLanguage}
              onChangeLanguage={setSttLanguage}
              connectedAt={connectedAt}
            />
          </div>
        )}

        {/* Hidden Audio Player for Edge-TTS Streaming */}
        <audio
          ref={audioRef}
          id="ai-teacher-call-audio"
          className="hidden"
          preload="auto"
          onEnded={handleAudioEnded}
          onError={() => handleAudioEnded()}
        />
      </motion.div>
    </AnimatePresence>
  );
}
