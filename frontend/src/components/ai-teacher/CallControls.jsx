import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, PhoneOff, Square, Globe } from 'lucide-react';

/**
 * CallControls: Renders bottom control bar for AI Teacher Call.
 * Includes mic toggle, interrupt button, language selector, duration timer, and end call button.
 */
export default function CallControls({
  callState = 'CONNECTED',
  isMuted = false,
  onToggleMute,
  onInterrupt,
  onEndCall,
  sttLanguage = 'en-IN',
  onChangeLanguage,
  connectedAt,
}) {
  const [durationSeconds, setDurationSeconds] = useState(0);

  // Call duration timer (updates once per second, zero performance overhead)
  useEffect(() => {
    if (!connectedAt) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - connectedAt) / 1000);
      setDurationSeconds(elapsed >= 0 ? elapsed : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [connectedAt]);

  const formatDuration = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-4 px-4 select-none">
      {/* Top Status Row: Timer & Language Selector */}
      <div className="flex items-center justify-between w-full text-xs font-mono text-neutral-400 px-2">
        {/* Call Timer */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
          <span className="text-teal-300 font-semibold tracking-wider">
            {formatDuration(durationSeconds)}
          </span>
        </div>

        {/* Quick Language Toggle */}
        <div className="flex items-center gap-1 bg-neutral-900/80 p-1 rounded-lg border border-neutral-800">
          <Globe className="w-3.5 h-3.5 text-neutral-400 ml-1" />
          <button
            type="button"
            onClick={() => onChangeLanguage('auto')}
            className={`px-2 py-0.5 rounded text-[11px] font-sans transition-all cursor-pointer ${
              sttLanguage === 'auto'
                ? 'bg-teal-600 text-white font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Auto-detect Hindi & English"
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => onChangeLanguage('hi-IN')}
            className={`px-2 py-0.5 rounded text-[11px] font-sans transition-all cursor-pointer ${
              sttLanguage === 'hi-IN'
                ? 'bg-teal-600 text-white font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Devanagari Hindi Speech Recognition"
          >
            हिंदी
          </button>
          <button
            type="button"
            onClick={() => onChangeLanguage('en-IN')}
            className={`px-2 py-0.5 rounded text-[11px] font-sans transition-all cursor-pointer ${
              sttLanguage === 'en-IN'
                ? 'bg-teal-600 text-white font-semibold'
                : 'text-neutral-400 hover:text-white'
            }`}
            title="Indian English Speech Recognition"
          >
            EN
          </button>
        </div>
      </div>

      {/* Main Actions Row */}
      <div className="flex items-center justify-center gap-5 sm:gap-7">
        {/* Interrupt / Stop Speaking Button (Active when Teacher is speaking) */}
        {callState === 'SPEAKING' && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            type="button"
            onClick={onInterrupt}
            className="flex items-center gap-1.5 px-3.5 py-3 rounded-full bg-neutral-800/90 hover:bg-neutral-700 text-amber-300 text-xs font-mono border border-amber-500/30 shadow-lg cursor-pointer transition-colors"
            title="Interrupt teacher and speak immediately"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Interrupt</span>
          </motion.button>
        )}

        {/* Primary Mic Toggle */}
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          type="button"
          onClick={onToggleMute}
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all shadow-xl cursor-pointer ${
            isMuted
              ? 'bg-neutral-800 text-neutral-400 border border-neutral-700'
              : callState === 'LISTENING'
              ? 'bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-red-500/30 animate-pulse'
              : 'bg-teal-600 text-white shadow-teal-500/25'
          }`}
          title={
            isMuted
              ? 'Microphone muted (tap to unmute)'
              : callState === 'LISTENING'
              ? 'Listening... (tap to mute)'
              : 'Tap to speak'
          }
        >
          {isMuted ? (
            <MicOff className="w-6 h-6 sm:w-7 sm:h-7" />
          ) : (
            <Mic className="w-6 h-6 sm:w-7 sm:h-7" />
          )}
        </motion.button>

        {/* End Call Button */}
        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          type="button"
          onClick={onEndCall}
          aria-label="End call with AI Teacher"
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-xl shadow-red-600/30 cursor-pointer transition-all border border-red-500/50"
          title="End Call and return to notes"
        >
          <PhoneOff className="w-6 h-6 sm:w-7 sm:h-7" />
        </motion.button>
      </div>

      {/* Helper text under buttons */}
      <p className="text-[11px] text-neutral-500 font-mono text-center">
        {callState === 'LISTENING'
          ? isMuted
            ? 'Mic is muted — tap mic to speak'
            : 'Listening... ask any question or follow-up'
          : callState === 'THINKING'
          ? 'Teacher is analyzing notes...'
          : callState === 'SPEAKING'
          ? 'Teacher is speaking — tap Interrupt to jump in'
          : 'Ready'}
      </p>
    </div>
  );
}
