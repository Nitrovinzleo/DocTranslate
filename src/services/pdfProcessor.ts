import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { translateTextBatch } from './translatorEngine';
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
 * Helper to split text into wrapped lines fitting within maxPixelWidth
 */
function wrapTextToLines(text: string, fontSize: number, maxPixelWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  const approxCharWidth = fontSize * 0.52;
  const maxCharsPerLine = Math.max(15, Math.floor(maxPixelWidth / approxCharWidth));

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

export async function processPdfFile(
  file: File,
  options: TranslationOptions,
  onProgress?: (pct: number, stepMessage: string) => void
): Promise<ProcessedDocumentResult> {
  if (onProgress) onProgress(10, 'Lecture et analyse du document PDF...');

  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdfjsDoc = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const totalPages = pdfjsDoc.numPages;

  const pdfDoc = await PDFDocument.create();

  // Load input PDF with ignoreEncryption: true to support protected/encrypted PDF files cleanly
  let embeddedPages: any[] = [];
  try {
    const srcPdfDoc = await PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    embeddedPages = await pdfDoc.embedPdf(srcPdfDoc);
  } catch (err) {
    console.warn('embedPdf ignoreEncryption load warning:', err);
  }

  const sections: DocumentSection[] = [];
  let totalWords = 0;
  let ocrImageCount = 0;

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const pageStartPct = Math.round(15 + ((pageNum - 1) / totalPages) * 75);
    const pageEndPct = Math.round(15 + (pageNum / totalPages) * 75);

    if (onProgress) onProgress(pageStartPct, `Traduction et mise en page intelligente PDF (Page ${pageNum}/${totalPages})...`);

    const page = await pdfjsDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });

    const newPage = pdfDoc.addPage([viewport.width, viewport.height]);

    // Draw background original page (images, borders, graphics)
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
      // Scanned PDF page OCR
      if (onProgress) onProgress(pageStartPct, `Page ${pageNum} scannée : Exécution de l'OCR local...`);
      ocrImageCount++;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderTask = (page as any).render({ canvasContext: ctx, viewport, canvas } as any);
      await renderTask.promise;

      const ocrResult = await performLocalOCR(canvas, options.sourceLang);

      if (ocrResult.lines && ocrResult.lines.length > 0) {
        const ocrTexts = ocrResult.lines.map(l => l.text.trim()).filter(Boolean);
        const translatedOcrBatch = await translateTextBatch(ocrTexts, {
          ...options,
          onProgress: (subPct, msg) => {
            const scaled = pageStartPct + Math.round((subPct / 100) * (pageEndPct - pageStartPct));
            if (onProgress) onProgress(scaled, msg);
          }
        });

        for (let idx = 0; idx < ocrResult.lines.length; idx++) {
          const line = ocrResult.lines[idx];
          const originalText = line.text.trim();
          if (!originalText) continue;

          const translatedText = translatedOcrBatch[idx] || originalText;
          totalWords += originalText.split(/\s+/).filter(Boolean).length;

          sections.push({
            id: `pdf-ocr-${pageNum}-${line.bbox.y0}`,
            originalText: `[Page ${pageNum} OCR]: ${originalText}`,
            translatedText: `[Page ${pageNum} OCR Traduit]: ${translatedText}`,
            type: 'image-ocr'
          });

          const cleanTextForPdf = sanitizeForPdf(translatedText);
          if (cleanTextForPdf) {
            const fontHeight = Math.max(9, Math.min(16, (line.bbox.y1 - line.bbox.y0)));
            const maxW = Math.max(40, viewport.width - line.bbox.x0 - 20);
            const wrappedLines = wrapTextToLines(cleanTextForPdf, fontHeight, maxW);

            // Erase background box for OCR line
            const boxY = Math.max(0, viewport.height - line.bbox.y1 - 2);
            const boxH = Math.max(fontHeight * 1.3, line.bbox.y1 - line.bbox.y0 + 4);
            try {
              newPage.drawRectangle({
                x: Math.max(0, line.bbox.x0 - 4),
                y: boxY,
                width: Math.min(viewport.width - line.bbox.x0, (line.bbox.x1 - line.bbox.x0) + 8),
                height: boxH,
                color: rgb(1, 1, 1),
              });
            } catch (e) {}

            for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
              try {
                newPage.drawText(wrappedLines[lIdx], {
                  x: Math.max(10, Math.min(viewport.width - 50, line.bbox.x0)),
                  y: Math.max(10, viewport.height - line.bbox.y1 - (lIdx * fontHeight * 1.15)),
                  size: fontHeight,
                  font: fontRegular,
                  color: rgb(0.1, 0.1, 0.2),
                });
              } catch (e) {
                console.warn('PDF draw OCR line warning:', e);
              }
            }
          }
        }
      }
    } else {
      // Vector PDF text items: Group items into horizontal lines (by Y coordinate)
      const validItems = textItems.filter(item => item.str && item.str.trim().length > 0);

      interface LineGroup {
        y: number;
        minX: number;
        maxX: number;
        maxFontSize: number;
        isHeading: boolean;
        rawTexts: string[];
      }

      const lineGroups: LineGroup[] = [];

      for (const item of validItems) {
        const str = item.str.trim();
        if (!str) continue;

        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        const fontSize = Math.abs(transform[0]) || Math.abs(transform[3]) || 12;
        const approxWidth = (item.width || str.length * fontSize * 0.5);

        // Find existing line group matching Y coordinate
        let group = lineGroups.find(g => Math.abs(g.y - y) < 4);
        if (!group) {
          group = {
            y,
            minX: x,
            maxX: x + approxWidth,
            maxFontSize: fontSize,
            isHeading: fontSize >= 14 || (str.length < 50 && str === str.toUpperCase() && /^[A-Z\s]{4,}$/.test(str)),
            rawTexts: [str],
          };
          lineGroups.push(group);
        } else {
          group.minX = Math.min(group.minX, x);
          group.maxX = Math.max(group.maxX, x + approxWidth);
          group.maxFontSize = Math.max(group.maxFontSize, fontSize);
          if (fontSize >= 14 || (str.length < 50 && str === str.toUpperCase())) {
            group.isHeading = true;
          }
          group.rawTexts.push(str);
        }
      }

      // Sort line groups vertically (top to bottom)
      lineGroups.sort((a, b) => b.y - a.y);

      // Translate combined line texts
      const combinedLineTexts = lineGroups.map(g => g.rawTexts.join(' '));

      const translatedBatch = await translateTextBatch(combinedLineTexts, {
        ...options,
        onProgress: (subPct, msg) => {
          const scaled = pageStartPct + Math.round((subPct / 100) * (pageEndPct - pageStartPct));
          if (onProgress) onProgress(scaled, msg);
        }
      });

      for (let i = 0; i < lineGroups.length; i++) {
        const group = lineGroups[i];
        const rawLineText = combinedLineTexts[i];
        const translatedLineText = translatedBatch[i] || rawLineText;

        totalWords += rawLineText.split(/\s+/).filter(Boolean).length;

        sections.push({
          id: `pdf-p${pageNum}-line${i}`,
          originalText: rawLineText,
          translatedText: translatedLineText,
          type: group.isHeading ? 'heading' : 'paragraph'
        });

        const cleanTextForPdf = sanitizeForPdf(translatedLineText);
        if (!cleanTextForPdf) continue;

        const fontSize = Math.min(24, Math.max(8, group.maxFontSize));
        const activeFont = group.isHeading ? fontBold : fontRegular;
        const fontColor = group.isHeading ? rgb(0.05, 0.05, 0.15) : rgb(0.12, 0.12, 0.25);

        const maxW = Math.max(40, viewport.width - group.minX - 20);
        const wrappedLines = wrapTextToLines(cleanTextForPdf, fontSize, maxW);

        // Erase background box (masking original English text)
        // On Page 1 (Cover Page) or pages with sparse text (<= 6 lines), do NOT draw opaque white blocks over illustrations & artwork!
        const isSparseGraphicPage = pageNum === 1 || lineGroups.length <= 6;

        if (!isSparseGraphicPage) {
          const maskHeight = Math.max(fontSize * 1.18 * wrappedLines.length, 12);
          const maskY = Math.max(0, group.y - (wrappedLines.length - 1) * fontSize * 1.15 - 1);
          const maskWidth = Math.min(viewport.width - group.minX, Math.max(group.maxX - group.minX + 4, 30));

          try {
            newPage.drawRectangle({
              x: Math.max(0, group.minX - 2),
              y: maskY,
              width: maskWidth,
              height: maskHeight,
              color: rgb(1, 1, 1), // White rectangle erases old English text underneath
            });
          } catch (e) {
            console.warn('PDF erase background rectangle error:', e);
          }
        }

        // Draw translated lines
        for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
          try {
            newPage.drawText(wrappedLines[lIdx], {
              x: Math.max(5, Math.min(viewport.width - 40, group.minX)),
              y: Math.max(5, Math.min(viewport.height - 15, group.y - (lIdx * fontSize * 1.2))),
              size: fontSize,
              font: activeFont,
              color: fontColor,
            });
          } catch (e) {
            console.warn('PDF draw line text error:', e);
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
