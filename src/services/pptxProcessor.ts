import JSZip from 'jszip';
import { translateTextBatch, translateText } from './translatorEngine';
import type { TranslationOptions } from './translatorEngine';
import { performLocalOCR } from './ocrService';
import type { DocumentSection, ProcessedDocumentResult } from './docxProcessor';

function createPptxOcrTextBox(xmlDoc: Document, text: string, boxIndex: number): Element | null {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const escapeXml = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  // Calculate y position based on boxIndex so multiple OCR text boxes on the same slide don't overlap
  const yOffset = Math.min(6200000, 4200000 + (boxIndex * 1100000));

  const paragraphsXml = lines.map(line => `
    <a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:r>
        <a:rPr sz="1300" b="1">
          <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
          <a:latin typeface="Calibri"/>
        </a:rPr>
        <a:t>${escapeXml(line)}</a:t>
      </a:r>
    </a:p>
  `).join('');

  const shapeXml = `
    <p:sp xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:nvSpPr>
        <p:cNvPr id="${99000 + boxIndex}" name="OCR Translation Banner ${boxIndex + 1}"/>
        <p:cNvSpPr/>
        <p:nvPr/>
      </p:nvSpPr>
      <p:spPr>
        <a:xfrm>
          <a:off x="457200" y="${yOffset}"/>
          <a:ext cx="8229600" cy="1100000"/>
        </a:xfrm>
        <a:prstGeom prst="rect">
          <a:avLst/>
        </a:prstGeom>
        <a:solidFill>
          <a:srgbClr val="0F172A">
            <a:alpha val="90000"/>
          </a:srgbClr>
        </a:solidFill>
        <a:ln w="19050">
          <a:solidFill>
            <a:srgbClr val="06B6D4"/>
          </a:solidFill>
        </a:ln>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square" lIns="144000" tIns="108000" rIns="144000" bIns="108000">
          <a:spAutoFit/>
        </a:bodyPr>
        <a:lstStyle/>
        ${paragraphsXml}
      </p:txBody>
    </p:sp>
  `;

  try {
    const shapeParser = new DOMParser();
    const shapeDoc = shapeParser.parseFromString(shapeXml, 'application/xml');
    if (shapeDoc.getElementsByTagName('parsererror').length > 0) {
      return null;
    }
    return xmlDoc.importNode(shapeDoc.documentElement, true);
  } catch (err) {
    console.warn('Failed to parse PPTX OCR text box shape:', err);
    return null;
  }
}

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

  // Map slide files to media image paths via relationship files (.rels)
  const slideMediaMap = new Map<string, string[]>();
  const processedMediaPaths = new Set<string>();

  for (const slidePath of slideFiles) {
    const slideNumMatch = slidePath.match(/slide(\d+)\.xml$/);
    if (!slideNumMatch) continue;
    const slideNum = slideNumMatch[1];
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    
    const mediaPaths: string[] = [];
    if (zip.files[relsPath]) {
      try {
        const relsContent = await zip.files[relsPath].async('text');
        const relsDoc = parser.parseFromString(relsContent, 'application/xml');
        const rels = Array.from(relsDoc.getElementsByTagName('Relationship'));
        for (const rel of rels) {
          const target = rel.getAttribute('Target') || '';
          if (target.includes('media/')) {
            let cleanPath = target.replace(/^(\.\.\/)+/, '');
            if (!cleanPath.startsWith('ppt/')) {
              cleanPath = 'ppt/' + cleanPath;
            }
            if (zip.files[cleanPath]) {
              mediaPaths.push(cleanPath);
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to parse rels file ${relsPath}:`, e);
      }
    }
    slideMediaMap.set(slidePath, mediaPaths);
  }

  const totalSlides = slideFiles.length;

  for (let slideIdx = 0; slideIdx < totalSlides; slideIdx++) {
    const slidePath = slideFiles[slideIdx];
    const slideNum = slideIdx + 1;

    const currentPct = Math.round(15 + (slideIdx / totalSlides) * 75);
    if (onProgress) onProgress(currentPct, `Analyse de la diapositive ${slideNum}/${totalSlides}...`);

    const xmlContent = await zip.files[slidePath].async('text');
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

    // 1. Process regular slide XML text nodes (<a:p> & <a:t>)
    const paragraphs = Array.from(xmlDoc.getElementsByTagName('a:p'));
    const validParagraphData: Array<{ textNodes: Element[]; fullText: string }> = [];

    for (const p of paragraphs) {
      const textNodes = Array.from(p.getElementsByTagName('a:t'));
      if (textNodes.length === 0) continue;

      const fullText = textNodes.map(n => n.textContent || '').join('');
      if (!fullText.trim()) continue;

      validParagraphData.push({ textNodes, fullText });
      totalWords += fullText.split(/\s+/).filter(Boolean).length;
    }

    if (validParagraphData.length > 0) {
      const paragraphTexts = validParagraphData.map(d => d.fullText);
      const translatedBatch = await translateTextBatch(paragraphTexts, {
        ...options,
        onProgress: (pct, msg) => {
          const scaledPct = Math.round(
            currentPct + ((pct / 100) * (75 / totalSlides))
          );
          if (onProgress) onProgress(scaledPct, msg);
        }
      });

      for (let i = 0; i < validParagraphData.length; i++) {
        const { textNodes, fullText } = validParagraphData[i];
        const translatedText = translatedBatch[i] || fullText;

        textNodes[0].textContent = translatedText;
        for (let k = 1; k < textNodes.length; k++) {
          textNodes[k].textContent = '';
        }

        sections.push({
          id: `slide-${slideNum}-p${i}`,
          originalText: fullText,
          translatedText,
          type: 'paragraph'
        });
      }
    }

    // 2. Perform OCR on any images embedded in this slide (screenshots, diagrams, etc.)
    if (!options.ignoreImages) {
      const slideImages = slideMediaMap.get(slidePath) || [];
      let slideOcrCount = 0;

      for (const mediaPath of slideImages) {
        if (processedMediaPaths.has(mediaPath)) continue;
        processedMediaPaths.add(mediaPath);

        try {
          if (onProgress) onProgress(currentPct, `Diapositive ${slideNum}/${totalSlides} : OCR sur l'image ${mediaPath.split('/').pop()}...`);
          const imageBlob = await zip.files[mediaPath].async('blob');
          const ocrResult = await performLocalOCR(imageBlob, options.sourceLang);

          if (ocrResult.text && ocrResult.text.trim()) {
            ocrImageCount++;
            const cleanOcr = ocrResult.text.trim();
            const translatedOcr = await translateText(cleanOcr, options);
            totalWords += cleanOcr.split(/\s+/).filter(Boolean).length;

            sections.push({
              id: `slide-${slideNum}-ocr-${slideOcrCount}`,
              originalText: `[Diapositive ${slideNum} - Image OCR]: ${cleanOcr}`,
              translatedText: `[Diapositive ${slideNum} - Image OCR Traduit]: ${translatedOcr}`,
              type: 'image-ocr'
            });

            // Append translated text shape box to slide XML
            let spTree = xmlDoc.getElementsByTagName('p:spTree')[0];
            if (!spTree) {
              const spTrees = xmlDoc.getElementsByTagNameNS('*', 'spTree');
              if (spTrees.length > 0) spTree = spTrees[0];
            }

            if (spTree) {
              const ocrShapeNode = createPptxOcrTextBox(xmlDoc, translatedOcr, slideOcrCount);
              if (ocrShapeNode) {
                spTree.appendChild(ocrShapeNode);
              }
            }

            slideOcrCount++;
          }
        } catch (err) {
          console.warn(`OCR error on slide ${slideNum} media ${mediaPath}:`, err);
        }
      }
    }

    const updatedXmlContent = serializer.serializeToString(xmlDoc);
    zip.file(slidePath, updatedXmlContent);
  }

  // 3. Fallback: OCR any remaining media images in ppt/media/ not mapped to slide rels
  if (!options.ignoreImages) {
    const allMediaFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/'));
    for (const mediaPath of allMediaFiles) {
      if (processedMediaPaths.has(mediaPath)) continue;
      processedMediaPaths.add(mediaPath);

      try {
        const imageBlob = await zip.files[mediaPath].async('blob');
        const ocrResult = await performLocalOCR(imageBlob, options.sourceLang);

        if (ocrResult.text && ocrResult.text.trim()) {
          ocrImageCount++;
          const cleanOcr = ocrResult.text.trim();
          const translatedOcr = await translateText(cleanOcr, options);
          totalWords += cleanOcr.split(/\s+/).filter(Boolean).length;

          sections.push({
            id: `ocr-${mediaPath}`,
            originalText: `[Image PowerPoint OCR]: ${cleanOcr}`,
            translatedText: `[Image PowerPoint OCR Traduit]: ${translatedOcr}`,
            type: 'image-ocr'
          });
        }
      } catch (err) {
        console.warn(`OCR error on unmapped media ${mediaPath}:`, err);
      }
    }
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

