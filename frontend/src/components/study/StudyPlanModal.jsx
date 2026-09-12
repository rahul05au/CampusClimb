import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Zap, RefreshCw, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function StudyPlanModal({ isOpen, onClose, subjectId, subjectName, activePlan, onPlanUpdated }) {
  const { token, getToken } = useAuth();
  const [dailyHours, setDailyHours] = useState(activePlan?.daily_hours || 2.0);
  const [mode, setMode] = useState(activePlan?.mode || 'Sprint');
  const [examDate, setExamDate] = useState(activePlan?.exam_date ? activePlan.exam_date.slice(0, 10) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState(activePlan || null);

  useEffect(() => {
    if (activePlan) {
      setPlan(activePlan);
      if (activePlan.daily_hours) setDailyHours(activePlan.daily_hours);
      if (activePlan.mode) setMode(activePlan.mode);
      if (activePlan.exam_date) setExamDate(activePlan.exam_date.slice(0, 10));
    }
  }, [activePlan]);

  const handleGeneratePlan = async () => {
    if (!subjectId && !subjectName) return;
    setLoading(true);
    setError('');

    try {
      const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
      const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
      const res = await axios.post(
        `${API_BASE_URL}/api/v1/study/plan`,
        {
          subject_id: subjectId || null,
          subject_name: subjectName || null,
          exam_date: examDate || null,
          daily_hours: parseFloat(dailyHours),
          mode: mode,
        },
        { headers }
      );
      setPlan(res.data);
      onPlanUpdated?.();
    } catch (err) {
      console.error('Study plan generation error:', err);
      const detail = err.response?.data?.detail || 'Failed to generate adaptive study plan.';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
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
          className="relative w-full max-w-3xl bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden my-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[11px] font-mono text-teal-400 uppercase tracking-wider font-semibold">
                  Adaptive Value-Per-Minute Scheduler
                </span>
                <h3 className="text-sm font-semibold text-white tracking-tight">
                  {subjectName || 'Course'} Exam Preparation Schedule
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

          {/* Configuration Bar */}
          <div className="p-6 border-b border-neutral-800 bg-neutral-900/30 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Exam Date */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-neutral-400 font-semibold uppercase tracking-wider">
                Exam Date
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs focus:outline-none focus:border-teal-500/50 font-mono"
              />
            </div>

            {/* Daily Hours */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-[11px] font-mono text-neutral-400 font-semibold uppercase tracking-wider">
                  Daily Study Hours
                </label>
                <span className="text-[11px] font-mono text-teal-400 font-bold">{dailyHours}h / day</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="8.0"
                step="0.5"
                value={dailyHours}
                onChange={(e) => setDailyHours(parseFloat(e.target.value))}
                className="w-full accent-teal-500 bg-neutral-800 h-1.5 rounded-lg appearance-none cursor-pointer mt-2"
              />
            </div>

            {/* Preparation Mode */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-neutral-400 font-semibold uppercase tracking-wider">
                Preparation Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {['Emergency', 'Sprint', 'Mastery'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`py-1.5 px-2 rounded font-mono text-[11px] transition-colors ${
                      mode === m
                        ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 font-semibold'
                        : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="px-6 py-3 border-b border-neutral-800 flex items-center justify-between text-xs bg-neutral-900/10">
            <span className="text-neutral-400 text-[11px] font-mono">
              Greedily optimizes exam return per available minute · Adapts when quiz scores update
            </span>
            <button
              onClick={handleGeneratePlan}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Computing Schedule...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>{plan ? 'Re-Optimize Plan' : 'Generate Adaptive Plan'}</span>
                </>
              )}
            </button>
          </div>

          {/* Tasks List */}
          <div className="p-6 max-h-[55vh] overflow-y-auto space-y-4">
            {error && (
              <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/40 text-red-200 text-xs space-y-2">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Schedule Optimization Error
                </p>
                <p className="text-neutral-400">{error}</p>
              </div>
            )}

            {plan?.tasks?.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400 pb-1">
                  <span>PLANNED TOPICS: {plan.tasks.length}</span>
                  <span className="text-teal-400 font-semibold">
                    TOTAL ESTIMATED: {plan.total_scheduled_minutes || Math.round(plan.tasks.length * 20)} MINUTES
                  </span>
                </div>

                {plan.tasks.map((task, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-neutral-900/50 border border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-teal-400 font-semibold">
                          Day {task.day || 1}
                        </span>
                        <span className="font-semibold text-white">
                          {task.topic_name}
                        </span>
                        {task.importance && (
                          <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                            task.importance === 'High' ? 'bg-teal-500/10 text-teal-300 border border-teal-500/20' : 'bg-neutral-800 text-neutral-400'
                          }`}>
                            {task.importance} PYQ
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-400 font-mono">
                        {task.why_recommended || `Unit ${task.unit_number}: ${task.unit_name}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                      <div className="text-right font-mono text-[11px]">
                        <span className="text-teal-400 font-semibold block">
                          {task.duration_minutes || task.allocated_minutes || 20} mins
                        </span>
                        <span className="text-neutral-500 text-[10px]">
                          Mastery: {task.mastery || 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              !loading && (
                <div className="py-16 text-center space-y-2 text-neutral-500">
                  <Calendar className="w-8 h-8 mx-auto text-neutral-600" />
                  <p className="text-xs font-mono">No active schedule yet. Select parameters and click Generate.</p>
                </div>
              )
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
            <span className="text-[11px] font-mono text-neutral-500">
              Persisted and dynamically recalibrated as you study
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-mono text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
