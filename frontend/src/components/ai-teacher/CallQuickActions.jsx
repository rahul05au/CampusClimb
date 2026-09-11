import React from 'react';
import { motion } from 'motion/react';
import { Lightbulb, Sparkles, Globe, HelpCircle } from 'lucide-react';

/**
 * CallQuickActions: Contextual quick action pills for AI Teacher Call (Section 15+).
 * Enables 1-tap guidance without typing or speaking full prompts:
 * - "Explain simpler"
 * - "Give example"
 * - "Explain in Hindi"
 * - "Quiz Me"
 */
export default function CallQuickActions({
  onSelectAction,
  callState = 'LISTENING',
  matchedTopic = '',
  disabled = false,
  sttLanguage = 'auto',
}) {
  const isHindiMode = sttLanguage === 'hi-IN';

  const actions = [
    {
      id: 'simpler',
      icon: Lightbulb,
      label: isHindiMode ? 'सरल भाषा में' : 'Explain Simpler',
      prompt: isHindiMode
        ? `कृपया ${matchedTopic ? `"${matchedTopic}" को ` : ''}और सरल और आसान भाषा में समझाओ।`
        : `Please explain ${matchedTopic ? `"${matchedTopic}" ` : ''}in much simpler, beginner-friendly terms with an intuitive analogy.`,
      color: 'hover:border-amber-500/40 hover:text-amber-300',
    },
    {
      id: 'example',
      icon: Sparkles,
      label: isHindiMode ? 'Real-World Example' : 'Real-World Example',
      prompt: isHindiMode
        ? `इसका एक practical real-world example देकर समझाओ।`
        : `Give me a clear, practical real-world example illustrating ${matchedTopic ? `"${matchedTopic}"` : 'this concept'}.`,
      color: 'hover:border-teal-500/40 hover:text-teal-300',
    },
    {
      id: 'hindi',
      icon: Globe,
      label: isHindiMode ? 'English Summary' : 'हिंदी में समझाओ',
      prompt: isHindiMode
        ? `Please give a concise summary of ${matchedTopic || 'this'} in English.`
        : `कृपया मुझे यह विषय हिंदी में विस्तार से समझाओ।`,
      langOverride: isHindiMode ? 'en-IN' : 'hi-IN',
      color: 'hover:border-cyan-500/40 hover:text-cyan-300',
    },
    {
      id: 'quiz',
      icon: HelpCircle,
      label: isHindiMode ? 'मुझसे Quiz लो' : 'Quiz Me',
      prompt: isHindiMode
        ? `मुझसे ${matchedTopic ? `"${matchedTopic}"` : 'इस विषय'} पर एक छोटा सवाल पूछो ताकि मेरी समझ टेस्ट हो सके।`
        : `Ask me one short conceptual question about ${matchedTopic || 'this concept'} to test my understanding. I will answer!`,
      color: 'hover:border-purple-500/40 hover:text-purple-300',
    },
  ];

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-1 select-none">
      <div className="flex items-center justify-center flex-wrap gap-2">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <motion.button
              key={act.id}
              whileHover={{ scale: disabled ? 1 : 1.04, y: disabled ? 0 : -1 }}
              whileTap={{ scale: disabled ? 1 : 0.95 }}
              type="button"
              disabled={disabled}
              onClick={() => onSelectAction(act.prompt, act.langOverride)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-sans font-medium transition-all backdrop-blur-md shadow-sm border ${
                disabled
                  ? 'opacity-40 cursor-not-allowed bg-neutral-900/50 border-neutral-800 text-neutral-500'
                  : `bg-neutral-900/80 border-neutral-800 text-neutral-300 ${act.color} cursor-pointer hover:bg-neutral-850 hover:shadow-lg`
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{act.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
