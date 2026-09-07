import React, { useState, useEffect, useMemo } from 'react';
import { Download, Edit3, Check, RefreshCw, FileText, ShieldCheck, FileDown, Copy, CheckCheck, Layers, Sparkles, Timer } from 'lucide-react';
import confetti from 'canvas-confetti';
import type { ProcessedDocumentResult, DocumentSection } from '../services/docxProcessor';
import { generateTextOnlyDocxBlob } from '../services/docxExporter';

interface DocumentViewerProps {
  result: ProcessedDocumentResult;
  onReset: () => void;
}

interface PageGroup {
  pageLabel: string;
  sections: DocumentSection[];
}

function cleanPrefix(text: string): string {
  if (!text) return '';
  return text
    .replace(/^\[Page \d+ (?:OCR|OCR Traduit|Traduit|Image|Image Traduit)\]:\s*/i, '')
    .replace(/^\[Diapositive \d+ (?:Image|Image OCR|OCR)(?: Traduit)?\]:\s*/i, '')
    .replace(/^\[Diapositive \d+(?: Traduit)?\]:\s*/i, '')
    .replace(/^\[Image (?:Diapositive|PowerPoint|Word)? (?:OCR|OCR Traduit|Traduit)?\]:\s*/i, '')
    .replace(/^\[.*?\]:\s*/i, '')
    .trim();
}

function groupSectionsByPage(sections: DocumentSection[]): PageGroup[] {
  const groupsMap = new Map<string, DocumentSection[]>();

  for (const sec of sections) {
    const raw = sec.originalText || sec.translatedText || '';
    let label = 'Page 1';

    const textMatch = raw.match(/^\[(Page \d+|Diapositive \d+|Slide \d+)/i);
    if (textMatch) {
      label = textMatch[1];
    } else {
      const idMatch = (sec.id || '').match(/^(?:pdf-p|pdf-ocr-|slide-)(\d+)/i);
      if (idMatch) {
        label = (sec.id || '').startsWith('slide') ? `Diapositive ${idMatch[1]}` : `Page ${idMatch[1]}`;
      }
    }

    if (!groupsMap.has(label)) {
      groupsMap.set(label, []);
    }
    groupsMap.get(label)!.push(sec);
  }

  const groups: PageGroup[] = [];
  for (const [pageLabel, pageSections] of groupsMap.entries()) {
    groups.push({ pageLabel, sections: pageSections });
  }

  groups.sort((a, b) => {
    const numA = parseInt(a.pageLabel.match(/\d+/)?.[0] || '0', 10);
    const numB = parseInt(b.pageLabel.match(/\d+/)?.[0] || '0', 10);
    return numA - numB;
  });

  return groups;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({ result, onReset }) => {
  const [sections, setSections] = useState<DocumentSection[]>(result.sections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    setSections(result.sections);
  }, [result]);

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
      const docxFileName = `${baseName}_texte_traduit.docx`;

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

  const handleCopyAllText = () => {
    const pageGroups = groupSectionsByPage(sections);
    const fullMarkdown = pageGroups.map(group => {
      const pageContent = group.sections.map(s => cleanPrefix(s.translatedText)).filter(Boolean).join('\n\n');
      return `--- ${group.pageLabel} ---\n\n${pageContent}`;
    }).join('\n\n=====================\n\n');

    navigator.clipboard.writeText(fullMarkdown);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2500);
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

  const pageGroups = useMemo(() => groupSectionsByPage(sections), [sections]);

  return (
    <div className="w-full space-y-6 animate-fadeIn">
      
      {/* Top Banner & Main Actions */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 overflow-hidden backdrop-blur-md">
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-800 text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Traduction Réussie & Structurée
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-white mt-2 truncate max-w-full lg:max-w-xl">
            {result.fileName}
          </h2>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-400 mt-1 font-medium">
            <span>Mots traités : <strong className="text-slate-200">{result.stats.totalWords}</strong></span>
            <span>•</span>
            <span>Pages / Sections : <strong className="text-slate-200">{pageGroups.length}</strong></span>
            {result.stats.ocrImageCount > 0 && (
              <>
                <span>•</span>
                <span className="text-purple-400 flex items-center gap-1 font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <strong>{result.stats.ocrImageCount}</strong> diapositive(s) Gemini Vision
                </span>
              </>
            )}
            {result.stats.processingTimeMs && (
              <>
                <span>•</span>
                <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                  <Timer className="w-3.5 h-3.5 text-emerald-400" />
                  <strong>{(result.stats.processingTimeMs / 1000).toFixed(1)}s</strong> (Temps de traduction)
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto shrink-0 flex-wrap">
          <button
            onClick={onReset}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all shrink-0 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Nouveau document</span>
          </button>

          <button
            onClick={handleCopyAllText}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer shrink-0 whitespace-nowrap"
            title="Copier tout le texte traduit dans le presse-papier"
          >
            {isCopied ? <CheckCheck className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
            <span>{isCopied ? 'Texte copié !' : 'Copier tout le texte'}</span>
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

      {/* Main Preview Container Grouped by Page/Slide */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <span>Prévisualisation & Traduction Structurée (Par Page / Diapositive)</span>
          </h3>
          <span className="text-xs text-slate-400 hidden sm:inline">
            Cliquez sur l'icône de crayon pour éditer un segment avant le téléchargement
          </span>
        </div>

        <div className="space-y-6 max-h-[650px] overflow-y-auto pr-2 custom-scrollbar">
          {pageGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-5 space-y-4 shadow-md">
              
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                <span className="px-3 py-1 rounded-xl bg-cyan-950/80 border border-cyan-800/60 text-cyan-300 text-xs font-bold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  {group.pageLabel}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {group.sections.length} segment(s)
                </span>
              </div>

              <div className="space-y-3">
                {group.sections.map((sec, idx) => {
                  const originalClean = cleanPrefix(sec.originalText);
                  const translatedClean = cleanPrefix(sec.translatedText);

                  return (
                    <div
                      key={sec.id || idx}
                      className={`grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border transition-all ${
                        sec.type === 'image-ocr'
                          ? 'bg-purple-950/30 border-purple-800/40'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Original {sec.type === 'image-ocr' && '(OCR Image)'}
                        </span>
                        <p className="text-xs text-slate-300 leading-relaxed font-sans bg-slate-950/60 p-3 rounded-xl border border-slate-800/50 whitespace-pre-wrap">
                          {originalClean || sec.originalText}
                        </p>
                      </div>

                      <div className="space-y-1 relative group">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                            Traduction
                          </span>
                          {editingId !== sec.id && (
                            <button
                              onClick={() => startEdit(sec)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-cyan-400 transition-opacity cursor-pointer"
                              title="Éditer la traduction"
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
                              className="w-full text-xs text-white bg-slate-950 border border-cyan-500 rounded-xl p-3 focus:outline-none"
                              rows={3}
                            />
                            <button
                              onClick={() => saveEdit(sec.id)}
                              className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl cursor-pointer shrink-0"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-cyan-100 font-medium leading-relaxed bg-slate-950/90 p-3 rounded-xl border border-cyan-900/40 whitespace-pre-wrap">
                            {translatedClean || sec.translatedText}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

