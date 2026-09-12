import React, { useMemo } from 'react';

/**
 * Technical terms to highlight when not already bolded
 */
const ACADEMIC_KEYWORDS = [
  'preemption',
  'preemptive',
  'non-preemptive',
  'rate monotonic',
  'dispatcher latency',
  'dispatcher',
  'multiprogramming',
  'multitasking',
  'multi-tasking',
  'time-sharing',
  'time quantum',
  'turnaround time',
  'turn around time',
  'waiting time',
  'response time',
  'throughput',
  'cpu utilization',
  'ready queue',
  'job queue',
  'device queue',
  'deadlock',
  'safe state',
  'banker\'s algorithm',
  'paging',
  'segmentation',
  'virtual memory',
  'page fault',
  'thrashing',
  'context switch',
  'system call',
  'kernel mode',
  'user mode',
];

/**
 * Helper to render text with bold terms
 */
function renderHighlightedText(text) {
  if (!text) return null;

  // Split on existing markdown **bold**
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, pIdx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={pIdx} className="text-neutral-100 font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Otherwise, match key academic terms if not already inside a bold block
    const keywordPattern = new RegExp(`\\b(${ACADEMIC_KEYWORDS.join('|')})\\b`, 'gi');
    const subParts = part.split(keywordPattern);

    return subParts.map((sub, sIdx) => {
      const isKeyword = ACADEMIC_KEYWORDS.some(
        (kw) => kw.toLowerCase() === sub.toLowerCase()
      );
      if (isKeyword) {
        return (
          <strong key={`${pIdx}_${sIdx}`} className="text-teal-200 font-semibold">
            {sub}
          </strong>
        );
      }
      return sub;
    });
  });
}

/**
 * Deterministic parser that structures raw academic note text
 * into semantic sections with headings, definitions, key points,
 * subtopics/criteria, and exam focus.
 */
function parseAcademicNote(rawText, fallbackTopic = '') {
  if (!rawText || !rawText.trim()) return [];

  let text = rawText.trim();

  // 1. Remove accidental text concatenation and duplicate headings
  // Example: "RATE MONOTONIC (RM) SCHEDULING ALGORITHM Rate monotonic scheduling Algorithm works on..."
  text = text.replace(
    /([A-Z0-9\s\(\)\/\-]{4,60})\s+([A-Z][a-z0-9\s\(\)\/\-]{4,60})(?=\s+(?:works|is|refers|defines|operates|consists|assigns|provides|enables|means|occurs))/g,
    (match, p1, p2) => {
      const cleanTitle = p2.trim().replace(/\b\w/g, (c) => c.toUpperCase());
      return `\n\n### ${cleanTitle}\n\n`;
    }
  );

  // 2. Separate inline all-caps headings preceded by period or newline
  // Example: "SCHEDULING CRITERIA: 1. Throughput..." or "PROCESS SCHEDULING CPU is..."
  text = text.replace(
    /(?:^|\n|\.\s+)([A-Z0-9\s\(\)\/\-]{4,50})(?::|\s+(?=[A-Z][a-z]))/g,
    (match, p1) => `\n\n### ${p1.trim().replace(/\b\w/g, (c) => c.toUpperCase())}\n\n`
  );

  // 3. Separate inline "Key: Definition" terms at sentence starts
  // Example: ". Dispatcher latency: The time it takes..."
  text = text.replace(
    /(?:^|\.\s+)([A-Z][a-zA-Z\s]{3,35}):\s+/g,
    (match, p1) => `\n\n### ${p1.trim()}\n\n`
  );

  // 4. Separate inline numbered lists into bullets
  // Example: "1. Throughput: how many jobs... 2. Turn around time: ..."
  text = text.replace(/(\d+\.\s+([A-Za-z\s\-]+):)/g, '\n- **$2**: ');

  // 5. Normalize inline bullet glyphs (•, ▪, -, *) to newline bullet
  text = text.replace(/\s+[•▪]\s+/g, '\n- ');

  // Split into sections by "### "
  const rawSections = text.split(/\n*###\s+/);
  const sections = [];

  rawSections.forEach((sec, idx) => {
    const trimmed = sec.trim();
    if (!trimmed) return;

    const lines = trimmed.split('\n');
    let title = '';
    let bodyLines = [];

    if (idx === 0 && !text.startsWith('###')) {
      // Content before the first explicit heading
      title = fallbackTopic || 'Core Concept';
      bodyLines = lines;
    } else {
      title = lines[0].replace(/^[#\s:*]+|[#\s:*]+$/g, '').trim();
      bodyLines = lines.slice(1);
    }

    if (!title && bodyLines.length === 0) return;

    const keyPoints = [];
    const subtopics = [];
    const examFocus = [];
    const normalSentences = [];

    bodyLines.forEach((line) => {
      const l = line.trim();
      if (!l) return;

      // Check for subtopic/criteria bullet: "- **Title**: Content"
      const subtopicMatch = l.match(/^[-*•]\s+\*\*([^*]+)\*\*:\s*(.*)/);
      if (subtopicMatch) {
        subtopics.push({
          title: subtopicMatch[1].trim(),
          content: subtopicMatch[2].trim(),
        });
        return;
      }

      // Check for standard bullet point
      if (/^[-*•]\s+/.test(l)) {
        keyPoints.push(l.replace(/^[-*•]\s+/, '').trim());
        return;
      }

      // Check sentences for exam focus or takeaways
      const sentences = l.split(/(?<=[.!?])\s+/);
      sentences.forEach((sent) => {
        const s = sent.trim();
        if (!s) return;

        const sLower = s.toLowerCase();
        const isExamFocus =
          sLower.includes('important is that') ||
          sLower.includes('exam') ||
          sLower.includes('tat =') ||
          sLower.includes('formula') ||
          sLower.includes('principle of preemption') ||
          sLower.includes('must satisfy') ||
          sLower.includes('degree of multiprogramming decreases') ||
          sLower.includes('priority is inversely proportional');

        if (isExamFocus) {
          examFocus.push(s);
        } else {
          normalSentences.push(s);
        }
      });
    });

    const overview = normalSentences.join(' ').trim();

    // If section has nothing but title and title was derived from body, handle gracefully
    sections.push({
      title: title || fallbackTopic || 'Academic Note',
      overview,
      keyPoints,
      subtopics,
      examFocus,
    });
  });

  return sections;
}

/**
 * StructuredNoteContent Component
 * Transforms raw merged notes into a structured academic presentation:
 * TOPIC -> SHORT EXPLANATION ("What is it?") -> KEY POINTS -> SUBTOPICS/CRITERIA -> EXAM FOCUS.
 */
export default function StructuredNoteContent({ text, fallbackTopic }) {
  const sections = useMemo(() => {
    return parseAcademicNote(text, fallbackTopic);
  }, [text, fallbackTopic]);

  if (!sections || sections.length === 0) {
    return <p className="text-xs text-neutral-500 italic">No note text available.</p>;
  }

  return (
    <div className="space-y-4 pt-1">
      {sections.map((sec, sIdx) => {
        const hasContent =
          sec.overview ||
          sec.keyPoints.length > 0 ||
          sec.subtopics.length > 0 ||
          sec.examFocus.length > 0;

        return (
          <div
            key={sIdx}
            className={`space-y-2.5 ${
              sIdx > 0 ? 'pt-3.5 border-t border-neutral-850' : ''
            }`}
          >
            {/* 1. Academic Topic Heading */}
            {sec.title && (
              <div className="flex items-center gap-2 pb-1 border-b border-neutral-800/80">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                <h3 className="text-sm sm:text-base font-bold text-teal-300 font-sans tracking-tight">
                  {sec.title}
                </h3>
              </div>
            )}

            {/* 2. Short Explanation / "What is it?" */}
            {sec.overview && (
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-neutral-400 font-semibold tracking-wider uppercase">
                  What is it?
                </span>
                <p className="text-xs sm:text-sm text-neutral-200 leading-relaxed">
                  {renderHighlightedText(sec.overview)}
                </p>
              </div>
            )}

            {/* 3. Key Points (Bullets) */}
            {sec.keyPoints.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-mono text-neutral-400 font-semibold tracking-wider uppercase">
                  Key Points
                </span>
                <ul className="space-y-1.5 pl-1">
                  {sec.keyPoints.map((pt, pIdx) => (
                    <li
                      key={pIdx}
                      className="flex items-start gap-2 text-xs sm:text-sm text-neutral-300"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0 shadow-[0_0_6px_rgba(20,184,166,0.6)]" />
                      <span className="leading-relaxed">
                        {renderHighlightedText(pt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 4. Subtopics / Criteria Grid */}
            {sec.subtopics.length > 0 && (
              <div className="space-y-2 pt-1">
                <span className="text-[10px] font-mono text-neutral-400 font-semibold tracking-wider uppercase">
                  Key Criteria & Sub-elements
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sec.subtopics.map((sub, subIdx) => (
                    <div
                      key={subIdx}
                      className="bg-neutral-900/80 border border-neutral-800 rounded-lg p-2.5 space-y-1"
                    >
                      <div className="text-xs font-semibold text-teal-300 font-mono flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-teal-400" />
                        {sub.title}
                      </div>
                      <p className="text-xs text-neutral-300 leading-relaxed">
                        {renderHighlightedText(sub.content)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Exam Focus / Critical Rules */}
            {sec.examFocus.length > 0 && (
              <div className="mt-2.5 p-2.5 rounded-lg bg-teal-950/20 border border-teal-500/30 text-xs text-teal-200/90 flex items-start gap-2.5">
                <span className="text-amber-400 font-bold font-mono text-[9px] tracking-wider uppercase bg-amber-950/60 border border-amber-500/40 px-1.5 py-0.5 rounded shrink-0">
                  Exam Focus
                </span>
                <div className="space-y-1 text-xs text-neutral-300 leading-relaxed">
                  {sec.examFocus.map((ef, efIdx) => (
                    <p key={efIdx}>{renderHighlightedText(ef)}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Fallback if section only had raw string without sub-elements */}
            {!hasContent && (
              <p className="text-xs text-neutral-400 italic">
                {renderHighlightedText(sec.title)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
