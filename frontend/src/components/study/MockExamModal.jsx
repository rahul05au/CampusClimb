import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, GraduationCap, Award, AlertTriangle, RefreshCw, Send } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function MockExamModal({ isOpen, onClose, subjectId, subjectName, onCompleted }) {
  const { token, getToken } = useAuth();
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState('A'); // 'A' or 'B'

  const fetchExam = useCallback(async () => {
    if (!subjectId && !subjectName) return;
    setLoading(true);
    setError('');
    setExam(null);
    setAnswers({});
    setResult(null);

    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      const res = await axios.post(
        `${API_BASE_URL}/api/v1/study/mock-exam`,
        { subject_id: subjectId || null, subject_name: subjectName || null, mode: 'standard' },
        { headers }
      );
      setExam(res.data);
    } catch (err) {
      console.error('Mock exam generation error:', err);
      const detail = err.response?.data?.detail || 'Failed to synthesize university mock examination.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  }, [subjectId, subjectName, token, getToken]);

  useEffect(() => {
    if (isOpen) {
      fetchExam();
    }
  }, [isOpen, fetchExam]);

  const handleAnswerChange = (qKey, text) => {
    if (result) return;
    setAnswers((prev) => ({
      ...prev,
      [qKey]: text,
    }));
  };

  const handleSubmit = async () => {
    if (submitting || result || !exam) return;
    setSubmitting(true);
    setError('');

    const formattedAnswers = [];
    exam.part_a?.forEach((q) => {
      formattedAnswers.push({
        question_number: q.question_number,
        part: 'A',
        student_answer: answers[`A_${q.question_number}`] || '',
      });
    });
    exam.part_b?.forEach((q) => {
      formattedAnswers.push({
        question_number: q.question_number,
        part: 'B',
        student_answer: answers[`B_${q.question_number}`] || '',
      });
    });

    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      const res = await axios.post(
        `${API_BASE_URL}/api/v1/study/mock-exam/submit`,
        {
          subject_id: subjectId || null,
          subject_name: subjectName || null,
          exam_id: exam.exam_id,
          answers: formattedAnswers,
        },
        { headers }
      );
      setResult(res.data);
      onCompleted?.();
    } catch (err) {
      console.error('Mock exam submission error:', err);
      const detail = err.response?.data?.detail || 'Failed to evaluate mock exam.';
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

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden my-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-teal-400 uppercase tracking-wider font-semibold">
                    University-Patterned Mock Examination
                  </span>
                  {exam && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-300">
                      Total: {exam.total_marks} Marks · {exam.duration_minutes} Mins
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold text-white tracking-tight">
                  {subjectName || 'Course'} Semester Simulation
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

          {/* Subheader / Tabs */}
          {exam && !result && (
            <div className="px-6 py-2.5 border-b border-neutral-800 bg-neutral-900/30 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('A')}
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                    activeTab === 'A'
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Part A: Short Questions ({exam.part_a?.length || 10} × 2M = 20M)
                </button>
                <button
                  onClick={() => setActiveTab('B')}
                  className={`px-3 py-1.5 rounded-lg font-mono text-xs transition-colors ${
                    activeTab === 'B'
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 font-semibold'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Part B: In-Depth Analytical ({exam.part_b?.length || 5} × 10M = 50M)
                </button>
              </div>
              <span className="text-[11px] font-mono text-neutral-500 hidden sm:inline">
                {exam.university_pattern}
              </span>
            </div>
          )}

          {/* Body */}
          <div className="p-6 max-h-[72vh] overflow-y-auto space-y-6">
            {loading && (
              <div className="py-24 text-center space-y-3">
                <RefreshCw className="w-7 h-7 text-teal-400 animate-spin mx-auto" />
                <p className="text-neutral-400 text-xs font-mono">
                  Synthesizing university-grounded examination paper matching past paper distributions...
                </p>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/40 text-red-200 text-xs space-y-3">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Exam Synthesis Error
                </p>
                <p className="text-neutral-400">{error}</p>
                <button
                  onClick={fetchExam}
                  className="px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-800/80 text-white font-mono text-xs transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Questions Form */}
            {exam && !loading && !error && !result && (
              <div className="space-y-6">
                {activeTab === 'A' && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-lg bg-neutral-900/40 border border-neutral-800 text-[11px] font-mono text-neutral-400">
                      PART A: Answer all compulsory questions (2 marks each). Write concise technical definitions or formulas.
                    </div>
                    {exam.part_a?.map((q, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-mono font-bold text-teal-400 mt-0.5">
                              {q.question_number || idx + 1}.
                            </span>
                            <p className="text-xs font-medium text-white leading-relaxed">
                              {q.question}
                            </p>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-teal-300 font-semibold shrink-0">
                            [2 Marks]
                          </span>
                        </div>
                        <textarea
                          rows={2}
                          value={answers[`A_${q.question_number || idx + 1}`] || ''}
                          onChange={(e) => handleAnswerChange(`A_${q.question_number || idx + 1}`, e.target.value)}
                          placeholder="Type your concise definition or explanation..."
                          className="w-full p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-teal-500/50 resize-none font-mono"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === 'B' && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-lg bg-neutral-900/40 border border-neutral-800 text-[11px] font-mono text-neutral-400">
                      PART B: In-depth analytical and architectural questions (10 marks each). Structured step-by-step points and rubrics apply.
                    </div>
                    {exam.part_b?.map((q, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-mono font-bold text-teal-400 mt-0.5">
                              {q.question_number || idx + 1}.
                            </span>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-white leading-relaxed">
                                {q.question}
                              </p>
                              {q.topic && (
                                <span className="text-[10px] font-mono text-neutral-500 block">
                                  Topic: {q.topic}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-teal-300 font-semibold shrink-0">
                            [10 Marks]
                          </span>
                        </div>

                        {/* Rubric Peek */}
                        {q.rubric && (
                          <div className="p-2 rounded bg-neutral-950/60 border border-neutral-800/80 text-[11px] font-mono text-neutral-400 flex flex-wrap gap-3">
                            <span className="text-teal-400 font-semibold">Evaluation Scheme:</span>
                            {Object.entries(q.rubric).map(([k, v]) => (
                              <span key={k}>{k.replace('_', ' ')}: {v}M</span>
                            ))}
                          </div>
                        )}

                        <textarea
                          rows={4}
                          value={answers[`B_${q.question_number || idx + 1}`] || ''}
                          onChange={(e) => handleAnswerChange(`B_${q.question_number || idx + 1}`, e.target.value)}
                          placeholder="Type your structured analytical solution, working, and architectural points..."
                          className="w-full p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-teal-500/50 resize-y font-mono"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Results / Feedback */}
            {result && (
              <div className="space-y-6">
                <div className="p-6 rounded-xl bg-neutral-900/90 border border-teal-500/30 text-center space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-mono border border-teal-500/20">
                    <Award className="w-3.5 h-3.5" />
                    <span>EXAMINATION OUTCOME</span>
                  </div>
                  <div className="text-4xl font-bold text-white tracking-tight">
                    {result.total_score} / {result.max_marks}
                    <span className="text-xl text-teal-400 ml-2 font-mono">({result.percentage}%)</span>
                  </div>
                  <p className="text-xs text-neutral-300 max-w-xl mx-auto leading-relaxed pt-1">
                    {result.overall_feedback}
                  </p>
                </div>

                {/* Evaluations breakdown */}
                <div className="space-y-4">
                  <span className="text-xs font-mono font-semibold text-neutral-400 uppercase tracking-wider">
                    Question-by-Question Rubric Evaluation
                  </span>
                  {result.evaluations?.map((ev, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white font-mono">
                          Part {ev.part} · Question #{ev.question_number}
                        </span>
                        <span className="font-mono text-teal-400 font-bold">
                          {ev.marks_awarded} / {ev.max_marks} Marks
                        </span>
                      </div>
                      <p className="text-neutral-300 leading-relaxed">
                        {ev.feedback}
                      </p>
                      {ev.model_outline && (
                        <p className="text-[11px] font-mono text-neutral-500 pt-1 border-t border-neutral-800/60">
                          Model Reference: {ev.model_outline}
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
                  Scores calculated against university marking schemes
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Grading Paper...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Examination Paper</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <div className="w-full flex justify-end">
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-black font-semibold text-xs transition-colors"
                >
                  Close & Save Progress
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
