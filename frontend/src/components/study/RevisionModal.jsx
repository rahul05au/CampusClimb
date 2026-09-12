import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle, Lightbulb, Target, Clock, RefreshCw, CheckCircle2, Layers3 } from 'lucide-react';
import axios from 'axios';
import mermaid from 'mermaid';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function MermaidViewer({ chart, id }) {
  const [svgHtml, setSvgHtml] = useState('');
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const renderChart = async () => {
      if (!chart || chart === 'NO_DIAGRAM') return;
      try {
        const uniqueId = `mermaid_rev_${id}_${Math.random().toString(36).substr(2, 9)}`;
        const { svg } = await mermaid.render(uniqueId, chart);
        if (isMounted) {
          setSvgHtml(svg);
          setRenderError(false);
        }
      } catch (err) {
        console.warn('[Mermaid] Revision diagram error:', err);
        if (isMounted) setRenderError(true);
      }
    };
    renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart, id]);

  if (!chart || chart === 'NO_DIAGRAM' || renderError || !svgHtml) return null;

  return (
    <div className="mt-4 p-3 rounded-lg bg-neutral-900/90 border border-teal-500/20 overflow-x-auto">
      <div className="flex items-center gap-2 mb-2 pb-1 border-b border-neutral-800 text-[11px] font-mono text-teal-400 font-semibold">
        <Layers3 className="w-3.5 h-3.5 text-teal-400" />
        <span>CONCEPT ARCHITECTURE DIAGRAM</span>
      </div>
      <div className="overflow-x-auto py-2 flex justify-center [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svgHtml }} />
    </div>
  );
}

export default function RevisionModal({ isOpen, onClose, subjectId, subjectName, topicId, topicName, onCompleted }) {
  const { token, getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [showRecallAnswer, setShowRecallAnswer] = useState(false);

  useEffect(() => {
    if (!isOpen || (!topicId && !topicName)) return;

    let isMounted = true;
    const fetchRevision = async () => {
      setLoading(true);
      setError('');
      setData(null);
      setShowRecallAnswer(false);

      try {
        const activeToken = (await getToken?.()) || token || (typeof window !== 'undefined' ? localStorage.getItem('campusclimb_token') : null);
        const headers = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
        const res = await axios.post(
          `${API_BASE_URL}/api/v1/study/revision`,
          {
            subject_id: subjectId || null,
            subject_name: subjectName || null,
            topic_id: topicId || null,
            topic_name: topicName || null,
          },
          { headers }
        );
        if (isMounted) {
          setData(res.data);
        }
      } catch (err) {
        console.error('Revision sheet load error:', err);
        const detail = err.response?.data?.detail || 'Failed to synthesize revision sheet. Please retry.';
        if (isMounted) {
          setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRevision();
    return () => {
      isMounted = false;
    };
  }, [isOpen, subjectId, subjectName, topicId, topicName, token, getToken]);

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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-neutral-950 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden my-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-teal-400 uppercase tracking-wider font-semibold">
                    2-Minute High-Yield Revision
                  </span>
                  {data?.unit_name && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
                      {data.unit_name}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold text-white tracking-tight">
                  {topicName || data?.topic_name || 'Topic Revision'}
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

          {/* Content Body */}
          <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5 text-sm">
            {loading && (
              <div className="py-16 text-center space-y-3">
                <RefreshCw className="w-6 h-6 text-teal-400 animate-spin mx-auto" />
                <p className="text-neutral-400 text-xs font-mono">Synthesizing grounded high-yield revision...</p>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/40 text-red-200 text-xs space-y-3">
                <p className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Failed to Load Revision
                </p>
                <p className="text-neutral-400">{error}</p>
                <button
                  onClick={() => {
                    setError('');
                    setLoading(true);
                  }}
                  className="px-3 py-1.5 rounded bg-red-900/60 hover:bg-red-800/80 text-white font-mono text-xs transition-colors"
                >
                  Retry Synthesis
                </button>
              </div>
            )}

            {data && !loading && !error && (
              <>
                {/* Must Know */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-mono font-semibold text-teal-400 uppercase tracking-wider">
                    <Target className="w-3.5 h-3.5 text-teal-400" />
                    <span>Must-Know Core Concepts</span>
                  </div>
                  <div className="space-y-1.5">
                    {data.must_know?.map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800/80 text-neutral-200 leading-relaxed text-xs flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Critical Rules / Remember */}
                {data.remember?.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-mono font-semibold text-amber-400 uppercase tracking-wider">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                      <span>Formula & Rule Memory Anchor</span>
                    </div>
                    <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/20 text-amber-200/90 text-xs space-y-1 font-mono">
                      {data.remember.map((r, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="text-amber-400">⚡</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Exam Angle & Common Trap */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800 space-y-1.5">
                    <span className="text-[11px] font-mono text-teal-400 font-semibold uppercase tracking-wider block">
                      University Exam Pattern
                    </span>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      {data.exam_angle || 'Commonly tested as direct definitions and algorithmic step problems.'}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-red-950/20 border border-red-500/20 space-y-1.5">
                    <span className="text-[11px] font-mono text-red-400 font-semibold uppercase tracking-wider block">
                      Frequent Exam Penalty Trap
                    </span>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      {data.common_trap || 'Conflating terminology without citing required edge-case conditions.'}
                    </p>
                  </div>
                </div>

                {/* 20-Second Recall Challenge */}
                {data.quick_recall && (
                  <div className="p-3.5 rounded-lg bg-neutral-900/70 border border-teal-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-teal-400 font-semibold uppercase tracking-wider">
                        20-Second Active Recall Question
                      </span>
                      <button
                        onClick={() => setShowRecallAnswer(!showRecallAnswer)}
                        className="text-[11px] font-mono text-neutral-400 hover:text-teal-300 underline"
                      >
                        {showRecallAnswer ? 'Hide Tip' : 'Show Answer Tip'}
                      </button>
                    </div>
                    <p className="text-xs text-white font-medium italic">
                      "{data.quick_recall}"
                    </p>
                    {showRecallAnswer && (
                      <p className="text-[11px] text-neutral-400 font-mono pt-1 border-t border-neutral-800">
                        Recall tip: Check key points listed in the Must-Know section above before proceeding to diagnostic quiz.
                      </p>
                    )}
                  </div>
                )}

                {/* Optional Architecture Diagram */}
                {data.diagram_mermaid && (
                  <MermaidViewer chart={data.diagram_mermaid} id={`topic_${topicId}`} />
                )}
              </>
            )}
          </div>

          {/* Footer Action */}
          <div className="px-6 py-3.5 border-t border-neutral-800 bg-neutral-900/40 flex items-center justify-between">
            <span className="text-[11px] font-mono text-neutral-500">
              Updates Topic Mastery heuristic (+25% Revision component)
            </span>
            <button
              onClick={() => {
                onCompleted?.();
                onClose();
              }}
              className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-black font-semibold text-xs transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Mark Revised & Continue</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
