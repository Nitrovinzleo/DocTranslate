import { useState } from 'react';
import { Header } from './components/Header';
import { DropZone } from './components/DropZone';
import { LanguageSelector } from './components/LanguageSelector';
import { TranslationProgress } from './components/TranslationProgress';
import { DocumentViewer } from './components/DocumentViewer';
import { PrivacyBadge } from './components/PrivacyBadge';
import type { TranslationEngineMode, TranslationOptions } from './services/translatorEngine';
import { processDocxFile } from './services/docxProcessor';
import type { ProcessedDocumentResult } from './services/docxProcessor';
import { processPptxFile } from './services/pptxProcessor';
import { processPdfFile } from './services/pdfProcessor';
import { ShieldCheck, Play, Sparkles, FileText, Lock, Cpu } from 'lucide-react';

export function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceLang, setSourceLang] = useState<string>('en');
  const [targetLang, setTargetLang] = useState<string>('fr');
  const [engineMode, setEngineMode] = useState<TranslationEngineMode>('browser-ai');

  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const [processedResult, setProcessedResult] = useState<ProcessedDocumentResult | null>(null);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState<boolean>(false);

  const handleStartTranslation = async () => {
    if (!selectedFile) return;

    setIsTranslating(true);
    setProgressPct(5);
    setStatusMessage('Initialisation du processus 100% local...');
    setProcessedResult(null);

    const options: TranslationOptions = {
      sourceLang,
      targetLang,
      engineMode,
      onProgress: (pct, msg) => {
        setProgressPct(pct);
        setStatusMessage(msg);
      }
    };

    try {
      const fileName = selectedFile.name.toLowerCase();
      let result: ProcessedDocumentResult;

      if (fileName.endsWith('.docx')) {
        result = await processDocxFile(selectedFile, options, options.onProgress);
      } else if (fileName.endsWith('.pptx')) {
        result = await processPptxFile(selectedFile, options, options.onProgress);
      } else if (fileName.endsWith('.pdf')) {
        result = await processPdfFile(selectedFile, options, options.onProgress);
      } else {
        throw new Error('Format de fichier non pris en charge');
      }

      setProcessedResult(result);
    } catch (err: any) {
      console.error('Erreur lors de la traduction locale :', err);
      alert(`Erreur lors du traitement du document : ${err?.message || err}`);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setProcessedResult(null);
    setIsTranslating(false);
    setProgressPct(0);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-slate-950">
      
      {/* Top Header */}
      <Header
        engineMode={engineMode}
        setEngineMode={setEngineMode}
        onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* Privacy Banner */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/50 text-emerald-300 text-xs sm:text-sm font-medium shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <strong className="text-white font-bold">100% Confidentiel & Zéro Fuite :</strong>
              <span className="ml-1 text-slate-300">
                Vos documents et images restent exclusivement sur votre appareil. L'IA tourne en mémoire locale (Inférence seule - aucun ré-entraînement possible).
              </span>
            </div>
          </div>
          <button
            onClick={() => setIsPrivacyModalOpen(true)}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-800/80 text-emerald-200 text-xs font-semibold border border-emerald-700/60 transition-all cursor-pointer"
          >
            En savoir plus
          </button>
        </div>

        {/* Hero Title */}
        {!processedResult && !isTranslating && (
          <div className="text-center space-y-3 py-2">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Studio de Traduction de Documents <span className="bg-gradient-to-r from-cyan-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Confidentiel 100% Local</span>
            </h2>
            <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Traduisez intégralement vos fichiers <strong className="text-slate-200">PDF</strong>, <strong className="text-slate-200">Word (.docx)</strong> et <strong className="text-slate-200">PowerPoint (.pptx)</strong> en préservant fidèlement la mise en page, les styles et le texte des images (OCR).
            </p>
          </div>
        )}

        {/* Step-by-step interactive workflow */}
        {!processedResult && !isTranslating && (
          <div className="space-y-8 animate-fadeIn">
            
            {/* Step 1: Language Selection */}
            <LanguageSelector
              sourceLang={sourceLang}
              targetLang={targetLang}
              setSourceLang={setSourceLang}
              setTargetLang={setTargetLang}
              disabled={isTranslating}
            />

            {/* Step 2: Document Dropzone */}
            <DropZone
              onFileSelected={setSelectedFile}
              selectedFile={selectedFile}
              disabled={isTranslating}
            />

            {/* Step 3: Launch Action Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shadow-md">
                  3
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">
                    {selectedFile ? 'Fichier prêt à être traduit' : 'Sélectionnez un fichier ci-dessus'}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {selectedFile 
                      ? `${selectedFile.name} -> Traduction en ${targetLang.toUpperCase()}`
                      : 'Déposez un fichier PDF, Word ou PowerPoint pour démarrer la traduction locale'
                    }
                  </p>
                </div>
              </div>

              <button
                onClick={handleStartTranslation}
                disabled={!selectedFile || isTranslating}
                className={`w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-extrabold text-sm transition-all shadow-xl ${
                  selectedFile
                    ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white shadow-indigo-500/30 hover:scale-105 active:scale-95 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Traduire le document maintenant</span>
                <Sparkles className="w-5 h-5 text-cyan-200" />
              </button>
            </div>

            {/* Features summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-1.5">
                <div className="w-8 h-8 mx-auto rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-slate-200">Preservation 100% Layout</h4>
                <p className="text-[11px] text-slate-400">Modifie les nœuds XML internes sans déformer vos documents Word et PowerPoint.</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-1.5">
                <div className="w-8 h-8 mx-auto rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                  <Cpu className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-slate-200">OCR Texte en Image Integré</h4>
                <p className="text-[11px] text-slate-400">Reconnaît et traduit automatiquement le texte figé dans les schémas et images (Tesseract WASM).</p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-1.5">
                <div className="w-8 h-8 mx-auto rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <h4 className="text-xs font-bold text-slate-200">Zéro Fuite de Données</h4>
                <p className="text-[11px] text-slate-400">Fonctionne entièrement en local sans aucune clé API externe ni stockage cloud.</p>
              </div>
            </div>

          </div>
        )}

        {/* Translation Progress */}
        {isTranslating && (
          <TranslationProgress
            progress={progressPct}
            statusMessage={statusMessage}
          />
        )}

        {/* Completed Document Preview & Download */}
        {processedResult && !isTranslating && (
          <DocumentViewer
            result={processedResult}
            onReset={handleReset}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span>DocTranslate Local Studio • 100% Confidential Client-Side Processing</span>
          </div>
          <div>
            Format pris en charge : <strong>PDF, DOCX, PPTX</strong> avec OCR local.
          </div>
        </div>
      </footer>

      {/* Privacy Guarantee Modal */}
      <PrivacyBadge
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />

    </div>
  );
}

export default App;
