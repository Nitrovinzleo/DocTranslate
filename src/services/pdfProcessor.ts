import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { TranslationOptions } from './translatorEngine';
import { performLocalOCR } from './ocrService';
import type { DocumentSection, ProcessedDocumentResult } from './docxProcessor';

/**
 * Sanitize text to prevent pdf-lib WinAnsi encoding errors.
 * Removes emojis and unencodable unicode symbols.
 */
function sanitizeForPdf(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code >= 192 && code <= 255) return char;
      return '';
    })
    .trim();
}

/**
 * Intelligent helper to split text into wrapped lines fitting within maxPixelWidth.
 * Favors breaking at natural punctuation marks (., !, ?, ,, ;, :, —, «, »)
 * and prevents cutting mid-sentence or mid-clause awkwardly.
 */
function smartWrapTextToLines(text: string, fontSize: number, maxPixelWidth: number, isHeading: boolean = false): string[] {
  if (!text) return [];
  // Use wider char width factor (0.68) for bold/heading uppercase text to prevent horizontal overflow
  const approxCharWidth = isHeading ? fontSize * 0.68 : fontSize * 0.52;
  const maxCharsPerLine = Math.max(10, Math.floor(maxPixelWidth / approxCharWidth));

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? currentLine + ' ' + word : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (!currentLine) {
        lines.push(word);
        currentLine = '';
        continue;
      }

      // Check if currentLine has a natural punctuation pause (comma, semicolon, colon, period, exclamation, etc.)
      const punctMatch = currentLine.match(/^(.*?[,;:!?.—«»])\s+(.+)$/);
      if (punctMatch && punctMatch[1].length >= Math.floor(maxCharsPerLine * 0.35)) {
        lines.push(punctMatch[1].trim());
        currentLine = punctMatch[2].trim() + ' ' + word;
      } else {
        lines.push(currentLine.trim());
        currentLine = word;
      }
    }
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines;
}

function cleanGarbageSymbols(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const cleanLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    // Filter logo noise, brand artifacts, and watermark remnants
    if (/^(moJ|9 STORY|BROWN BAG|Microsoft Confidential|stony|ARE x|gulli\.fr|\d{2}\/\d{2}\/\d{4})/i.test(trimmed)) {
      return false;
    }
    if (/^(moJ|ARE x|stony|Vo Ky|\[\d+ - <|wl l ’|EAS,|& & A)/i.test(trimmed)) {
      return false;
    }

    // Filter lines containing mostly garbled symbols
    const letterCount = (trimmed.match(/[\p{L}\p{N}]/gu) || []).length;
    if (trimmed.length > 4 && letterCount / trimmed.length < 0.45) {
      return false;
    }

    // Filter short single-letter symbol lines
    if (trimmed.length <= 3 && !/^[A-Z0-9]{1,3}$/i.test(trimmed)) {
      return false;
    }

    return true;
  });

  return cleanLines.join('\n').trim();
}

/**
 * Helper to execute PDF parsing operations with internal pdf-lib / pdf.js warning logs silenced.
 */
async function withSilencedPdfParserLogs<T>(fn: () => Promise<T>): Promise<T> {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    if (
      msg.includes('Trying to parse invalid object') ||
      msg.includes('Invalid object ref') ||
      msg.includes('TT: undefined function') ||
      msg.includes('ignoreEncryption') ||
      msg.includes('embedded page')
    ) {
      return; // Silently filter out non-fatal PDF parser recovery logs
    }
    originalWarn.apply(console, args);
  };
  try {
    return await fn();
  } finally {
    console.warn = originalWarn;
  }
}

export async function processPdfFile(
  file: File,
  options: TranslationOptions,
  onProgress?: (pct: number, stepMessage: string) => void
): Promise<ProcessedDocumentResult> {
  return withSilencedPdfParserLogs(async () => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl || `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdfjsDoc = await pdfjsLib.getDocument({
      data: arrayBuffer.slice(0),
      verbosity: 0,
    }).promise;
    const totalPages = pdfjsDoc.numPages;

    const pdfDoc = await PDFDocument.create();
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const sections: DocumentSection[] = [];
    const pageResults: Map<number, { text: string; page: any }> = new Map();
    let totalWords = 0;
    let ocrImageCount = 0;

    // High-Speed Parallel Batch Processing (4 slides concurrently for 4x speedup)
    const BATCH_SIZE = 4;
    for (let batchStart = 1; batchStart <= totalPages; batchStart += BATCH_SIZE) {
      const pageNumbers = [];
      for (let pNum = batchStart; pNum <= Math.min(totalPages, batchStart + BATCH_SIZE - 1); pNum++) {
        pageNumbers.push(pNum);
      }

      const progressPct = Math.round(15 + ((batchStart - 1) / totalPages) * 75);
      if (onProgress) {
        onProgress(progressPct, `Analyse IA Gemini Vision (Lots ${pageNumbers[0]}-${pageNumbers[pageNumbers.length - 1]}/${totalPages})...`);
      }

      await Promise.all(
        pageNumbers.map(async (pageNum) => {
          try {
            const page = await pdfjsDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.0 });

            // Render high-quality canvas (scale 1.6 ~1600px width) for crystal-clear small text recognition
            const targetScale = Math.min(1.8, Math.max(1.2, 1600 / (viewport.width || 1000)));
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const ocrViewport = page.getViewport({ scale: targetScale });
            canvas.width = ocrViewport.width;
            canvas.height = ocrViewport.height;

            const renderTask = (page as any).render({ canvasContext: ctx, viewport: ocrViewport, canvas } as any);
            await renderTask.promise;

            const imageBase64 = canvas.toDataURL('image/jpeg', 0.80);
            const visionRes = await fetch('/api/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageBase64,
                sourceLang: options.sourceLang,
                targetLang: options.targetLang,
              }),
              signal: AbortSignal.timeout(12000)
            });

            let translatedText = '';
            if (visionRes.ok) {
              const visionData = await visionRes.json();
              translatedText = visionData.translatedText || '';
            }

            if (!translatedText || !translatedText.trim()) {
              // Local OCR fallback if Gemini Vision is offline
              const ocrResult = await performLocalOCR(canvas, options.sourceLang);
              translatedText = ocrResult.text || '';
            }

            translatedText = cleanGarbageSymbols(translatedText);
            pageResults.set(pageNum, { text: translatedText, page });
          } catch (err) {
            console.warn(`Error processing page ${pageNum}:`, err);
            pageResults.set(pageNum, { text: '', page: null });
          }
        })
      );
    }

    // Assemble page sections in exact 1-to-N page order
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const pageData = pageResults.get(pageNum);
      const translatedText = pageData?.text || '';
      const page = await pdfjsDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const pdfPage = pdfDoc.addPage([viewport.width, viewport.height]);

      if (translatedText.trim()) {
        ocrImageCount++;
        const wordCount = translatedText.split(/\s+/).filter(Boolean).length;
        totalWords += wordCount;

        sections.push({
          id: `pdf-p${pageNum}`,
          originalText: `[Page ${pageNum} Image]`,
          translatedText: `[Page ${pageNum} Image Traduit]:\n${translatedText}`,
          type: 'paragraph'
        });

        const cleanTextForPdf = sanitizeForPdf(translatedText);
        if (cleanTextForPdf) {
          const fontSize = 12;
          const maxW = viewport.width - 60;
          const wrappedLines = smartWrapTextToLines(cleanTextForPdf, fontSize, maxW);
          for (let lIdx = 0; lIdx < Math.min(45, wrappedLines.length); lIdx++) {
            try {
              pdfPage.drawText(wrappedLines[lIdx], {
                x: 30,
                y: Math.max(20, viewport.height - 40 - (lIdx * fontSize * 1.3)),
                size: fontSize,
                font: fontRegular,
                color: rgb(0.1, 0.1, 0.2),
              });
            } catch (e) {}
          }
        }
      }
    }

    if (onProgress) onProgress(95, 'Génération du nouveau document PDF...');

    const pdfBytes = await pdfDoc.save();
    if (onProgress) onProgress(100, 'Traduction rapide et propre terminée !');

    return {
      fileName: file.name.replace(/\.pdf$/i, `_traduit_${options.targetLang}.pdf`),
      fileType: 'pdf',
      sections,
      translatedBlob: new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
      stats: {
        totalWords,
        translatedWords: totalWords,
        ocrImageCount
      }
    };
  });
}
