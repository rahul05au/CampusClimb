import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Compass, Clock, Zap, Calendar, GraduationCap, Layers, AlertTriangle, PhoneCall
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import RevisionModal from './RevisionModal';
import FlashcardsModal from './FlashcardsModal';
import QuizModal from './QuizModal';
import MockExamModal from './MockExamModal';
import StudyPlanModal from './StudyPlanModal';
import AITeacherCallModal from '../ai-teacher/AITeacherCallModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export default function ExamCommandCenter({ subjectId, subjectName, onRefreshNeeded }) {
  const { token, getToken } = useAuth();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [, setError] = useState('');
  const [showWhyTopic, setShowWhyTopic] = useState(false);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [teacherTopicPrompt, setTeacherTopicPrompt] = useState({ topic: '', prompt: '' });

  // Modals state
  const [activeModal, setActiveModal] = useState(null); // 'revision' | 'flashcards' | 'quiz' | 'plan' | 'mock_exam'
  const [targetTopic, setTargetTopic] = useState(null); // { id, name }

  const fetchStudyOverview = useCallback(async () => {
    if (!subjectName) return;
    setLoading(true);
    setError('');

    try {
      const activeToken = (await getToken?.()) || token;
      const res = await axios.get(
        `${API_BASE_URL}/api/v1/study/overview?subject=${encodeURIComponent(subjectName)}${subjectId ? `&subject_id=${subjectId}` : ''}`,
        { headers: { Authorization: `Bearer ${activeToken}` } }
      );
      setOverview(res.data);
    } catch (err) {
      console.warn('Exam command center overview fetch warning:', err);
      // Non-fatal: do not break dashboard if study data fails
      setError(err.response?.data?.detail || 'Unable to load study intelligence telemetry.');
    } finally {
      setLoading(false);
    }
  }, [subjectId, subjectName, token, getToken]);

  useEffect(() => {
    fetchStudyOverview();
  }, [fetchStudyOverview]);

  const handleStudyAction = (actionType, topicId, topicName) => {
    setTargetTopic({ id: topicId, name: topicName });
    if (actionType === 'revision') setActiveModal('revision');
    else if (actionType === 'quiz') setActiveModal('quiz');
    else if (actionType === 'flashcards') setActiveModal('flashcards');
    else if (actionType === 'mock_exam') setActiveModal('mock_exam');
  };

  const handleModalCompleted = () => {
    fetchStudyOverview();
    onRefreshNeeded?.();
  };

  const readiness = overview?.exam_readiness;
  const nba = overview?.next_best_action;

  return (
    <div className="space-y-4 mb-6">
      {/* Main Dual Grid: Estimated Readiness & Next Best Action */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card 1: Estimated Exam Readiness (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-xl bg-neutral-900/60 border border-neutral-800 hover:border-neutral-700/80 transition-colors flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-teal-400">
                <Compass className="w-4 h-4 text-teal-400" />
                <span className="uppercase tracking-wider">Estimated Exam Readiness</span>
              </div>
              <span className="text-[10px] font-mono text-neutral-500 bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                Multi-Signal Heuristic
              </span>
            </div>

            {/* Score Display */}
            <div className="flex items-baseline gap-3 pt-1">
              <span className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                {readiness?.overall_score || 0}%
              </span>
              <div className="text-xs text-neutral-400 leading-tight">
                <span className="text-teal-300 font-semibold block">Semester Preparedness</span>
                <span>Contributing academic signals</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-neutral-950 rounded-full overflow-hidden border border-neutral-800/80">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${readiness?.overall_score || 0}%` }}
                transition={{ duration: 0.6 }}
                className="h-full bg-teal-500 rounded-full"
              />
            </div>

            {/* Breakdown Indicators */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono">
              <div className="p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-0.5">
                <span className="text-neutral-500 block text-[10px]">PYQ Coverage</span>
                <span className="font-semibold text-teal-300">{readiness?.pyq_coverage || 0}%</span>
                <span className="text-[9px] text-neutral-600 block">35% wt</span>
              </div>
              <div className="p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-0.5">
                <span className="text-neutral-500 block text-[10px]">Avg Mastery</span>
                <span className="font-semibold text-teal-300">{readiness?.topic_mastery || 0}%</span>
                <span className="text-[9px] text-neutral-600 block">30% wt</span>
              </div>
              <div className="p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-0.5">
                <span className="text-neutral-500 block text-[10px]">Diagnostic Acc</span>
                <span className="font-semibold text-teal-300">{readiness?.quiz_accuracy || 0}%</span>
                <span className="text-[9px] text-neutral-600 block">20% wt</span>
              </div>
              <div className="p-2 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-0.5">
                <span className="text-neutral-500 block text-[10px]">Revision Rate</span>
                <span className="font-semibold text-teal-300">{readiness?.revision_rate || 0}%</span>
                <span className="text-[9px] text-neutral-600 block">15% wt</span>
              </div>
            </div>
          </div>

          {/* Actionable Forecast Banner */}
          <div className="mt-4 p-2.5 rounded-xl bg-teal-950/20 border border-teal-500/20 text-[11px] text-teal-200/90 font-mono flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
            <span>{readiness?.highest_value_improvement || 'Complete daily topics to raise readiness heuristic.'}</span>
          </div>

          {/* Primary Score Drain / Weakest Topic Alert */}
          {readiness?.weakest_topic && (
            <div className="mt-2 p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-[11px] text-amber-200/90 font-mono flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Score Drain: <strong className="text-white">{readiness.weakest_topic}</strong></span>
              </div>
              <button
                onClick={() => handleStudyAction('revision', null, readiness.weakest_topic)}
                className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/30 transition-colors cursor-pointer"
              >
                Boost Topic
              </button>
            </div>
          )}
        </div>

        {/* Card 2: Next Best Action (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-xl bg-neutral-900/70 border border-teal-500/30 hover:border-teal-500/40 transition-colors flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-teal-400" aria-hidden="true" />
                <span className="text-xs font-mono font-bold text-teal-400 uppercase tracking-wider">
                  Next Best Action
                </span>
              </div>
              <button
                onClick={() => setShowWhyTopic(!showWhyTopic)}
                className="text-[11px] font-mono text-neutral-400 hover:text-teal-300 underline transition-colors"
              >
                {showWhyTopic ? 'Hide Rationale' : 'Why this topic?'}
              </button>
            </div>

            {nba ? (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                  <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">
                    {nba.topic_name}
                  </h3>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Unit {nba.unit_number}: {nba.unit_name}
                  </span>
                </div>

                <p className="text-xs text-neutral-300 leading-relaxed">
                  {nba.reason}
                </p>

                {/* "Why This Topic?" Expandable Card */}
                {showWhyTopic && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-3 rounded-xl bg-neutral-950/80 border border-teal-500/20 text-xs space-y-1.5 font-mono"
                  >
                    <div className="flex items-center justify-between text-teal-400 font-semibold text-[11px]">
                      <span>ALGORITHMIC RECOMMENDATION RATIONALE</span>
                      <span>{nba.duration_minutes} MIN ALLOCATION</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-neutral-300 pt-1">
                      <div>• PYQ Importance: <span className="text-teal-300">{nba.why_topic?.pyq_importance || 'High'}</span> ({nba.pyq_count} questions)</div>
                      <div>• Current Learning Mastery: <span className="text-teal-300">{nba.mastery_score}%</span></div>
                      <div>• Urgency: <span className="text-amber-300">High Exam Score Potential</span></div>
                      <div>• Unit Context: <span className="text-neutral-400">{nba.why_topic?.unit || 'Core Unit'}</span></div>
                    </div>
                  </motion.div>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-neutral-400 font-mono">
                {loading ? 'Evaluating highest-return academic priority...' : 'All immediate priorities mastered. Great job!'}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-4 pt-3 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-neutral-500">
                1-Tap Topic Actions:
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {nba && (
                <>
                  <button
                    onClick={() => handleStudyAction('revision', nba.topic_id, nba.topic_name)}
                    className="px-3 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 hover:bg-teal-500/20 text-xs font-mono font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>2-Min Revision</span>
                  </button>

                  <button
                    onClick={() => handleStudyAction('quiz', nba.topic_id, nba.topic_name)}
                    className="px-3.5 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-black text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Take 5-Q Quiz</span>
                  </button>

                  <button
                    onClick={() => handleStudyAction('flashcards', nba.topic_id, nba.topic_name)}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-mono transition-colors flex items-center gap-1.5"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Flashcards</span>
                  </button>

                  <button
                    onClick={() => {
                      setTeacherTopicPrompt({
                        topic: nba.topic_name,
                        prompt: `Explain ${nba.topic_name} key concepts and common university exam questions simply.`,
                      });
                      setIsTeacherModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900 border border-teal-500/30 text-teal-300 hover:bg-neutral-800 text-xs font-mono transition-colors flex items-center gap-1.5"
                    title="Start voice call with AI Teacher about this topic"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-teal-400" />
                    <span>Ask AI Teacher</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global Action Bar: Adaptive Study Planner & University Mock Exam */}
      <div id="study-planner" className="scroll-mt-24 p-3.5 rounded-xl bg-neutral-900/40 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 text-neutral-400 font-mono">
          <Calendar className="w-4 h-4 text-teal-400 shrink-0" />
          <span>
            {overview?.active_plan
              ? `Active ${overview.active_plan.mode} Plan (${overview.active_plan.daily_hours}h/day) configured.`
              : 'Configure your exam schedule optimized for exam return per available minute.'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => setActiveModal('plan')}
            className="px-3.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-200 hover:border-teal-500/30 hover:text-white font-mono text-xs transition-colors flex items-center gap-1.5"
          >
            <Calendar className="w-3.5 h-3.5 text-teal-400" />
            <span>Adaptive Study Plan</span>
          </button>

          <button
            onClick={() => setActiveModal('mock_exam')}
            className="px-3.5 py-1.5 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-300 hover:bg-teal-500/20 font-mono text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <GraduationCap className="w-3.5 h-3.5 text-teal-400" />
            <span>University Mock Exam</span>
          </button>
        </div>
      </div>

      {/* Embedded Modals */}
      <RevisionModal
        isOpen={activeModal === 'revision'}
        onClose={() => setActiveModal(null)}
        subjectId={subjectId || overview?.subject_id || 1}
        subjectName={subjectName}
        topicId={targetTopic?.id || nba?.topic_id}
        topicName={targetTopic?.name || nba?.topic_name}
        onCompleted={handleModalCompleted}
      />

      <FlashcardsModal
        isOpen={activeModal === 'flashcards'}
        onClose={() => setActiveModal(null)}
        subjectId={subjectId || overview?.subject_id || 1}
        subjectName={subjectName}
        topicId={targetTopic?.id || nba?.topic_id}
        topicName={targetTopic?.name || nba?.topic_name}
        onCompleted={handleModalCompleted}
      />

      <QuizModal
        isOpen={activeModal === 'quiz'}
        onClose={() => setActiveModal(null)}
        subjectId={subjectId || overview?.subject_id || 1}
        subjectName={subjectName}
        topicId={targetTopic?.id || nba?.topic_id}
        topicName={targetTopic?.name || nba?.topic_name}
        onCompleted={handleModalCompleted}
      />

      <StudyPlanModal
        isOpen={activeModal === 'plan'}
        onClose={() => setActiveModal(null)}
        subjectId={subjectId || overview?.subject_id || 1}
        subjectName={subjectName}
        activePlan={overview?.active_plan}
        onPlanUpdated={handleModalCompleted}
      />

      <MockExamModal
        isOpen={activeModal === 'mock_exam'}
        onClose={() => setActiveModal(null)}
        subjectId={subjectId || overview?.subject_id || 1}
        subjectName={subjectName}
        onCompleted={handleModalCompleted}
      />

      <AITeacherCallModal
        isOpen={isTeacherModalOpen}
        onClose={() => setIsTeacherModalOpen(false)}
        subject={subjectName || 'Operating Systems'}
        initialTopic={teacherTopicPrompt.topic}
        initialPrompt={teacherTopicPrompt.prompt}
        token={token}
      />
    </div>
  );
}
