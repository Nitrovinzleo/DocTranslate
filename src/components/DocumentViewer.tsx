import React, { useState } from 'react';
import { Download, Edit3, Check, RefreshCw, FileText, Image, ShieldCheck, FileDown } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { ProcessedDocumentResult, DocumentSection } from '../services/docxProcessor';
import { generateTextOnlyDocxBlob } from '../services/docxExporter';

interface DocumentViewerProps {
  result: ProcessedDocumentResult;
  onReset: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ result, onReset }) => {
  const [sections, setSections] = useState<DocumentSection[]>(result.sections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isExportingDocx, setIsExportingDocx] = useState(false);

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

  const handleDownloadDocxTextOnly = async () => {
    try {
      setIsExportingDocx(true);
      const docxBlob = await generateTextOnlyDocxBlob(sections);
      triggerConfetti();

      const baseName = result.fileName.replace(/\.(pdf|docx|pptx)$/i, '');
      const docxFileName = `${baseName}_texte_seul.docx`;

      const url = URL.createObjectURL(docxBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = docxFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erreur lors de la création du fichier Word :', err);
      alert('Erreur lors de la génération du fichier Word.');
    } finally {
      setIsExportingDocx(false);
    }
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
      
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 overflow-hidden">
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Traduction Prête (Confidentielle)
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-extrabold text-white mt-2 truncate max-w-full lg:max-w-xl">
            {result.fileName}
          </h2>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-400 mt-1 font-medium">
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

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0 flex-wrap">
          <button
            onClick={onReset}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Nouveau document</span>
          </button>

          <button
            onClick={handleDownloadDocxTextOnly}
            disabled={isExportingDocx}
            title="Télécharge tout le texte extrait et traduit dans un document Word (.docx) propre"
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap cursor-pointer"
          >
            <FileDown className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span>{isExportingDocx ? 'Génération Word...' : 'Télécharger en Word (.docx)'}</span>
          </button>

          <button
            onClick={handleDownload}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-5 sm:px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white text-xs sm:text-sm font-extrabold shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span>Télécharger le {result.fileType.toUpperCase()} traduit</span>
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
