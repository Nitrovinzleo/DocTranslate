import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, Presentation, FileCode, CheckCircle, ShieldAlert, FileUp } from 'lucide-react';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  disabled?: boolean;
}

export const DropZone: React.FC<DropZoneProps> = ({ onFileSelected, selectedFile, disabled }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndPassFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndPassFile(e.target.files[0]);
    }
  };

  const validateAndPassFile = (file: File) => {
    const validExtensions = ['.pdf', '.docx', '.pptx'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    if (isValid) {
      onFileSelected(file);
    } else {
      alert('Veuillez sélectionner un fichier au format PDF (.pdf), Word (.docx) ou PowerPoint (.pptx).');
    }
  };

  const getFileIcon = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.docx')) return <FileText className="w-12 h-12 text-blue-400" />;
    if (lower.endsWith('.pptx')) return <Presentation className="w-12 h-12 text-orange-400" />;
    return <FileCode className="w-12 h-12 text-red-400" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
      
      {/* Title */}
      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
        <div className="w-7 h-7 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-xs">
          2
        </div>
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <FileUp className="w-5 h-5 text-purple-400" />
          <span>Déposez votre fichier à traduire (PDF, Word, PowerPoint)</span>
        </h3>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.docx,.pptx"
        className="hidden"
        disabled={disabled}
      />

      {/* Main Drag Drop Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`relative group cursor-pointer border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center transition-all duration-300 ${
          isDragOver
            ? 'border-cyan-400 bg-cyan-950/40 scale-[1.01] shadow-2xl shadow-cyan-500/30'
            : selectedFile
            ? 'border-emerald-500/70 bg-emerald-950/20 shadow-lg shadow-emerald-500/10'
            : 'border-slate-700/80 hover:border-slate-500 bg-slate-950/80 hover:bg-slate-900'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-cyan-500/5 to-purple-500/5 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {selectedFile ? (
          <div className="flex flex-col items-center justify-center gap-4 py-2">
            <div className="p-5 bg-slate-900 rounded-2xl border border-slate-700/80 shadow-xl">
              {getFileIcon(selectedFile.name)}
            </div>
            <div className="max-w-md">
              <h3 className="font-bold text-slate-100 text-xl truncate flex items-center justify-center gap-2">
                <span>{selectedFile.name}</span>
                <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0 inline" />
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-medium">
                Taille : <strong className="text-slate-200">{formatFileSize(selectedFile.size)}</strong> • Cliquez ici si vous souhaitez remplacer ce document
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 py-6">
            <div className="p-5 bg-indigo-500/10 border border-indigo-500/30 rounded-3xl text-indigo-400 group-hover:scale-110 group-hover:text-cyan-400 transition-all duration-300 shadow-inner">
              <UploadCloud className="w-12 h-12" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-slate-100 group-hover:text-cyan-300 transition-colors">
                Glissez & Déposez votre document confidentiel ici
              </h3>
              <p className="text-xs text-slate-400">
                ou <span className="text-cyan-400 font-bold underline underline-offset-4">Cliquez pour parcourir vos fichiers localement</span>
              </p>
            </div>

            {/* Supported formats tags */}
            <div className="flex items-center gap-3 pt-3 flex-wrap justify-center">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-blue-400 shadow-sm">
                <FileText className="w-4 h-4" /> Word (.docx)
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-orange-400 shadow-sm">
                <Presentation className="w-4 h-4" /> PowerPoint (.pptx)
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-red-400 shadow-sm">
                <FileCode className="w-4 h-4" /> PDF (.pdf)
              </span>
            </div>

            <div className="text-xs text-emerald-400 font-medium flex items-center gap-1.5 mt-2 bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-800/40">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Garantie : Vos documents et images (OCR) ne sont jamais envoyés sur Internet.</span>
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
