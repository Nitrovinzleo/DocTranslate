import React from 'react';
import { ShieldCheck, Cpu, Sparkles, HelpCircle, Lock } from 'lucide-react';
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
          <a
            href="https://github.com/Nitrovinzleo"
            target="_blank"
            rel="noopener noreferrer"
            title="Voir le profil GitHub Nitrovinzleo"
            className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-cyan-500 p-0.5 shadow-lg shadow-indigo-500/25 group transition-transform hover:scale-105"
          >
            <img
              src="https://github.com/Nitrovinzleo.png"
              alt="Nitrovinzleo Avatar Logo"
              className="w-full h-full object-cover rounded-[14px] border border-slate-900"
              onError={(e) => {
                // Fallback icon if image fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </a>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-cyan-300 bg-clip-text text-transparent">
                DocTranslate <span className="text-cyan-400 text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/60 uppercase tracking-widest ml-1">Studio</span>
              </h1>
            </div>
            <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400 inline shrink-0" />
              <span>100% Confidentiel • IA sur nos serveurs (Réinitialisée à chaque utilisation – 0 fuite)</span>
            </p>
          </div>
        </div>

        {/* Engine Switcher & Privacy Status */}
        <div className="flex items-center gap-3 flex-wrap justify-center">

          <div className="flex items-center bg-slate-950/90 border border-slate-800 rounded-xl p-1 shadow-inner flex-wrap">
            <button
              onClick={() => setEngineMode('serverless-ai')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${engineMode === 'serverless-ai'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-500/25'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
              title="Traduction ultra-rapide par lots via API confidentielle Vercel (0 stockage, 0 log)"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>Serveur Confidentiel</span>
            </button>

            <button
              onClick={() => setEngineMode('browser-ai')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${engineMode === 'browser-ai'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25'
                  : 'text-slate-400 hover:text-slate-200'
                }`}
              title="Exécute un modèle IA (WASM) 100% dans votre navigateur sans serveur"
            >
              <Cpu className="w-3.5 h-3.5 text-purple-300" />
              <span>IA Locale (Navigateur)</span>
            </button>


          </div>

          <button
            onClick={() => {
              const currentKey = localStorage.getItem('gemini_api_key') || '';
              const key = prompt('Entrez votre clé API Google Gemini (gratuite sur aistudio.google.com/app/apikey) :', currentKey);
              if (key !== null) {
                if (key.trim()) {
                  localStorage.setItem('gemini_api_key', key.trim());
                  alert('✨ Clé Gemini enregistrée avec succès ! Le site fonctionnera en connexion directe ultra-rapide.');
                } else {
                  localStorage.removeItem('gemini_api_key');
                  alert('Clé supprimée. Le site utilisera le serveur par défaut.');
                }
                window.location.reload();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 border border-purple-800/60 text-purple-300 hover:bg-purple-900/60 text-xs font-semibold transition-all hover:scale-105 shadow-sm cursor-pointer"
            title="Configurez votre clé Gemini personnelle pour une vitesse directe instantanée"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>{typeof window !== 'undefined' && localStorage.getItem('gemini_api_key') ? 'Clé Gemini Active ✨' : 'Clé API Gemini'}</span>
          </button>

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
