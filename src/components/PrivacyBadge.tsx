import React from 'react';
import { ShieldCheck, Lock, EyeOff, ServerOff, WifiOff, X, CheckCircle2 } from 'lucide-react';

interface PrivacyBadgeProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyBadge: React.FC<PrivacyBadgeProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-emerald-500/10 overflow-hidden">
        
        {/* Decorative Background Glow */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/60 hover:bg-slate-800 transition-all"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              Charte de Confidentialité & Sécurité Totale
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Garantie d'exécution 100% Client-Side sans transmission ni stockage
            </p>
          </div>
        </div>

        {/* Security Points Grid */}
        <div className="space-y-4 text-slate-300 text-sm">
          
          <div className="flex items-start gap-3.5 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <ServerOff className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-white text-sm">0 Téléversement Serveur</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Vos documents (Word, PDF, PowerPoint) sont lus, décodés et traduits intégralement dans la mémoire RAM de votre propre navigateur internet.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <EyeOff className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-white text-sm">Zéro Entraînement d'IA & Confidentialité Absolue</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Le modèle IA (`Transformers.js`) tourne en mode lecture seule (Inference Only). Aucun prompt, texte ou document n'est sauvegardé ou utilisé pour entraîner une intelligence artificielle.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <WifiOff className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-white text-sm">Fonctionne 100% Hors-Ligne (Offline Ready)</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Une fois la page chargée dans votre navigateur, vous pouvez couper l'accès Internet (Wi-Fi / Ethernet) : l'application continuera de fonctionner normalement.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5 p-3.5 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <Lock className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-white text-sm">OCR Local sur les Images (`Tesseract.js`)</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                La reconnaissance de texte dans les images et scans se fait au moyen d'un binaire WebAssembly s'exécutant en local dans votre navigateur.
              </p>
            </div>
          </div>

        </div>

        {/* Verification Checklist */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <CheckCircle2 className="w-4 h-4" />
            <span>Audité pour documents ultra-confidentiels</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
          >
            J'ai compris
          </button>
        </div>

      </div>
    </div>
  );
};
