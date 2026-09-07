import JSZip from 'jszip';
import type { DocumentSection } from './docxProcessor';

/**
 * Escapes XML special characters safely.
 */
function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Clean original/translated text prefix labels for Word document export.
 */
function formatSectionText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^\[Page \d+ OCR Traduit\]:\s*/i, '')
    .replace(/^\[Diapositive \d+ - Image OCR Traduit\]:\s*/i, '')
    .replace(/^\[Image (?:Diapositive|PowerPoint|Word)? OCR Traduit\]:\s*/i, '')
    .replace(/^\[.*?\]:\s*/i, '')
    .trim();
}

/**
 * Generates a clean Word document (.docx) containing all translated text
 * (both standard text and OCR-extracted text from screenshots/images).
 */
export async function generateTextOnlyDocxBlob(
  sections: DocumentSection[]
): Promise<Blob> {
  const zip = new JSZip();

  // 1. [Content_Types].xml
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  zip.file('[Content_Types].xml', contentTypesXml);

  // 2. _rels/.rels
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  zip.file('_rels/.rels', relsXml);

  // 3. word/_rels/document.xml.rels
  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  zip.file('word/_rels/document.xml.rels', docRelsXml);

  // 4. word/styles.xml
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="24"/>
        <w:szCs w:val="24"/>
        <w:lang w:val="fr-FR"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:rPr>
      <w:b/>
      <w:sz w:val="32"/>
      <w:szCs w:val="32"/>
      <w:color w:val="1F4E79"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="OcrHeading">
    <w:name w:val="OCR Section Heading"/>
    <w:rPr>
      <w:b/>
      <w:sz w:val="26"/>
      <w:szCs w:val="26"/>
      <w:color w:val="0F766E"/>
    </w:rPr>
  </w:style>
</w:styles>`;
  zip.file('word/styles.xml', stylesXml);

  // 5. Build word/document.xml from ALL sections (including image-ocr)
  const validSections = sections.filter(
    sec => sec.translatedText && sec.translatedText.trim()
  );

  let paragraphsXml = '';

  for (const sec of validSections) {
    const rawTranslated = sec.translatedText.trim();
    const cleanText = formatSectionText(rawTranslated);
    if (!cleanText) continue;

    // Support multiline text blocks
    const lines = cleanText.split(/\r?\n/);
    const runsXml = lines
      .map((line, idx) => {
        const escaped = escapeXml(line);
        const br = idx < lines.length - 1 ? '<w:br/>' : '';
        return `<w:r><w:t xml:space="preserve">${escaped}</w:t>${br}</w:r>`;
      })
      .join('');

    if (sec.type === 'heading') {
      paragraphsXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:before="240" w:after="120"/></w:pPr>${runsXml}</w:p>`;
    } else if (sec.type === 'image-ocr') {
      // Clean OCR section block in Word
      const tagMatch = rawTranslated.match(/^\[(.*?)\]:/);
      const tagText = tagMatch ? tagMatch[1] : 'Texte OCR Extrait';
      const escapedTag = escapeXml(tagText);
      paragraphsXml += `<w:p><w:pPr><w:pStyle w:val="OcrHeading"/><w:spacing w:before="180" w:after="60"/></w:pPr><w:r><w:t xml:space="preserve">📌 ${escapedTag}</w:t></w:r></w:p>`;
      paragraphsXml += `<w:p><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr>${runsXml}</w:p>`;
    } else {
      paragraphsXml += `<w:p><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr>${runsXml}</w:p>`;
    }
  }

  // Fallback if no text sections were found
  if (!paragraphsXml) {
    paragraphsXml = `<w:p><w:r><w:t xml:space="preserve">Aucun texte extrait du document.</w:t></w:r></w:p>`;
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  zip.file('word/document.xml', documentXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

