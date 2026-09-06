import React from 'react';
import { ArrowRightLeft, Languages, Sparkles } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../services/translatorEngine';
import type { LanguageOption } from '../services/translatorEngine';

interface LanguageSelectorProps {
  sourceLang: string;
  targetLang: string;
  setSourceLang: (lang: string) => void;
  setTargetLang: (lang: string) => void;
  disabled?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  sourceLang,
  targetLang,
  setSourceLang,
  setTargetLang,
  disabled
}) => {
  const swapLanguages = () => {
    if (disabled) return;
    const temp = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(temp);
  };

  const setPair = (src: string, tgt: string) => {
    if (disabled) return;
    setSourceLang(src);
    setTargetLang(tgt);
  };

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs">
            1
          </div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Languages className="w-5 h-5 text-cyan-400" />
            <span>Sélectionnez les langues de traduction</span>
          </h3>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" /> Raccourcis :
          </span>
          <button
            onClick={() => setPair('en', 'fr')}
            disabled={disabled}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
              sourceLang === 'en' && targetLang === 'fr'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            🇬🇧 Anglais ➡️ 🇫🇷 Français
          </button>

          <button
            onClick={() => setPair('fr', 'en')}
            disabled={disabled}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
              sourceLang === 'fr' && targetLang === 'en'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            🇫🇷 Français ➡️ 🇬🇧 Anglais
          </button>

          <button
            onClick={() => setPair('es', 'fr')}
            disabled={disabled}
            className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all ${
              sourceLang === 'es' && targetLang === 'fr'
                ? 'bg-cyan-500/20 border border-cyan-400 text-cyan-300'
                : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            🇪🇸 Espagnol ➡️ 🇫🇷 Français
          </button>
        </div>
      </div>

      {/* Selectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center">
        
        {/* Source Language Select */}
        <div className="md:col-span-5 relative">
          <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
            <span>Langue du document d'origine (Source) :</span>
            <span className="text-[10px] text-cyan-400 font-normal">Détection auto / Choisir</span>
          </label>
          <div className="relative">
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              disabled={disabled}
              className="w-full bg-slate-950 border border-slate-750 focus:border-cyan-500 rounded-2xl px-4 py-3.5 text-slate-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500/20 cursor-pointer disabled:opacity-50 transition-all shadow-inner"
            >
              {SUPPORTED_LANGUAGES.map((lang: LanguageOption) => (
                <option key={`src-${lang.code}`} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Swap Button */}
        <div className="md:col-span-1 flex justify-center pt-2 md:pt-6">
          <button
            onClick={swapLanguages}
            disabled={disabled}
            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl transition-all shadow-md hover:scale-110 active:scale-95 disabled:opacity-50 border border-slate-700"
            title="Inverser les langues"
          >
            <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
          </button>
        </div>

        {/* Target Language Select */}
        <div className="md:col-span-5 relative">
          <label className="block text-xs font-semibold text-slate-300 mb-2">
            Langue de traduction souhaitée (Destination) :
          </label>
          <div className="relative">
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              disabled={disabled}
              className="w-full bg-slate-950 border border-slate-750 focus:border-indigo-500 rounded-2xl px-4 py-3.5 text-slate-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer disabled:opacity-50 transition-all shadow-inner"
            >
              {SUPPORTED_LANGUAGES.map((lang: LanguageOption) => (
                <option key={`tgt-${lang.code}`} value={lang.code}>
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>
        </div>

      </div>
    </div>
  );
};
