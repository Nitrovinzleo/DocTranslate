import JSZip from 'jszip';
import { translateText } from './translatorEngine';
import type { TranslationOptions } from './translatorEngine';
import { performLocalOCR } from './ocrService';
import type { DocumentSection, ProcessedDocumentResult } from './docxProcessor';

export async function processPptxFile(
  file: File,
  options: TranslationOptions,
  onProgress?: (pct: number, stepMessage: string) => void
): Promise<ProcessedDocumentResult> {
  if (onProgress) onProgress(10, 'Lecture de la structure PowerPoint (.pptx)...');

  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const sections: DocumentSection[] = [];
  let totalWords = 0;
  let ocrImageCount = 0;

  const slideFiles = Object.keys(zip.files).filter(name => 
    name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
  ).sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
    const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
    return numA - numB;
  });

  const parser = new DOMParser();
  const serializer = new XMLSerializer();

  // 1. OCR Media Images
  const mediaFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'));
  if (mediaFiles.length > 0) {
    if (onProgress) onProgress(20, `Analyse OCR de ${mediaFiles.length} image(s) de diapositives...`);
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
            originalText: `[Image Diapositive OCR]: ${cleanOcr}`,
            translatedText: `[Image Diapositive OCR Traduit]: ${translatedOcr}`,
            type: 'image-ocr'
          });
        }
      } catch (err) {
        console.warn(`OCR error on PPTX media ${mediaPath}:`, err);
      }
    }
  }

  // 2. Translate text aggregated at slide paragraph level <a:p>
  const totalSlides = slideFiles.length;
  for (let slideIdx = 0; slideIdx < totalSlides; slideIdx++) {
    const slidePath = slideFiles[slideIdx];
    const xmlContent = await zip.files[slidePath].async('text');
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

    const paragraphs = Array.from(xmlDoc.getElementsByTagName('a:p'));
    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const p = paragraphs[pIdx];
      const textNodes = Array.from(p.getElementsByTagName('a:t'));
      if (textNodes.length === 0) continue;

      const fullText = textNodes.map(n => n.textContent || '').join('');
      if (!fullText.trim()) continue;

      totalWords += fullText.split(/\s+/).filter(Boolean).length;

      const currentProgress = Math.round(
        30 + ((slideIdx + (pIdx + 1) / paragraphs.length) / totalSlides) * 65
      );

      if (onProgress) {
        onProgress(currentProgress, `Diapositive ${slideIdx + 1}/${totalSlides} - Traduction du texte...`);
      }

      const translatedText = await translateText(fullText, options);

      textNodes[0].textContent = translatedText;
      for (let k = 1; k < textNodes.length; k++) {
        textNodes[k].textContent = '';
      }

      sections.push({
        id: `slide-${slideIdx + 1}-p${pIdx}`,
        originalText: fullText,
        translatedText,
        type: 'paragraph'
      });
    }

    const updatedXmlContent = serializer.serializeToString(xmlDoc);
    zip.file(slidePath, updatedXmlContent);
  }

  if (onProgress) onProgress(98, 'Reconstitution du fichier PowerPoint (.pptx)...');

  const translatedBlob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });

  if (onProgress) onProgress(100, 'Traduction PowerPoint terminée avec succès !');

  return {
    fileName: file.name.replace(/\.pptx$/i, `_traduit_${options.targetLang}.pptx`),
    fileType: 'pptx',
    sections,
    translatedBlob,
    stats: {
      totalWords,
      translatedWords: totalWords,
      ocrImageCount
    }
  };
}
