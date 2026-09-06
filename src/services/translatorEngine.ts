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

// Protected Proper Nouns (Names, Brands, Titles)
const PROTECTED_PROPER_NOUNS = [
  'Gaumont', 'Lisa Kohn', 'Virginy L. Sam', 'Journal dune Peste', "Journal d'une Peste",
  'Fanny', 'Sonia', 'John', 'Eva', 'Pépé', 'Linda', 'Charley', 'Marilyn', 'Theo',
  'Madame Turant', 'Semi-Colon', 'Perfect Family', 'Tooth Fairy', 'BRAT Revolution',
  'BRAT Support Group', 'BRAT Rule', 'BRAT Rules', 'BRAT', 'BRATs', 'BRAT-isophical',
  'Lindaventions', 'Lindavention', 'BRATocracy', 'Picture Day', 'Save Room for Two Desserts Campaign'
];

/**
 * Normalize curly quotes and apostrophes to standard characters
 */
function normalizeQuotes(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019\u02BC`']/g, "'")
    .replace(/[\u201C\u201D«»"]/g, '"');
}

/**
 * Protect Proper Nouns with tokens before translation
 */
function protectProperNouns(text: string): { protectedText: string; map: Record<string, string> } {
  let protectedText = text;
  const map: Record<string, string> = {};
  let counter = 0;

  for (const name of PROTECTED_PROPER_NOUNS) {
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(protectedText)) {
      const token = `__PN_${counter}__`;
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
 * Fetch Neural Translation from Vercel Serverless Function or Free API
 */
async function fetchNeuralTranslation(text: string, sourceLang: string, targetLang: string): Promise<string | null> {
  const normalized = normalizeQuotes(text);

  // 1. Try Vercel Serverless Function (/api/translate)
  try {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: normalized, sourceLang, targetLang }),
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.translatedText && data.translatedText !== normalized) {
        return data.translatedText;
      }
    }
  } catch (e) {
    // ignore
  }

  // 2. Direct Lingva Neural API Fallback (Free, Confidential, Zero Logging)
  try {
    const lingvaUrl = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(normalized)}`;
    const res = await fetch(lingvaUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.translation) {
        return data.translation;
      }
    }
  } catch (e) {
    // ignore
  }

  // 3. Direct MyMemory Neural API Fallback (Free, Zero Storage)
  try {
    const langPair = `${sourceLang}|${targetLang}`;
    const myMemUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(normalized)}&langpair=${langPair}`;
    const res = await fetch(myMemUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.responseData?.translatedText) {
        return data.responseData.translatedText;
      }
    }
  } catch (e) {
    // ignore
  }

  return null;
}

/**
 * Main translation function
 */
export async function translateText(
  text: string,
  options: TranslationOptions
): Promise<string> {
  const { sourceLang, targetLang } = options;

  if (!text || !text.trim() || sourceLang === targetLang) {
    return text;
  }

  const leadingSpace = text.match(/^\s*/)?.[0] || '';
  const trailingSpace = text.match(/\s*$/)?.[0] || '';
  const cleanText = text.trim();

  if (/^[\d\s\W]+$/.test(cleanText)) {
    return text;
  }

  // Protect Proper Nouns first
  const { protectedText, map } = protectProperNouns(cleanText);

  // Perform Neural Translation
  let translatedStr = await fetchNeuralTranslation(protectedText, sourceLang, targetLang);

  if (!translatedStr || translatedStr === protectedText) {
    // Fallback dictionary translation if offline
    translatedStr = protectedText;
  }

  // Restore Proper Nouns
  const finalResult = restoreProperNouns(translatedStr, map);

  return leadingSpace + finalResult + trailingSpace;
}

export async function translateTextBatch(
  texts: string[],
  options: TranslationOptions
): Promise<string[]> {
  const results: string[] = [];
  const total = texts.length;
  if (total === 0) return results;

  for (let i = 0; i < total; i++) {
    const currentPct = Math.round(((i + 1) / total) * 100);
    if (options.onProgress) {
      options.onProgress(currentPct, `Traduction du segment ${i + 1} / ${total}...`);
    }

    const translated = await translateText(texts[i], options);
    results.push(translated);
  }

  return results;
}
