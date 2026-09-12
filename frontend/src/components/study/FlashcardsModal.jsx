import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Layers, ChevronLeft, ChevronRight, RotateCw, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function FlashcardsModal({ isOpen, onClose, subjectId, subjectName, topicId, topicName, onCompleted }) {
  const { token, getToken } = useAuth();
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [completedAll, setCompletedAll] = useState(false);
  const [ratings, setRatings] = useState({});
  const [sessionSummary, setSessionSummary] = useState(null);

  const fetchFlashcards = useCallback(async () => {
    if ((!subjectId && !subjectName) || (!topicId && !topicName)) return;
    setLoading(true);
    setError('');
    setCards([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setCompletedAll(false);
    setRatings({});
    setSessionSummary(null);

    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      const res = await axios.post(
        `${API_BASE_URL}/api/v1/study/flashcards`,
        {
          subject_id: subjectId || null,
          subject_name: subjectName || null,
          topic_id: topicId || null,
          topic_name: topicName || null,
        },
        { headers }
      );
      setCards(res.data.cards || []);
    } catch (err) {
      console.error('Flashcards fetch error:', err);
      const detail = err.response?.data?.detail || 'Failed to synthesize grounded flashcards.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  }, [subjectId, subjectName, topicId, topicName, token, getToken]);

  useEffect(() => {
    if (isOpen) {
      fetchFlashcards();
    }
  }, [isOpen, fetchFlashcards]);

  const markCompleted = async (finalRatingsMap) => {
    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      const ratingsPayload = cards.map((c) => ({
        card_id: c.id,
        rating: finalRatingsMap[c.id] || 'Good',
      }));

      const res = await axios.post(
        `${API_BASE_URL}/api/v1/study/flashcards/complete`,
        {
          subject_id: subjectId || null,
          subject_name: subjectName || null,
          topic_id: topicId || null,
          topic_name: topicName || null,
          ratings: ratingsPayload,
        },
        { headers }
      );
      setSessionSummary(res.data);
      onCompleted?.();
    } catch (err) {
      console.warn('Failed to mark flashcards completed in database:', err);
    }
  };

  const handleRateCard = (ratingValue) => {
    const cardId = cards[currentIndex]?.id;
    const updatedRatings = { ...ratings, [cardId]: ratingValue };
    setRatings(updatedRatings);

    setIsFlipped(false);
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCompletedAll(true);
      markCompleted(updatedRatings);
    }
  };

  const handleNext = () => {
    setIsFlipped(false);
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCompletedAll(true);
      markCompleted(ratings);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setIsFlipped(false);
      setCurrentIndex((prev) => prev - 1);
    }
  };

  // Keyboard navigation: Space (flip), 1/2/3/4 (ratings when flipped), Arrows (prev/next), Escape (close)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (loading || cards.length === 0 || completedAll) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      } else if (isFlipped) {
        if (e.key === '1') {
          e.preventDefault();
          handleRateCard('Again');
        } else if (e.key === '2') {
          e.preventDefault();
          handleRateCard('Hard');
        } else if (e.key === '3') {
          e.preventDefault();
          handleRateCard('Good');
        } else if (e.key === '4') {
          e.preventDefault();
          handleRateCard('Easy');
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, cards, currentIndex, isFlipped, completedAll, onClose, ratings]);

  if (!isOpen) return null;

  const currentCard = cards[currentIndex];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-xl bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-mono text-teal-400 uppercase tracking-wider font-semibold">
                  Active Recall Flashcards
                </span>
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  {topicName || 'Topic Flashcards'}
                </h3>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Flashcard Area */}
          <div className="p-6">
            {loading && (
              <div className="py-20 text-center space-y-3">
                <RefreshCw className="w-6 h-6 text-teal-400 animate-spin mx-auto" />
                <p className="text-neutral-400 text-xs font-mono">Synthesizing grounded active recall cards...</p>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/40 text-red-200 text-xs space-y-3">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Flashcard Generator Error
                </p>
                <p className="text-neutral-400">{error}</p>
                <button
                  onClick={fetchFlashcards}
                  className="px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-800/80 text-white font-mono text-xs transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && cards.length > 0 && !completedAll && (
              <div className="space-y-4">
                {/* Progress bar */}
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span>CARD {currentIndex + 1} OF {cards.length}</span>
                  <span className="text-teal-400">Spacebar to Flip · Arrows to Navigate</span>
                </div>
                <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
                  />
                </div>

                {/* 3D Flip Card Container */}
                <div
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="relative h-64 w-full cursor-pointer perspective-1000 select-none"
                >
                  <motion.div
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ duration: 0.4 }}
                    className="w-full h-full rounded-xl border border-neutral-800 bg-neutral-900/80 p-6 flex flex-col justify-between transform-style-3d hover:border-teal-500/30 transition-colors shadow-lg"
                  >
                    {!isFlipped ? (
                      /* Front of Card (Question) */
                      <div className="flex flex-col justify-between h-full">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 self-start border border-teal-500/20">
                          QUESTION
                        </span>
                        <div className="my-auto text-center px-4">
                          <p className="text-base md:text-lg font-medium text-white leading-relaxed">
                            {currentCard.question}
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-neutral-500">
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Click or Space to reveal answer</span>
                        </div>
                      </div>
                    ) : (
                      /* Back of Card (Answer & Trap) */
                      <div className="flex flex-col justify-between h-full rotate-y-180">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 self-start border border-emerald-500/20">
                          ANSWER & TAKEAWAY
                        </span>
                        <div className="my-auto space-y-2.5 px-2">
                          <p className="text-sm font-medium text-neutral-100 leading-relaxed">
                            {currentCard.answer}
                          </p>
                          {currentCard.key_takeaway && (
                            <p className="text-xs font-mono text-teal-300/90 bg-teal-950/30 p-2 rounded border border-teal-500/10">
                              ⚡ Takeaway: {currentCard.key_takeaway}
                            </p>
                          )}
                          {currentCard.common_trap && (
                            <p className="text-xs text-red-300/90 bg-red-950/20 p-2 rounded border border-red-500/10">
                              ⚠️ Trap: {currentCard.common_trap}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-neutral-500">
                          <span>Click or Space to flip back</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* Self-Rating & Navigation Controls */}
                <div className="pt-3 space-y-3">
                  {isFlipped ? (
                    <div className="space-y-2 p-3 rounded-xl bg-neutral-900/90 border border-teal-500/20">
                      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                        <span className="text-teal-400 font-semibold uppercase tracking-wider">Rate Recall Confidence:</span>
                        <span>Press 1, 2, 3, or 4 on keyboard</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => handleRateCard('Again')}
                          className="px-2 py-2.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/60 text-red-300 text-xs font-mono font-semibold transition-all flex flex-col items-center gap-0.5"
                        >
                          <span className="text-[10px] text-red-400 font-mono">1</span>
                          <span>Again</span>
                          <span className="text-[9px] text-red-400/80 font-normal">Review Soon</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRateCard('Hard')}
                          className="px-2 py-2.5 rounded-lg bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 text-amber-300 text-xs font-mono font-semibold transition-all flex flex-col items-center gap-0.5"
                        >
                          <span className="text-[10px] text-amber-400 font-mono">2</span>
                          <span>Hard</span>
                          <span className="text-[9px] text-amber-400/80 font-normal">Struggled</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRateCard('Good')}
                          className="px-2 py-2.5 rounded-lg bg-teal-950/40 hover:bg-teal-900/60 border border-teal-800/60 text-teal-300 text-xs font-mono font-semibold transition-all flex flex-col items-center gap-0.5"
                        >
                          <span className="text-[10px] text-teal-400 font-mono">3</span>
                          <span>Good</span>
                          <span className="text-[9px] text-teal-400/80 font-normal">Recalled</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRateCard('Easy')}
                          className="px-2 py-2.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800/60 text-emerald-300 text-xs font-mono font-semibold transition-all flex flex-col items-center gap-0.5"
                        >
                          <span className="text-[10px] text-emerald-400 font-mono">4</span>
                          <span>Easy</span>
                          <span className="text-[9px] text-emerald-400/80 font-normal">Mastered</span>
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={handlePrev}
                      disabled={currentIndex === 0}
                      className="px-3.5 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40 font-mono text-xs flex items-center gap-1 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous</span>
                    </button>

                    <button
                      onClick={() => setIsFlipped(!isFlipped)}
                      className="px-3.5 py-2 rounded-lg bg-neutral-900 border border-teal-500/20 text-teal-300 hover:bg-neutral-800 font-mono text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>{isFlipped ? 'Show Question' : 'Reveal Answer (Space)'}</span>
                    </button>

                    <button
                      onClick={handleNext}
                      className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-black font-semibold text-xs flex items-center gap-1 transition-colors"
                    >
                      <span>{currentIndex === cards.length - 1 ? 'Finish & Save' : 'Next Card'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Completed state */}
            {completedAll && (
              <div className="py-8 text-center space-y-5">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-base font-semibold text-white">Active Recall Session Completed!</h4>
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                    You reviewed all {cards.length} grounded flashcards for {topicName}.
                  </p>
                </div>

                {/* Rating Breakdown Badges */}
                <div className="grid grid-cols-4 gap-2 max-w-md mx-auto text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-400 block">Easy</span>
                    <span className="text-base font-bold text-white">
                      {Object.values(ratings).filter((r) => r === 'Easy').length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-teal-950/30 border border-teal-500/20">
                    <span className="text-[10px] text-teal-400 block">Good</span>
                    <span className="text-base font-bold text-white">
                      {Object.values(ratings).filter((r) => r === 'Good').length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/20">
                    <span className="text-[10px] text-amber-400 block">Hard</span>
                    <span className="text-base font-bold text-white">
                      {Object.values(ratings).filter((r) => r === 'Hard').length}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/20">
                    <span className="text-[10px] text-red-400 block">Again</span>
                    <span className="text-base font-bold text-white">
                      {Object.values(ratings).filter((r) => r === 'Again').length}
                    </span>
                  </div>
                </div>

                {sessionSummary?.mastery_score !== undefined && (
                  <div className="p-3 rounded-xl bg-teal-950/30 border border-teal-500/20 text-xs font-mono max-w-sm mx-auto text-teal-300">
                    ⚡ New Topic Mastery: <strong>{sessionSummary.mastery_score}%</strong>
                    {sessionSummary.retention_score && (
                      <span className="text-neutral-400 ml-2">
                        · Recall Quality: {Math.round(sessionSummary.retention_score * 100)}%
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentIndex(0);
                      setIsFlipped(false);
                      setCompletedAll(false);
                    }}
                    className="px-4 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-mono transition-colors"
                  >
                    Review Deck Again
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-black font-semibold text-xs transition-colors"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
