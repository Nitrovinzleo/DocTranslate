import JSZip from 'jszip';
import { translateTextBatch, translateText } from './translatorEngine';
import type { TranslationOptions } from './translatorEngine';
import { performLocalOCR } from './ocrService';

export interface DocumentSection {
  id: string;
  originalText: string;
  translatedText: string;
  type: 'paragraph' | 'heading' | 'table-cell' | 'image-ocr';
}

export interface ProcessedDocumentResult {
  fileName: string;
  fileType: 'docx' | 'pptx' | 'pdf';
  sections: DocumentSection[];
  translatedBlob: Blob;
  stats: {
    totalWords: number;
    translatedWords: number;
    ocrImageCount: number;
  };
}

export async function processDocxFile(
  file: File,
  options: TranslationOptions,
  onProgress?: (pct: number, stepMessage: string) => void
): Promise<ProcessedDocumentResult> {
  if (onProgress) onProgress(10, 'Lecture de la structure XML du document Word (.docx)...');

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const sections: DocumentSection[] = [];
  let totalWords = 0;
  let ocrImageCount = 0;

  const xmlFiles = Object.keys(zip.files).filter(name => 
    name.startsWith('word/document') ||
    name.startsWith('word/header') ||
    name.startsWith('word/footer')
  );

  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  // 1. OCR Media Images
  const mediaFiles = Object.keys(zip.files).filter(name => name.startsWith('word/media/'));
  if (mediaFiles.length > 0) {
    if (onProgress) onProgress(20, `Analyse OCR de ${mediaFiles.length} image(s) dans le document Word...`);
    for (const mediaPath of mediaFiles) {
      try {
        const imageBlob = await zip.files[mediaPath].async('blob');
        const ocrResult = await performLocalOCR(imageBlob, options.sourceLang);
        if (ocrResult.text && ocrResult.text.trim()) {
          ocrImageCount++;
          const cleanOcr = ocrResult.text.trim();
          const translatedOcr = await translateText(cleanOcr, options);
          sections.push({
            id: `ocr-${mediaPath}`,
            originalText: `[Image OCR]: ${cleanOcr}`,
            translatedText: `[Image OCR Traduit]: ${translatedOcr}`,
            type: 'image-ocr'
          });
        }
      } catch (err) {
        console.warn(`OCR error on ${mediaPath}:`, err);
      }
    }
  }

  // 2. High-speed parallel batch paragraph translation
  let processedFilesCount = 0;
  for (const xmlPath of xmlFiles) {
    const xmlContent = await zip.files[xmlPath].async('text');
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

    const paragraphs = Array.from(xmlDoc.getElementsByTagName('w:p'));
    const validParagraphData: Array<{ pNode: Element; textNodes: Element[]; fullText: string }> = [];

    for (const p of paragraphs) {
      const textNodes = Array.from(p.getElementsByTagName('w:t'));
      if (textNodes.length === 0) continue;

      const fullText = textNodes.map(n => n.textContent || '').join('');
      if (!fullText.trim()) continue;

      validParagraphData.push({ pNode: p, textNodes, fullText });
      totalWords += fullText.split(/\s+/).filter(Boolean).length;
    }

    if (validParagraphData.length > 0) {
      const paragraphTexts = validParagraphData.map(d => d.fullText);
      const translatedBatch = await translateTextBatch(paragraphTexts, {
        ...options,
        onProgress: (pct, msg) => {
          const currentProgress = Math.round(
            30 + ((processedFilesCount + pct / 100) / xmlFiles.length) * 65
          );
          if (onProgress) onProgress(currentProgress, msg);
        }
      });

      for (let i = 0; i < validParagraphData.length; i++) {
        const { textNodes, fullText } = validParagraphData[i];
        const translatedText = translatedBatch[i] || fullText;

        textNodes[0].textContent = translatedText;
        if (translatedText.startsWith(' ') || translatedText.endsWith(' ')) {
          textNodes[0].setAttribute('xml:space', 'preserve');
        }
        for (let k = 1; k < textNodes.length; k++) {
          textNodes[k].textContent = '';
        }

        sections.push({
          id: `${xmlPath}-p${i}`,
          originalText: fullText,
          translatedText,
          type: 'paragraph'
        });
      }
    }

    const updatedXmlContent = serializer.serializeToString(xmlDoc);
    zip.file(xmlPath, updatedXmlContent);
    processedFilesCount++;
  }

  if (onProgress) onProgress(98, 'Reconstitution du fichier Word (.docx)...');

  const translatedBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });

  if (onProgress) onProgress(100, 'Traduction Word terminée avec succès !');

  return {
    fileName: file.name.replace(/\.docx$/i, `_traduit_${options.targetLang}.docx`),
    fileType: 'docx',
    sections,
    translatedBlob,
    stats: {
      totalWords,
      translatedWords: totalWords,
      ocrImageCount
    }
  };
}
