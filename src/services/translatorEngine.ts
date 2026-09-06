export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'zh', name: '中文 (Chinese)', flag: '🇨🇳' },
  { code: 'ja', name: '日本語 (Japanese)', flag: '🇯🇵' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
];

export type TranslationEngineMode = 'browser-ai' | 'fast-rule' | 'local-ollama';

export interface TranslationOptions {
  sourceLang: string;
  targetLang: string;
  engineMode?: TranslationEngineMode;
  ollamaUrl?: string;
  onProgress?: (percent: number, message: string) => void;
}

// Protected Proper Nouns that must remain unchanged
const PROTECTED_PROPER_NOUNS = [
  'Gaumont', 'Lisa Kohn', 'Virginy L. Sam', 'Journal dune Peste', "Journal d'une Peste",
  'Fanny', 'Sonia', 'John', 'Eva', 'Pépé', 'Linda', 'Charley', 'Marilyn', 'Theo',
  'Madame Turant', 'Semi-Colon', 'Perfect Family', 'Tooth Fairy', 'BRAT Revolution',
  'BRAT Support Group', 'BRAT Rule', 'BRAT Rules', 'BRATs', 'BRAT'
];

// In-memory cache for fast zero-latency repeat translation
const translationCache: Record<string, string> = {};

function normalizeQuotes(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019\u02BC`']/g, "'")
    .replace(/[\u201C\u201D«»"]/g, '"');
}

function protectProperNouns(text: string): { protectedText: string; map: Record<string, string> } {
  let protectedText = text;
  const map: Record<string, string> = {};
  let counter = 0;

  for (const name of PROTECTED_PROPER_NOUNS) {
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(protectedText)) {
      const token = `__XPN${counter}X__`;
      map[token] = name;
      protectedText = protectedText.replace(regex, token);
      counter++;
    }
  }

  return { protectedText, map };
}

function restoreProperNouns(text: string, map: Record<string, string>): string {
  let restored = text;
  for (const [token, originalName] of Object.entries(map)) {
    restored = restored.replaceAll(token, originalName);
  }
  return restored;
}

/**
 * High-performance batch translation via Vercel serverless / parallel providers
 */
export async function translateTextBatch(
  texts: string[],
  options: TranslationOptions
): Promise<string[]> {
  const { sourceLang, targetLang, onProgress } = options;
  const total = texts.length;
  if (total === 0) return [];

  const results: string[] = new Array(total);
  const uncachedIndices: number[] = [];
  const uncachedTexts: string[] = [];

  // Check cache first
  for (let i = 0; i < total; i++) {
    const raw = texts[i];
    if (!raw || !raw.trim() || sourceLang === targetLang || /^[\d\s\W]+$/.test(raw.trim())) {
      results[i] = raw;
      continue;
    }

    const cacheKey = `${sourceLang}:${targetLang}:${raw}`;
    if (translationCache[cacheKey]) {
      results[i] = translationCache[cacheKey];
    } else {
      uncachedIndices.push(i);
      uncachedTexts.push(raw);
    }
  }

  if (uncachedTexts.length === 0) {
    if (onProgress) onProgress(100, 'Traduction ultra-rapide terminée (100% cache).');
    return results;
  }

  // Batch process uncached texts in parallel chunks of 15
  const CHUNK_SIZE = 15;
  const numChunks = Math.ceil(uncachedTexts.length / CHUNK_SIZE);

  for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
    const currentProgress = Math.round(20 + ((chunkIdx + 1) / numChunks) * 75);
    if (onProgress) {
      onProgress(currentProgress, `Traduction parallèle Vercel (Lot ${chunkIdx + 1}/${numChunks})...`);
    }

    const start = chunkIdx * CHUNK_SIZE;
    const end = Math.min(uncachedTexts.length, start + CHUNK_SIZE);
    const chunkTexts = uncachedTexts.slice(start, end);
    const chunkIndices = uncachedIndices.slice(start, end);

    // Apply proper noun protection
    const protectedChunk = chunkTexts.map(t => protectProperNouns(normalizeQuotes(t)));

    try {
      // Send batch to Vercel Serverless Function / API
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          texts: protectedChunk.map(p => p.protectedText),
          sourceLang,
          targetLang,
        }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.ok) {
        const data = await res.json();
        const translatedArray: string[] = data.translatedTexts || [data.translatedText];

        for (let k = 0; k < chunkTexts.length; k++) {
          const originalRaw = chunkTexts[k];
          const rawTrans = translatedArray[k] || chunkTexts[k];
          const restored = restoreProperNouns(rawTrans, protectedChunk[k].map);
          
          results[chunkIndices[k]] = restored;
          translationCache[`${sourceLang}:${targetLang}:${originalRaw}`] = restored;
        }
        continue;
      }
    } catch (e) {
      console.warn('Batch translation API timeout/error, falling back to individual parallel requests', e);
    }

    // Individual parallel fallback if batch serverless call fails
    await Promise.all(
      chunkTexts.map(async (text, k) => {
        const indexInResults = chunkIndices[k];
        const { protectedText, map } = protectedChunk[k];

        let trans = protectedText;
        try {
          const lingvaUrl = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(protectedText)}`;
          const r = await fetch(lingvaUrl, { signal: AbortSignal.timeout(3000) });
          if (r.ok) {
            const data = await r.json();
            if (data.translation) trans = data.translation;
          }
        } catch (err) {
          // try MyMemory
          try {
            const langPair = `${sourceLang}|${targetLang}`;
            const myMemUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(protectedText)}&langpair=${langPair}`;
            const r = await fetch(myMemUrl, { signal: AbortSignal.timeout(3000) });
            if (r.ok) {
              const data = await r.json();
              if (data.responseData?.translatedText && !data.responseData.translatedText.includes('MYMEMORY WARNING')) {
                trans = data.responseData.translatedText;
              }
            }
          } catch (mErr) {
            // fallback
          }
        }

        const restored = restoreProperNouns(trans, map);
        results[indexInResults] = restored;
        translationCache[`${sourceLang}:${targetLang}:${text}`] = restored;
      })
    );
  }

  if (onProgress) onProgress(100, 'Traduction terminée avec succès !');
  return results;
}

/**
 * Single text translation wrapper
 */
export async function translateText(
  text: string,
  options: TranslationOptions
): Promise<string> {
  const batchResult = await translateTextBatch([text], options);
  return batchResult[0] || text;
}
