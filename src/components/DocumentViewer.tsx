import React, { useState } from 'react';
import { Download, Edit3, Check, RefreshCw, FileText, Image, ShieldCheck } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { ProcessedDocumentResult, DocumentSection } from '../services/docxProcessor';

interface DocumentViewerProps {
  result: ProcessedDocumentResult;
  onReset: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ result, onReset }) => {
  const [sections, setSections] = useState<DocumentSection[]>(result.sections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleDownload = () => {
    triggerConfetti();
    const url = URL.createObjectURL(result.translatedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const startEdit = (section: DocumentSection) => {
    setEditingId(section.id);
    setEditText(section.translatedText);
  };

  const saveEdit = (id: string) => {
    setSections(prev =>
      prev.map(sec => sec.id === id ? { ...sec, translatedText: editText } : sec)
    );
    setEditingId(null);
  };

  return (
    <div className="w-full space-y-6 animate-fadeIn">
      
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Traduction Prête (Confidentielle)
            </span>
          </div>

          <h2 className="text-xl font-extrabold text-white mt-2 truncate max-w-xl">
            {result.fileName}
          </h2>

          <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 font-medium">
            <span>Mots traités : <strong className="text-slate-200">{result.stats.totalWords}</strong></span>
            <span>•</span>
            <span>Segments : <strong className="text-slate-200">{sections.length}</strong></span>
            {result.stats.ocrImageCount > 0 && (
              <>
                <span>•</span>
                <span className="text-purple-400 flex items-center gap-1">
                  <Image className="w-3.5 h-3.5" />
                  <strong>{result.stats.ocrImageCount}</strong> image(s) OCR traduite(s)
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={onReset}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Nouveau document</span>
          </button>

          <button
            onClick={handleDownload}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-sm font-extrabold shadow-lg shadow-emerald-500/25 transition-all hover:scale-105"
          >
            <Download className="w-5 h-5" />
            <span>Télécharger le document traduit</span>
          </button>
        </div>

      </div>

      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <span>Prévisualisation côte à côte & Édition manuelle</span>
          </h3>
          <span className="text-xs text-slate-500">
            Cliquez sur l'icône de crayon pour ajuster un texte avant le téléchargement
          </span>
        </div>

        <div className="space-y-3 max-h-[550px] overflow-y-auto pr-2 custom-scrollbar">
          {sections.map((sec, idx) => (
            <div
              key={sec.id || idx}
              className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl border transition-all ${
                sec.type === 'image-ocr'
                  ? 'bg-purple-950/20 border-purple-800/40'
                  : 'bg-slate-950/60 border-slate-850 hover:border-slate-700'
              }`}
            >
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Original ({sec.type})
                </span>
                <p className="text-xs text-slate-300 leading-relaxed font-mono bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50">
                  {sec.originalText}
                </p>
              </div>

              <div className="space-y-1 relative group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                    Traduction
                  </span>
                  {editingId !== sec.id && (
                    <button
                      onClick={() => startEdit(sec)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-cyan-400 transition-opacity"
                      title="Éditer le texte"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {editingId === sec.id ? (
                  <div className="flex items-center gap-2">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full text-xs text-white bg-slate-900 border border-cyan-500 rounded-xl p-2.5 focus:outline-none"
                      rows={2}
                    />
                    <button
                      onClick={() => saveEdit(sec.id)}
                      className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-cyan-100 font-medium leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                    {sec.translatedText}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
