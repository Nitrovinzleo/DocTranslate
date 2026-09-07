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

/**
 * Creates an inverted high-contrast grayscale canvas for OCR.
 * Converts light/white text on dark or colored backgrounds (e.g. white text on blue/cyan/green slides)
 * into dark text on a crisp light background for Tesseract OCR.
 */
function createInvertedCanvasForOCR(originalCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = originalCanvas.width;
  canvas.height = originalCanvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return originalCanvas;

  ctx.drawImage(originalCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const inverted = Math.max(0, Math.min(255, (255 - gray - 128) * 1.4 + 128));
    data[i] = inverted;
    data[i + 1] = inverted;
    data[i + 2] = inverted;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export async function performLocalOCR(
  imageSource: Blob | File | HTMLImageElement | HTMLCanvasElement | string,
  langCode: string = 'fr',
  onProgress?: (pct: number, statusMessage: string) => void
): Promise<OCRResult> {
  try {
    if (onProgress) onProgress(10, 'Initialisation du moteur OCR local (Tesseract)...');
    
    const { createWorker } = await import('tesseract.js');
    const tessLang = (TESSERACT_LANG_MAP[langCode] || 'eng') + '+eng';

    const workerOptions: any = {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
      logger: (m: any) => {
        if (m.status === 'recognizing text' && onProgress) {
          const pct = Math.round((m.progress || 0) * 100);
          onProgress(pct, `Reconnaissance OCR des images (${pct}%)...`);
        }
      }
    };
    
    let worker: any = null;
    try {
      worker = await createWorker(tessLang, 1, workerOptions);
    } catch (e) {
      console.warn('Custom CDN worker init fallback to default createWorker:', e);
      worker = await createWorker(tessLang, 1, {
        logger: workerOptions.logger
      });
    }

    let ret: any = await worker.recognize(imageSource);

    // If first pass on original image returned no lines and imageSource is a canvas, try inverted canvas pass!
    const firstLines = ret.data.lines?.map((l: any) => l.text.trim()).filter(Boolean) || [];
    if (firstLines.length === 0 && imageSource instanceof HTMLCanvasElement) {
      if (onProgress) onProgress(60, 'Optimisation Contraste OCR (Pass 2)...');
      const invertedCanvas = createInvertedCanvasForOCR(imageSource);
      ret = await worker.recognize(invertedCanvas);
    }

    await worker.terminate();

    const lines = ret.data.lines?.map((l: any) => ({
      text: l.text,
      bbox: {
        x0: l.bbox?.x0 || 0,
        y0: l.bbox?.y0 || 0,
        x1: l.bbox?.x1 || 0,
        y1: l.bbox?.y1 || 0,
      }
    })).filter((l: any) => l.text && l.text.trim().length > 0) || [];

    return {
      text: ret.data.text || '',
      confidence: ret.data.confidence || 0,
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
