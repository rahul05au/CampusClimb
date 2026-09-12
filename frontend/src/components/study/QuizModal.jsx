import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, RefreshCw, Trophy, ArrowRight, HelpCircle, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function QuizModal({ isOpen, onClose, subjectId, subjectName, topicId, topicName, onCompleted }) {
  const { token, getToken } = useAuth();
  const [questions, setQuestions] = useState([]);
  const [quizId, setQuizId] = useState('');
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const fetchQuiz = useCallback(async () => {
    if ((!subjectId && !subjectName) || (!topicId && !topicName)) return;
    setLoading(true);
    setError('');
    setQuestions([]);
    setSelectedAnswers({});
    setResult(null);

    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      const res = await axios.post(
        `${API_BASE_URL}/api/v1/study/quiz`,
        {
          subject_id: subjectId || null,
          subject_name: subjectName || null,
          topic_id: topicId || null,
          topic_name: topicName || null,
        },
        { headers }
      );
      setQuestions(res.data.questions || []);
      setQuizId(res.data.quiz_id || `quiz_${topicId || 'active'}`);
    } catch (err) {
      console.error('Quiz fetch error:', err);
      const detail = err.response?.data?.detail || 'Failed to synthesize diagnostic quiz.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  }, [subjectId, subjectName, topicId, topicName, token, getToken]);

  useEffect(() => {
    if (isOpen) {
      fetchQuiz();
    }
  }, [isOpen, fetchQuiz]);

  const handleSelectOption = (questionId, optionIndex) => {
    if (result) return; // locked after submission
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: optionIndex,
    }));
  };

  const handleSubmit = async () => {
    if (submitting || result) return;
    setSubmitting(true);
    setError('');

    const answersPayload = questions.map((q) => ({
      question_id: q.id,
      selected_index: selectedAnswers[q.id] !== undefined ? selectedAnswers[q.id] : -1,
    }));

    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      const res = await axios.post(
        `${API_BASE_URL}/api/v1/study/quiz/submit`,
        {
          subject_id: subjectId || null,
          subject_name: subjectName || null,
          topic_id: topicId || null,
          topic_name: topicName || null,
          quiz_id: quizId,
          answers: answersPayload,
        },
        { headers }
      );
      setResult(res.data);
      onCompleted?.();
    } catch (err) {
      console.error('Quiz submission error:', err);
      const detail = err.response?.data?.detail || 'Failed to submit quiz.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const answeredCount = Object.keys(selectedAnswers).length;
  const isComplete = questions.length > 0 && answeredCount === questions.length;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-2xl bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden my-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                <HelpCircle className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-mono text-teal-400 uppercase tracking-wider font-semibold">
                  5-Question Rapid Diagnostic Quiz
                </span>
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  {topicName || 'Topic Quiz'}
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

          {/* Body */}
          <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
            {loading && (
              <div className="py-20 text-center space-y-3">
                <RefreshCw className="w-6 h-6 text-teal-400 animate-spin mx-auto" />
                <p className="text-neutral-400 text-xs font-mono">Generating 5 grounded diagnostic questions...</p>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/40 text-red-200 text-xs space-y-3">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Quiz Generation Failed
                </p>
                <p className="text-neutral-400">{error}</p>
                <button
                  onClick={fetchQuiz}
                  className="px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-800/80 text-white font-mono text-xs transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Questions Form */}
            {!loading && !error && questions.length > 0 && !result && (
              <div className="space-y-6">
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pb-2 border-b border-neutral-800">
                  <span>ANSWERED: {answeredCount} / {questions.length}</span>
                  <span className="text-teal-400 font-semibold">50% OF LEARNING MASTERY WEIGHT</span>
                </div>

                {questions.map((q, qIndex) => (
                  <div key={q.id || qIndex} className="p-4 rounded-xl bg-neutral-900/50 border border-neutral-800/80 space-y-3">
                    <div className="flex items-start gap-2.5">
                      <span className="text-xs font-mono font-bold text-teal-400 mt-0.5">
                        Q{qIndex + 1}.
                      </span>
                      <p className="text-sm font-medium text-white leading-relaxed">
                        {q.question}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 pl-6">
                      {q.options?.map((opt, optIdx) => {
                        const isSelected = selectedAnswers[q.id] === optIdx;
                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => handleSelectOption(q.id, optIdx)}
                            className={`w-full p-2.5 rounded-lg border text-left text-xs transition-all flex items-center gap-3 ${
                              isSelected
                                ? 'bg-teal-500/10 border-teal-500/60 text-teal-200 font-medium'
                                : 'bg-neutral-900/80 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                            }`}
                          >
                            <span
                              className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-semibold ${
                                isSelected ? 'bg-teal-500 text-black' : 'bg-neutral-800 text-neutral-400'
                              }`}
                            >
                              {String.fromCharCode(65 + optIdx)}
                            </span>
                            <span className="leading-normal">{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Results Display */}
            {result && (
              <div className="space-y-6">
                {/* Score Banner */}
                <div className="p-5 rounded-xl bg-neutral-900/90 border border-teal-500/30 text-center space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-mono border border-teal-500/20">
                    <Trophy className="w-3.5 h-3.5" />
                    <span>DIAGNOSTIC ACCURACY</span>
                  </div>
                  <div className="text-3xl font-bold text-white tracking-tight">
                    {result.score_percentage}%
                  </div>
                  <p className="text-xs text-neutral-400">
                    {result.correct_count} of {result.total_questions} questions correct · Updated Topic Mastery:{' '}
                    <span className="text-teal-400 font-mono font-semibold">{result.mastery_score}%</span>
                  </p>
                </div>

                {/* Weak Concepts */}
                {result.weak_concepts?.length > 0 && (
                  <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 space-y-2">
                    <span className="text-xs font-mono font-semibold text-red-400 uppercase tracking-wider block">
                      Target Areas for Review
                    </span>
                    <ul className="space-y-1 text-xs text-neutral-300">
                      {result.weak_concepts.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-red-400 mt-0.5">•</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Detailed Breakdown */}
                <div className="space-y-4">
                  <span className="text-xs font-mono font-semibold text-neutral-400 uppercase tracking-wider">
                    Question-by-Question Evaluation
                  </span>
                  {result.question_breakdown?.map((b, idx) => (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                        b.is_correct
                          ? 'bg-emerald-950/10 border-emerald-500/20'
                          : 'bg-red-950/10 border-red-500/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-white">
                          Q{idx + 1}. {b.question}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold shrink-0 ${
                            b.is_correct
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {b.is_correct ? 'CORRECT' : 'INCORRECT'}
                        </span>
                      </div>

                      {b.explanation && (
                        <p className="text-neutral-400 leading-relaxed pt-1 border-t border-neutral-800">
                          {b.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
            {!result ? (
              <>
                <span className="text-[11px] font-mono text-neutral-500">
                  Answers evaluated instantly against grounded facts
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!isComplete || submitting}
                  className="px-5 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:hover:bg-teal-500 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Grading...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit Answers</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </>
            ) : (
              <div className="w-full flex items-center justify-between">
                <button
                  onClick={fetchQuiz}
                  className="px-3.5 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white font-mono text-xs transition-colors"
                >
                  Retake Diagnostic
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-black font-semibold text-xs transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
