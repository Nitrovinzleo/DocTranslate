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

function isWatermarkItem(item: any): boolean {
  if (!item || !item.str) return true;
  const str = item.str.trim();
  if (!str) return true;

  // 1. Watermark keywords
  const watermarkRegex = /^(gaumont|watermark|draft|brouillon|confidentiel|confidential|do not copy|specimen|sample|copie|privé|private)$/i;
  if (watermarkRegex.test(str)) return true;

  // 2. Rotated / Skewed text detection (diagonal watermark in PDF transform matrix)
  if (item.transform && Array.isArray(item.transform)) {
    const skewY = Math.abs(item.transform[1] || 0);
    const skewX = Math.abs(item.transform[2] || 0);
    if (skewY > 0.05 || skewX > 0.05) {
      return true; // Rotated diagonal watermark
    }
  }

  return false;
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
    if (onProgress) onProgress(10, 'Lecture et analyse du document PDF...');

    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdfjsDoc = await pdfjsLib.getDocument({
      data: arrayBuffer.slice(0),
      verbosity: 0,
    }).promise;
    const totalPages = pdfjsDoc.numPages;

    const pdfDoc = await PDFDocument.create();

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

      const initialPage = pdfDoc.addPage([viewport.width, viewport.height]);
      let currentPage = initialPage;

      const textContent = await page.getTextContent();
      const textItems = textContent.items as any[];

      // 1. Render background canvas to capture images & artwork unless ignoreImages is requested
      if (!options.ignoreImages) {
        const renderScale = 1.8;
        const bgCanvas = document.createElement('canvas');
        const bgCtx = bgCanvas.getContext('2d');
        const bgViewport = page.getViewport({ scale: renderScale });
        bgCanvas.width = bgViewport.width;
        bgCanvas.height = bgViewport.height;

        const bgRenderTask = (page as any).render({ canvasContext: bgCtx, viewport: bgViewport, canvas: bgCanvas } as any);
        await bgRenderTask.promise;

        if (bgCtx && textItems.length > 0) {
          bgCtx.fillStyle = '#ffffff';
          for (const item of textItems) {
            if (!item.str || !item.str.trim()) continue;
            const transform = item.transform;
            const itemX = transform[4] * renderScale;
            const itemY = (viewport.height - transform[5]) * renderScale;
            const itemFontSize = (Math.abs(transform[0]) || Math.abs(transform[3]) || 12) * renderScale;
            const itemWidth = (item.width || item.str.length * itemFontSize * 0.5) * renderScale;

            bgCtx.fillRect(
              Math.max(0, itemX - 4),
              Math.max(0, itemY - itemFontSize - 3),
              Math.min(bgCanvas.width - itemX + 4, itemWidth + 8),
              itemFontSize * 1.45
            );
          }
        }

        try {
          const imageBlob = await new Promise<Blob | null>(res => bgCanvas.toBlob(res, 'image/jpeg', 0.90));
          if (imageBlob) {
            const imageBuffer = await imageBlob.arrayBuffer();
            const embeddedJpg = await pdfDoc.embedJpg(imageBuffer);
            initialPage.drawImage(embeddedJpg, {
              x: 0,
              y: 0,
              width: viewport.width,
              height: viewport.height,
            });
          }
        } catch (err) {
          console.warn('Canvas background embedding warning:', err);
        }
      }

    if (textItems.length === 0) {
      if (options.ignoreImages) {
        // Skip scanned image OCR when ignoring images
        continue;
      }
      // Scanned PDF page OCR
      if (onProgress) onProgress(pageStartPct, `Page ${pageNum} scannée : Exécution de l'OCR local...`);
      ocrImageCount++;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const renderTask = (page as any).render({ canvasContext: ctx, viewport, canvas } as any);
      await renderTask.promise;

      const ocrResult = await performLocalOCR(canvas, options.sourceLang, (subPct: number, msg: string) => {
        const scaled = pageStartPct + Math.round((subPct / 100) * (pageEndPct - pageStartPct));
        if (onProgress) onProgress(scaled, msg);
      });

      const ocrLines = ocrResult.lines || [];
      const rawOcrTexts = ocrLines.map(l => l.text.trim()).filter(Boolean);
      const translatedOcrBatch = await translateTextBatch(rawOcrTexts, {
        ...options,
        onProgress: (subPct, msg) => {
          const scaled = pageStartPct + Math.round((subPct / 100) * (pageEndPct - pageStartPct));
          if (onProgress) onProgress(scaled, msg);
        }
      });

      for (let idx = 0; idx < ocrLines.length; idx++) {
        const line = ocrLines[idx];
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
          const wrappedLines = smartWrapTextToLines(cleanTextForPdf, fontHeight, maxW);

          // Erase background box for OCR line
          const boxY = Math.max(0, viewport.height - line.bbox.y1 - 2);
          const boxH = Math.max(fontHeight * 1.3, line.bbox.y1 - line.bbox.y0 + 4);
          try {
            currentPage.drawRectangle({
              x: Math.max(0, line.bbox.x0 - 4),
              y: boxY,
              width: Math.min(viewport.width - line.bbox.x0, (line.bbox.x1 - line.bbox.x0) + 8),
              height: boxH,
              color: rgb(1, 1, 1),
            });
          } catch (e) {}

          for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
            try {
              currentPage.drawText(wrappedLines[lIdx], {
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
    } else {
      // Vector PDF text items: Group items into horizontal lines (excluding watermarks)
      const validItems = textItems.filter(item => item.str && item.str.trim().length > 0 && !isWatermarkItem(item));

      interface LineItem {
        str: string;
        x: number;
        y: number;
        fontSize: number;
        width: number;
      }

      interface LineGroup {
        y: number;
        minX: number;
        maxX: number;
        maxFontSize: number;
        isHeading: boolean;
        isFooterBrand: boolean;
        items: LineItem[];
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

        const isFooterBrand = y <= 45 || y >= viewport.height - 35 || /^gaumont$/i.test(str) || /^\d{1,3}$/.test(str);

        // Group items within 2.5px vertical Y distance (exact same horizontal line)
        let group = lineGroups.find(g => Math.abs(g.y - y) <= 2.5);
        if (!group) {
          group = {
            y,
            minX: x,
            maxX: x + approxWidth,
            maxFontSize: fontSize,
            isHeading: !isFooterBrand && (fontSize >= 14 || (str.length < 40 && str === str.toUpperCase() && /^[A-Z\s]{4,}$/.test(str))),
            isFooterBrand,
            items: [{ str, x, y, fontSize, width: approxWidth }],
          };
          lineGroups.push(group);
        } else {
          group.minX = Math.min(group.minX, x);
          group.maxX = Math.max(group.maxX, x + approxWidth);
          group.maxFontSize = Math.max(group.maxFontSize, fontSize);
          if (!isFooterBrand && (fontSize >= 14 || (str.length < 40 && str === str.toUpperCase() && /^[A-Z\s]{4,}$/.test(str)))) {
            group.isHeading = true;
          }
          group.items.push({ str, x, y, fontSize, width: approxWidth });
        }
      }

      // Sort line groups vertically (top to bottom)
      lineGroups.sort((a, b) => b.y - a.y);

      // Group line groups into Paragraph Blocks for natural context translation
      interface ParagraphBlock {
        rawText: string;
        minX: number;
        maxX: number;
        maxFontSize: number;
        isHeading: boolean;
        isFooterBrand: boolean;
        y: number;
        lineGroups: LineGroup[];
      }

      const paragraphBlocks: ParagraphBlock[] = [];
      let currentBlock: ParagraphBlock | null = null;

      for (let i = 0; i < lineGroups.length; i++) {
        const g = lineGroups[i];
        g.items.sort((a, b) => a.x - b.x);
        const lineText = g.items.map(it => it.str).join(' ');

        if (!currentBlock) {
          currentBlock = {
            rawText: lineText,
            minX: g.minX,
            maxX: g.maxX,
            maxFontSize: g.maxFontSize,
            isHeading: g.isHeading,
            isFooterBrand: g.isFooterBrand,
            y: g.y,
            lineGroups: [g]
          };
          paragraphBlocks.push(currentBlock);
        } else {
          const prevGroup = currentBlock.lineGroups[currentBlock.lineGroups.length - 1];
          const yGap = prevGroup.y - g.y;
          const sameFontSize = Math.abs(prevGroup.maxFontSize - g.maxFontSize) <= 3;
          const isSameParagraph = !g.isHeading && !g.isFooterBrand && !currentBlock.isHeading && !currentBlock.isFooterBrand && yGap > 0 && yGap <= prevGroup.maxFontSize * 2.2 && sameFontSize;

          if (isSameParagraph) {
            currentBlock.rawText += ' ' + lineText;
            currentBlock.minX = Math.min(currentBlock.minX, g.minX);
            currentBlock.maxX = Math.max(currentBlock.maxX, g.maxX);
            currentBlock.maxFontSize = Math.max(currentBlock.maxFontSize, g.maxFontSize);
            currentBlock.lineGroups.push(g);
          } else {
            currentBlock = {
              rawText: lineText,
              minX: g.minX,
              maxX: g.maxX,
              maxFontSize: g.maxFontSize,
              isHeading: g.isHeading,
              isFooterBrand: g.isFooterBrand,
              y: g.y,
              lineGroups: [g]
            };
            paragraphBlocks.push(currentBlock);
          }
        }
      }

      // Translate paragraph blocks in batch
      const combinedBlockTexts = paragraphBlocks.map(b => b.rawText);
      const translatedBatch = await translateTextBatch(combinedBlockTexts, {
        ...options,
        onProgress: (subPct, msg) => {
          const scaled = pageStartPct + Math.round((subPct / 100) * (pageEndPct - pageStartPct));
          if (onProgress) onProgress(scaled, msg);
        }
      });

      // Track vertical Y cursor to prevent line collisions and handle page overflows cleanly
      let currentYCursor = viewport.height - 35;
      const SAFE_BOTTOM_MARGIN = 55;

      for (let i = 0; i < paragraphBlocks.length; i++) {
        const block = paragraphBlocks[i];
        const rawBlockText = combinedBlockTexts[i];
        const translatedBlockText = translatedBatch[i] || rawBlockText;

        totalWords += rawBlockText.split(/\s+/).filter(Boolean).length;

        sections.push({
          id: `pdf-p${pageNum}-block${i}`,
          originalText: rawBlockText,
          translatedText: translatedBlockText,
          type: block.isHeading ? 'heading' : 'paragraph'
        });

        const cleanTextForPdf = sanitizeForPdf(translatedBlockText);
        if (!cleanTextForPdf) continue;

        // Footer watermarks ("Gaumont", page numbers) remain small and discrete
        let fontSize = Math.max(8, Math.min(22, block.maxFontSize));
        if (block.isFooterBrand) {
          fontSize = Math.min(10, fontSize);
        }

        const isLargeHeading = block.isHeading && !block.isFooterBrand;
        const activeFont = isLargeHeading ? fontBold : fontRegular;
        const fontColor = block.isFooterBrand 
          ? rgb(0.45, 0.45, 0.5) 
          : (isLargeHeading ? rgb(0.05, 0.05, 0.15) : rgb(0.12, 0.12, 0.25));

        // Adjust minX for long headings or text blocks to maximize available width
        let renderMinX = block.minX;
        if (isLargeHeading || cleanTextForPdf.length > 25) {
          renderMinX = Math.min(block.minX, 35);
        }

        const maxW = Math.max(40, viewport.width - renderMinX - 25);
        let wrappedLines = smartWrapTextToLines(cleanTextForPdf, fontSize, maxW, isLargeHeading);

        // Auto-scale font size down if any line is still too wide for maxW
        while (fontSize > 9 && wrappedLines.some(l => l.length * (fontSize * (isLargeHeading ? 0.68 : 0.52)) > maxW)) {
          fontSize -= 1;
          wrappedLines = smartWrapTextToLines(cleanTextForPdf, fontSize, maxW, isLargeHeading);
        }

        // Generous line height & spacing gap
        const fontLineHeight = isLargeHeading ? fontSize * 1.55 : fontSize * 1.38;
        const minGapAbove = isLargeHeading ? 14 : 6;
        const minGapBelow = isLargeHeading ? 14 : 6;

        let lineY = block.y;

        if (!block.isFooterBrand) {
          const blockHeightNeeded = (fontLineHeight * wrappedLines.length) + minGapAbove + minGapBelow;

          // Check if this block overflows current page bottom margin OR starts below SAFE_BOTTOM_MARGIN
          if (currentYCursor - blockHeightNeeded < SAFE_BOTTOM_MARGIN || block.y < SAFE_BOTTOM_MARGIN) {
            // PAGE BREAK: Create a new overflow page cleanly!
            currentPage = pdfDoc.addPage([viewport.width, viewport.height]);
            currentYCursor = viewport.height - 35;
          }

          lineY = currentYCursor - minGapAbove;
        }

        // Mask original English text with white rectangle on initial page
        const isSparseGraphicPage = pageNum === 1 || lineGroups.length <= 5;
        if (!isSparseGraphicPage && !block.isFooterBrand && currentPage === initialPage) {
          const maskHeight = Math.max(fontLineHeight * wrappedLines.length, 12);
          const maskY = Math.max(0, lineY - (wrappedLines.length - 1) * fontLineHeight - 1);
          const maskWidth = Math.min(viewport.width - block.minX, Math.max(block.maxX - block.minX + 4, 30));

          try {
            currentPage.drawRectangle({
              x: Math.max(0, block.minX - 2),
              y: maskY,
              width: maskWidth,
              height: maskHeight,
              color: rgb(1, 1, 1),
            });
          } catch (e) {
            console.warn('PDF erase background rectangle error:', e);
          }
        }

        // Render each wrapped line of the block
        for (let lIdx = 0; lIdx < wrappedLines.length; lIdx++) {
          const targetY = lineY - (lIdx * fontLineHeight);

          try {
            currentPage.drawText(wrappedLines[lIdx], {
              x: Math.max(5, Math.min(viewport.width - 40, renderMinX)),
              y: Math.max(5, Math.min(viewport.height - 15, targetY)),
              size: fontSize,
              font: activeFont,
              color: fontColor,
            });
          } catch (e) {
            console.warn('PDF draw line text error:', e);
          }
        }

        if (!block.isFooterBrand) {
          currentYCursor = lineY - (wrappedLines.length * fontLineHeight) - minGapBelow;
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
 });
}
