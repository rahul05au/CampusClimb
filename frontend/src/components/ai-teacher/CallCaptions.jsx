import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookCheck, Cpu, Sparkles } from 'lucide-react';

/**
 * CallCaptions: Renders real-time live captions for the AI Teacher Call.
 * Displays user utterances, teacher responses, grounding badge, and chunk indices.
 */
export default function CallCaptions({
  transcript = '',
  interimTranscript = '',
  teacherText = '',
  currentSentence = '',
  groundingMode = null, // 'notes' | 'general' | null
  matchedTopic = '',
  callState = 'CONNECTED',
}) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimTranscript, teacherText, currentSentence]);

  const hasContent = transcript || interimTranscript || teacherText || currentSentence;

  return (
    <div
      ref={scrollRef}
      className="w-full max-w-xl mx-auto px-4 py-3 max-h-44 sm:max-h-52 overflow-y-auto space-y-3.5 text-center transition-all scroll-smooth"
    >
      {/* Grounding Source Badge */}
      {groundingMode && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 text-[11px] font-mono select-none"
        >
          {groundingMode === 'notes' ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-950/80 text-teal-300 border border-teal-500/40 shadow-sm shadow-teal-500/10">
              <BookCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>📚 Grounded in Your Notes</span>
              {matchedTopic && <span className="text-teal-400/80">({matchedTopic})</span>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/80 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/10">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>⚡ General Academic Knowledge</span>
            </span>
          )}
        </motion.div>
      )}

      {/* User Transcript */}
      <AnimatePresence mode="wait">
        {(transcript || interimTranscript) && (
          <motion.div
            key="user-transcript"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-neutral-300 text-sm sm:text-base font-medium px-4 py-2 rounded-xl bg-white/5 border border-white/10 max-w-md mx-auto backdrop-blur-md"
          >
            <span className="text-teal-400 text-xs font-mono block mb-0.5">You</span>
            <span>{transcript || interimTranscript}</span>
            {interimTranscript && !transcript && (
              <span className="inline-block w-1.5 h-4 ml-1 bg-teal-400 animate-pulse align-middle" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thinking Indicator */}
      {callState === 'THINKING' && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 text-xs font-mono text-amber-400 py-1"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <span>Reviewing your notes and thinking...</span>
        </motion.div>
      )}

      {/* Active Listening Indicator during conversation */}
      {callState === 'LISTENING' && hasContent && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-2 text-xs font-mono text-teal-400 py-1"
        >
          <span className="inline-block w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <span>Listening... ask a follow-up or any question</span>
        </motion.div>
      )}

      {/* Teacher Live Caption */}
      <AnimatePresence mode="wait">
        {(currentSentence || teacherText) && (
          <motion.div
            key="teacher-caption"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="text-teal-100 text-base sm:text-lg font-sans font-normal leading-relaxed px-5 py-2.5 rounded-2xl bg-teal-950/40 border border-teal-500/25 shadow-lg shadow-teal-950/50"
          >
            <div className="flex items-center justify-center gap-1.5 text-xs text-teal-400 font-mono mb-1">
              <Sparkles className="w-3 h-3 text-teal-300" />
              <span>AI Teacher</span>
            </div>
            <p className="tracking-wide">
              {currentSentence || teacherText}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty / Initial state message */}
      {!hasContent && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          className="text-xs text-neutral-400 font-mono italic"
        >
          {callState === 'LISTENING'
            ? 'Speak in Hindi, English, or Hinglish... I am listening.'
            : callState === 'THINKING'
            ? 'Reviewing your notes and thinking...'
            : callState === 'SPEAKING'
            ? 'Speaking explanation...'
            : 'Connecting call...'}
        </motion.p>
      )}
    </div>
  );
}
