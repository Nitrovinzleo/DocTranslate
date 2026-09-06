import React from 'react';
import { Loader2, Cpu, CheckCircle2, ShieldCheck } from 'lucide-react';

interface TranslationProgressProps {
  progress: number;
  statusMessage: string;
}

export const TranslationProgress: React.FC<TranslationProgressProps> = ({
  progress,
  statusMessage,
}) => {
  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl animate-fadeIn">
      
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl text-indigo-400">
            <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Traduction confidentielle en cours...
            </h3>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Traitement 100% local dans la mémoire de votre navigateur</span>
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-3xl font-extrabold bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            {progress}%
          </span>
        </div>
      </div>

      <div className="relative w-full h-4 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800 shadow-inner">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full transition-all duration-300 shadow-lg shadow-cyan-500/30 relative"
          style={{ width: `${Math.max(5, progress)}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400 font-medium">
        <span className="flex items-center gap-1.5 text-slate-200">
          <Cpu className="w-4 h-4 text-cyan-400 animate-pulse" />
          {statusMessage || 'Préparation du document...'}
        </span>

        <span className="flex items-center gap-1 text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          0 octet transmis
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-slate-800/80 text-[11px] text-center">
        <div className={`p-2.5 rounded-xl border transition-all ${
          progress >= 20
            ? 'bg-indigo-950/40 border-indigo-800/60 text-indigo-300 font-semibold'
            : 'bg-slate-950/40 border-slate-800 text-slate-500'
        }`}>
          1. Extraction XML / PDF
        </div>

        <div className={`p-2.5 rounded-xl border transition-all ${
          progress >= 40
            ? 'bg-purple-950/40 border-purple-800/60 text-purple-300 font-semibold'
            : 'bg-slate-950/40 border-slate-800 text-slate-500'
        }`}>
          2. OCR & Traduction IA
        </div>

        <div className={`p-2.5 rounded-xl border transition-all ${
          progress >= 90
            ? 'bg-cyan-950/40 border-cyan-800/60 text-cyan-300 font-semibold'
            : 'bg-slate-950/40 border-slate-800 text-slate-500'
        }`}>
          3. Reconstruction Layout
        </div>
      </div>

    </div>
  );
};
