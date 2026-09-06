import { translateText } from './translatorEngine';
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

export async function processPdfFile(
  file: File,
  options: TranslationOptions,
  onProgress?: (pct: number, stepMessage: string) => void
): Promise<ProcessedDocumentResult> {
  if (onProgress) onProgress(10, 'Lecture et analyse du document PDF...');

  const pdfjsLib = await import('pdfjs-dist');
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdfjsDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const totalPages = pdfjsDoc.numPages;

  const pdfDoc = await PDFDocument.create();
  
  // Embed original PDF pages as stable vector background templates (retains all background images, logos & visual styles)
  let embeddedPages: any[] = [];
  try {
    embeddedPages = await pdfDoc.embedPdf(arrayBuffer.slice(0));
  } catch (err) {
    console.warn('embedPdf fallback warning:', err);
  }

  const sections: DocumentSection[] = [];
  let totalWords = 0;
  let ocrImageCount = 0;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const currentProgress = Math.round(15 + (pageNum / totalPages) * 75);
    if (onProgress) onProgress(currentProgress, `Traduction et superposition de la page PDF ${pageNum}/${totalPages}...`);

    const page = await pdfjsDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });

    const newPage = pdfDoc.addPage([viewport.width, viewport.height]);

    // Draw background original page with all images, artwork and graphics intact
    if (embeddedPages && embeddedPages[pageNum - 1]) {
      try {
        newPage.drawPage(embeddedPages[pageNum - 1], {
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height,
        });
      } catch (e) {
        console.warn('Could not draw embedded page background:', e);
      }
    }

    const textContent = await page.getTextContent();
    const textItems = textContent.items as any[];

    if (textItems.length === 0) {
      if (onProgress) onProgress(currentProgress, `Page ${pageNum} scannée : Exécution de l'OCR local...`);
      ocrImageCount++;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderTask = (page as any).render({ canvasContext: ctx, viewport, canvas } as any);
      await renderTask.promise;

      const ocrResult = await performLocalOCR(canvas, options.sourceLang);

      if (ocrResult.lines && ocrResult.lines.length > 0) {
        for (const line of ocrResult.lines) {
          const originalText = line.text.trim();
          if (originalText) {
            totalWords += originalText.split(/\s+/).filter(Boolean).length;
            const translatedText = await translateText(originalText, options);

            sections.push({
              id: `pdf-ocr-${pageNum}-${line.bbox.y0}`,
              originalText: `[Page ${pageNum} OCR]: ${originalText}`,
              translatedText: `[Page ${pageNum} OCR Traduit]: ${translatedText}`,
              type: 'image-ocr'
            });

            const cleanTextForPdf = sanitizeForPdf(translatedText);
            if (cleanTextForPdf) {
              const fontHeight = Math.max(10, Math.min(18, (line.bbox.y1 - line.bbox.y0)));
              const boxWidth = Math.max(20, line.bbox.x1 - line.bbox.x0);
              const boxHeight = Math.max(12, line.bbox.y1 - line.bbox.y0);

              try {
                newPage.drawRectangle({
                  x: line.bbox.x0,
                  y: Math.max(10, viewport.height - line.bbox.y1),
                  width: boxWidth,
                  height: boxHeight,
                  color: rgb(1, 1, 1),
                  opacity: 0.85,
                });

                newPage.drawText(cleanTextForPdf, {
                  x: line.bbox.x0 + 2,
                  y: Math.max(10, viewport.height - line.bbox.y1 + 2),
                  size: fontHeight,
                  font,
                  color: rgb(0.1, 0.1, 0.1),
                });
              } catch (e) {
                console.warn('PDF draw OCR warning:', e);
              }
            }
          }
        }
      }
    } else {
      for (let i = 0; i < textItems.length; i++) {
        const item = textItems[i];
        const str = item.str || '';
        if (!str.trim()) continue;

        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 12;
        const itemWidth = Math.max(15, item.width || str.length * (fontSize * 0.5));
        const itemHeight = Math.max(10, item.height || fontSize * 1.1);

        totalWords += str.split(/\s+/).filter(Boolean).length;
        const translatedStr = await translateText(str, options);

        sections.push({
          id: `pdf-p${pageNum}-i${i}`,
          originalText: str,
          translatedText: translatedStr,
          type: 'paragraph'
        });

        const cleanTextForPdf = sanitizeForPdf(translatedStr);
        if (cleanTextForPdf) {
          try {
            newPage.drawRectangle({
              x: Math.max(5, Math.min(viewport.width - 50, x - 1)),
              y: Math.max(5, Math.min(viewport.height - 20, y - 2)),
              width: Math.min(viewport.width - x, itemWidth + 4),
              height: Math.min(viewport.height - y, itemHeight + 2),
              color: rgb(1, 1, 1),
              opacity: 0.9,
            });

            newPage.drawText(cleanTextForPdf, {
              x: Math.max(5, Math.min(viewport.width - 50, x)),
              y: Math.max(5, Math.min(viewport.height - 20, y)),
              size: Math.min(24, Math.max(8, fontSize)),
              font,
              color: rgb(0.1, 0.1, 0.2),
            });
          } catch (e) {
            console.warn('PDF draw text skipped:', e);
          }
        }
      }
    }
  }

  if (onProgress) onProgress(95, 'Génération du nouveau document PDF traduit...');

  const pdfBytes = await pdfDoc.save();
  const blobBuffer = new Uint8Array(pdfBytes);
  const translatedBlob = new Blob([blobBuffer], { type: 'application/pdf' });

  if (onProgress) onProgress(100, 'Traduction du PDF terminée avec succès !');

  return {
    fileName: file.name.replace(/\.pdf$/i, `_traduit_${options.targetLang}.pdf`),
    fileType: 'pdf',
    sections,
    translatedBlob,
    stats: {
      totalWords,
      translatedWords: totalWords,
      ocrImageCount
    }
  };
}
