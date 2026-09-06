import React from 'react';
import { ShieldCheck, Cpu, HardDriveDownload, Sparkles, HelpCircle, Lock } from 'lucide-react';
import type { TranslationEngineMode } from '../services/translatorEngine';

interface HeaderProps {
  engineMode: TranslationEngineMode;
  setEngineMode: (mode: TranslationEngineMode) => void;
  onOpenPrivacyModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  engineMode,
  setEngineMode,
  onOpenPrivacyModal,
}) => {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-slate-800/80 px-4 lg:px-8 py-3.5 shadow-xl transition-all duration-300">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand Logo & Avatar */}
        <div className="flex items-center gap-3.5">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-cyan-500 p-0.5 shadow-lg shadow-indigo-500/25 group">
            <img
              src="https://github.com/Nitrovinzleo.png"
              alt="Nitrovinzleo Avatar Logo"
              className="w-full h-full object-cover rounded-[14px] border border-slate-900 group-hover:scale-105 transition-transform"
              onError={(e) => {
                // Fallback icon if image fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                DocTranslate <span className="text-cyan-400 text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/60 uppercase tracking-widest ml-1">Studio</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
              <Lock className="w-3 h-3 text-emerald-400 inline" />
              <span>100% Confidentiel & Client-Side (0 données envoyées)</span>
            </p>
          </div>
        </div>

        {/* Engine Switcher & Privacy Status */}
        <div className="flex items-center gap-3 flex-wrap justify-center">
          
          <div className="flex items-center bg-slate-950/90 border border-slate-800 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setEngineMode('browser-ai')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                engineMode === 'browser-ai'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Exécute un modèle IA directement dans votre navigateur"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>IA Locale</span>
            </button>

            <button
              onClick={() => setEngineMode('fast-rule')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                engineMode === 'fast-rule'
                  ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white shadow-md shadow-cyan-500/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Traduction instantanée basée sur dictionnaire local"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mode Rapide</span>
            </button>

            <button
              onClick={() => setEngineMode('local-ollama')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                engineMode === 'local-ollama'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/25'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Connecteur vers un serveur Ollama local (localhost:11434)"
            >
              <HardDriveDownload className="w-3.5 h-3.5" />
              <span>Ollama Local</span>
            </button>
          </div>

          <button
            onClick={onOpenPrivacyModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/60 text-xs font-semibold transition-all hover:scale-105 shadow-sm"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sécurité & 0 Fuite</span>
            <HelpCircle className="w-3.5 h-3.5 opacity-70 ml-0.5" />
          </button>

        </div>
      </div>
    </header>
  );
};
