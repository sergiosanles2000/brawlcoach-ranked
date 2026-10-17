import React from 'react';
import { X, Sparkles, Check } from 'lucide-react';

export interface GuideStep {
  id: string;
  title: string;
  description: string;
  badge?: string;
  actionText?: string;
}

interface InteractiveGuideProps {
  currentStep: GuideStep | null;
  onDismiss: () => void;
  onComplete: () => void;
}

const STORAGE_SEEN_GUIDES = 'brawldraft_seen_guides_v1';

export function getSeenGuides(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_SEEN_GUIDES);
    if (raw) {
      return new Set(JSON.parse(raw));
    }
  } catch {}
  return new Set();
}

export function markGuideAsSeen(guideId: string) {
  try {
    const seen = getSeenGuides();
    seen.add(guideId);
    localStorage.setItem(STORAGE_SEEN_GUIDES, JSON.stringify(Array.from(seen)));
  } catch {}
}

export const InteractiveGuide: React.FC<InteractiveGuideProps> = ({
  currentStep,
  onDismiss,
  onComplete,
}) => {
  if (!currentStep) return null;

  return (
    <div className="fixed bottom-14 left-0 right-0 z-40 px-3 pointer-events-none animate-slide-up">
      <div className="max-w-md mx-auto pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-cyan-500/50 rounded-2xl p-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.6)] flex flex-col gap-2 relative ring-1 ring-cyan-500/30">
        {/* Top Accent Dot */}
        <div className="absolute -top-1.5 left-8 w-3 h-3 bg-cyan-500 rotate-45 border-t border-l border-cyan-400" />

        {/* Header with Title and Close */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="p-1 rounded-md bg-cyan-500/20 text-cyan-400">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-black uppercase tracking-wider text-cyan-300">
              {currentStep.title}
            </span>
            {currentStep.badge && (
              <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-slate-800 text-slate-300 border border-slate-700">
                {currentStep.badge}
              </span>
            )}
          </div>

          <button
            onClick={onDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cerrar guía"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content text */}
        <p className="text-xs text-slate-200 leading-snug">
          {currentStep.description}
        </p>

        {/* Actions row */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-slate-500">
            Consejo interactivo (solo 1 vez)
          </span>

          <button
            onClick={onComplete}
            className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
          >
            <span>{currentStep.actionText || 'Entendido'}</span>
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
