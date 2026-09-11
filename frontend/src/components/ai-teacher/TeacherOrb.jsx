import React from 'react';
import { motion } from 'motion/react';

/**
 * TeacherOrb: Premium abstract reactive avatar for the AI Teacher Call.
 * States: IDLE, CALLING, LISTENING, THINKING, SPEAKING
 * Built with GPU-friendly radial glows and spring motion.
 */
export default function TeacherOrb({ state = 'IDLE', isMuted = false }) {
  // Orb color and motion variants based on call state
  const getGlowColor = () => {
    switch (state) {
      case 'CALLING':
        return 'rgba(45, 212, 191, 0.35)'; // Soft teal pulse
      case 'LISTENING':
        return isMuted ? 'rgba(115, 115, 115, 0.3)' : 'rgba(239, 68, 68, 0.45)'; // Pulsing red/coral for active mic
      case 'THINKING':
        return 'rgba(245, 158, 11, 0.5)'; // Amber ripple
      case 'SPEAKING':
        return 'rgba(20, 184, 166, 0.7)'; // Vibrant teal waveform glow
      default:
        return 'rgba(45, 212, 191, 0.25)';
    }
  };

  const getCoreGradient = () => {
    switch (state) {
      case 'CALLING':
        return 'from-teal-400 via-emerald-500 to-teal-800';
      case 'LISTENING':
        return isMuted
          ? 'from-neutral-500 via-neutral-600 to-neutral-800'
          : 'from-rose-400 via-red-500 to-red-800';
      case 'THINKING':
        return 'from-amber-300 via-amber-500 to-teal-700';
      case 'SPEAKING':
        return 'from-teal-300 via-teal-500 to-cyan-800';
      default:
        return 'from-teal-400 via-teal-600 to-neutral-800';
    }
  };

  return (
    <div className="relative flex items-center justify-center w-56 h-56 sm:w-64 sm:h-64 my-2 select-none pointer-events-none">
      {/* Ambient background glow */}
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl pointer-events-none"
        animate={{
          backgroundColor: getGlowColor(),
          scale: state === 'SPEAKING' ? [1.1, 1.35, 1.1] : state === 'LISTENING' ? [1, 1.15, 1] : 1,
          opacity: state === 'THINKING' ? [0.4, 0.8, 0.4] : 0.6,
        }}
        transition={{
          repeat: Infinity,
          duration: state === 'SPEAKING' ? 1.4 : state === 'LISTENING' ? 2.0 : 3.0,
          ease: 'easeInOut',
        }}
      />

      {/* Outer Ripple Wave (Active during LISTENING & SPEAKING) */}
      {(state === 'LISTENING' || state === 'SPEAKING' || state === 'CALLING') && (
        <motion.div
          className="absolute inset-0 rounded-full border border-teal-500/20"
          animate={{
            scale: [1, 1.45],
            opacity: [0.6, 0],
          }}
          transition={{
            repeat: Infinity,
            duration: state === 'SPEAKING' ? 1.2 : 2.2,
            ease: 'easeOut',
          }}
        />
      )}

      {/* Thinking Concentric Rotating Halo */}
      {state === 'THINKING' && (
        <motion.div
          className="absolute inset-2 rounded-full border-2 border-dashed border-amber-400/40"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 6, ease: 'linear' }}
        />
      )}

      {/* Mid Layer - Translucent Energy Shell */}
      <motion.div
        className="absolute inset-6 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm"
        animate={{
          scale: state === 'SPEAKING' ? [0.96, 1.06, 0.96] : [0.98, 1.02, 0.98],
          rotate: state === 'THINKING' ? -360 : 0,
        }}
        transition={{
          scale: { repeat: Infinity, duration: 2.0, ease: 'easeInOut' },
          rotate: { repeat: Infinity, duration: 12, ease: 'linear' },
        }}
      />

      {/* Glowing Inner Core Orb */}
      <motion.div
        className={`w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br ${getCoreGradient()} shadow-2xl flex items-center justify-center relative overflow-hidden`}
        animate={{
          scale:
            state === 'SPEAKING'
              ? [1, 1.1, 0.98, 1.08, 1]
              : state === 'LISTENING'
              ? [1, 1.05, 1]
              : [0.97, 1.03, 0.97],
        }}
        transition={{
          repeat: Infinity,
          duration: state === 'SPEAKING' ? 1.0 : state === 'LISTENING' ? 1.8 : 3.5,
          ease: 'easeInOut',
        }}
      >
        {/* Core specular highlight */}
        <div className="absolute top-2 left-3 w-10 h-10 rounded-full bg-white/30 blur-md pointer-events-none" />

        {/* Dynamic Inner Waveform / Activity Bars (When Speaking or Listening) */}
        {state === 'SPEAKING' && (
          <div className="flex items-center gap-1.5 z-10">
            {[0.4, 0.9, 0.6, 1.0, 0.7, 0.85, 0.5].map((h, i) => (
              <motion.span
                key={i}
                className="w-1.5 bg-white/90 rounded-full"
                animate={{ height: ['8px', `${h * 32}px`, '8px'] }}
                transition={{
                  repeat: Infinity,
                  duration: 0.6 + (i % 3) * 0.2,
                  repeatType: 'reverse',
                  ease: 'easeInOut',
                }}
              />
            ))}
          </div>
        )}

        {state === 'LISTENING' && !isMuted && (
          <div className="flex items-center justify-center z-10">
            <motion.span
              className="w-4 h-4 rounded-full bg-white"
              animate={{ scale: [0.8, 1.3, 0.8], opacity: [0.8, 1, 0.8] }}
              transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            />
          </div>
        )}

        {state === 'THINKING' && (
          <div className="flex items-center gap-1 z-10">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-2 h-2 rounded-full bg-white"
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
              />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
