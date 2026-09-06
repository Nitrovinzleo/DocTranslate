const TESSERACT_LANG_MAP: Record<string, string> = {
  fr: 'fra',
  en: 'eng',
  es: 'spa',
  de: 'deu',
  it: 'ita',
  pt: 'por',
  nl: 'nld',
  zh: 'chi_sim',
  ja: 'jpn',
  ru: 'rus',
  ar: 'ara',
  pl: 'pol',
};

export interface OCRResult {
  text: string;
  confidence: number;
  lines?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
}

export async function performLocalOCR(
  imageSource: Blob | File | HTMLImageElement | HTMLCanvasElement | string,
  langCode: string = 'fr',
  onProgress?: (pct: number, statusMessage: string) => void
): Promise<OCRResult> {
  try {
    if (onProgress) onProgress(10, 'Initialisation du moteur OCR local (Tesseract)...');
    
    const { createWorker } = await import('tesseract.js');
    const tessLang = TESSERACT_LANG_MAP[langCode] || 'eng';
    
    const worker = await createWorker(tessLang, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          const pct = Math.round((m.progress || 0) * 100);
          onProgress(pct, `Reconnaissance OCR des images (${pct}%)...`);
        }
      }
    });

    const ret: any = await worker.recognize(imageSource);
    await worker.terminate();

    const lines = ret.data.lines?.map((l: any) => ({
      text: l.text,
      bbox: {
        x0: l.bbox.x0,
        y0: l.bbox.y0,
        x1: l.bbox.x1,
        y1: l.bbox.y1,
      }
    })) || [];

    return {
      text: ret.data.text,
      confidence: ret.data.confidence,
      lines,
    };
  } catch (err) {
    console.error('Local OCR failed:', err);
    return {
      text: '',
      confidence: 0,
      lines: []
    };
  }
}
