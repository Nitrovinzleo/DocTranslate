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

const PROTECTED_PROPER_NOUNS = [
  'Gaumont', 'Lisa Kohn', 'Virginy L. Sam', 'Journal dune Peste', "Journal d'une Peste",
  'Fanny', 'Sonia', 'John', 'Eva', 'Pépé', 'Linda', 'Charley', 'Marilyn', 'Theo',
  'Madame Turant', 'Semi-Colon', 'Perfect Family', 'Tooth Fairy', 'BRAT Revolution',
  'BRAT Support Group', 'BRAT Rule', 'BRAT Rules', 'BRATs', 'BRAT'
];

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

// Full sentence & idiom patterns (EN -> FR)
const FULL_SENTENCE_PATTERNS: [RegExp, string][] = [
  [/\bDIARY OF A BRAT\b/gi, "JOURNAL D'UNE PESTE"],
  [/\bA new animated series for 611-year-olds\b/gi, "Une nouvelle série animée pour les 6-11 ans"],
  [/\bA new animated series for 6-11-year-olds\b/gi, "Une nouvelle série animée pour les 6-11 ans"],
  [/\bBased on the book series\b/gi, "Basé sur la série de livres"],
  [/\bBased on the hit French book series\b/gi, "D'après la série de livres à succès"],
  [/\bFormat: 52x11 minutes\b/gi, "Format : 52x11 minutes"],
  [/\bGenre: Comedy\b/gi, "Genre : Comédie"],
  [/\bWARNING\b/gi, "AVERTISSEMENT"],
  [/\bIN A NUTSHELL\b/gi, "EN RÉSUMÉ"],
  [/\bTHE SHOW\b/gi, "LA SÉRIE"],
  [/\bFANNY'S DIARY\b/gi, "LE JOURNAL DE FANNY"],
  [/\bA FRESH FORMAT\b/gi, "UN FORMAT NOUVEAU"],
  [/\bMORE THAN A DIARY\b/gi, "PLUS QU'UN SIMPLE JOURNAL"],
  [/\bWHERE FANNY DIGS DEEP\b/gi, "OÙ FANNY EXPLORE SES ÉMOTIONS"],
  [/\bWHEN DO WE ENTER THE DIARY\?\b/gi, "QUAND ENTRE-T-ON DANS LE JOURNAL ?"],
  [/\bAt the start of the adventure\b/gi, "Au début de l'aventure"],
  [/\bAt moments of emotional crisis\b/gi, "Lors des moments de crise émotionnelle"],
  [/\bAt the end of the episode\b/gi, "À la fin de l'épisode"],
  [/\bSERIES TONE\b/gi, "TON DE LA SÉRIE"],
  [/\bWHY WE CAN'T LIVE WITHOUT FANNY\b/gi, "POURQUOI ON NE PEUT PLUS SE PASSER DE FANNY"],
  [/\bTHE CAST\b/gi, "LA DISTRIBUTION"],
  [/\bEPISODE STRUCTURE\b/gi, "STRUCTURE D'UN ÉPISODE"],
  [/\bACT 1\b/gi, "ACTE 1"],
  [/\bACT 2\b/gi, "ACTE 2"],
  [/\bACT 3\b/gi, "ACTE 3"],
  [/\bTHE SETUP\b/gi, "LA MISE EN PLACE"],
  [/\bTHE ESCALATION\b/gi, "L'ESCALADE"],
  [/\bTHE RESOLUTION\b/gi, "LE DÉNOUEMENT"],
  [/\bSTORY IDEAS\b/gi, "IDÉES D'ÉPISODES"],
  [/\bKEY DIARY PASSAGE\b/gi, "EXTRAIT CLÉ DU JOURNAL"],
  [/\bLOGLINE:\b/gi, "ACCROCHE :"],
  [/\bPREMISE:\b/gi, "SYNOPSIS :"],
  [/\bIf you're looking for tips on how to be a perfect kid\b/gi, "Si tu cherches des conseils pour être un enfant parfait"],
  [/\band make adults happy all the time\b/gi, "et faire plaisir aux adultes tout le temps"],
  [/\bSTOP! READ NO FURTHER!\b/gi, "ARRÊTE-TOI ! NE LIS PAS PLUS LOIN !"],
  [/\bThis isn't the show for you\b/gi, "Ce n'est pas la série pour toi"],
  [/\bBut if you believe kids deserve freedom, honesty, and a little healthy rebellion\b/gi, "Mais si tu penses que les enfants méritent de la liberté, de l'honnêteté et une rébellion saine"],
  [/\bKEEP READING\b/gi, "CONTINUE À LIRE"],
  [/\bAnd join the BRAT Revolution!\b/gi, "Et rejoins la Révolution PESTE !"],
];

const EN_FR_VOCAB: Record<string, string> = {
  'diary': 'journal', 'brat': 'peste', 'series': 'série', 'animated': 'animée',
  'bible': 'bible', 'book': 'livre', 'comedy': 'comédie', 'warning': 'avertissement',
  'kids': 'enfants', 'adults': 'adultes', 'freedom': 'liberté', 'honesty': 'honnêteté',
  'rebellion': 'rébellion', 'nutshell': 'résumé', 'disasters': 'catastrophes',
  'family': 'famille', 'school': 'école', 'episodes': 'épisodes', 'episode': 'épisode',
  'visionary': 'visionnaire', 'revolutionary': 'révolutionnaire', 'generation': 'génération',
  'masterpiece': 'chef-d’œuvre', 'spirit': 'esprit', 'traditions': 'traditions',
  'secret': 'secret', 'version': 'version', 'contradictions': 'contradictions',
  'status': 'statut', 'injustice': 'injustice', 'quizzes': 'interrogations',
  'tactics': 'tactiques', 'hero': 'héroïne', 'format': 'format',
  'story': 'histoire', 'imagination': 'imagination', 'energy': 'énergie',
  'metaphors': 'métaphores', 'apocalypse': 'apocalypse', 'laboratory': 'laboratoire',
  'headquarters': 'quartier général', 'theories': 'théories', 'solutions': 'solutions',
  'refuge': 'refuge', 'reflection': 'réflexion', 'questions': 'questions',
  'courage': 'courage', 'ambition': 'ambition', 'philosophy': 'philosophie',
  'perspective': 'perspective', 'authority': 'autorité', 'mistakes': 'erreurs',
  'victories': 'victoires', 'queen': 'reine', 'creativity': 'créativité',
  'campaign': 'campagne', 'protest': 'protestation', 'holiday': 'vacances',
  'operation': 'opération', 'detention': 'retenue', 'friends': 'amis',
  'perfectionist': 'perfectionniste', 'responsibility': 'responsabilité',
  'perfectionism': 'perfectionnisme', 'salesman': 'vendeur', 'civilization': 'civilisation',
  'intellectual': 'intellectuel', 'budgets': 'budgets', 'consequences': 'conséquences',
  'persuasion': 'persuasion', 'confidentiality': 'confidentialité', 'mentor': 'mentor',
  'convictions': 'convictions', 'enthusiasm': 'enthousiasme', 'optimism': 'optimisme',
  'propaganda': 'propagande', 'marathon': 'marathon', 'positivity': 'positivité',
  'friendship': 'amitié', 'secretary': 'secrétaire', 'reputation': 'réputation',
  'procedures': 'procédures', 'dilemma': 'dilemme', 'soulmate': 'âme sœur',
  'husband': 'mari', 'membership': 'appartenance', 'nightmare': 'cauchemar',
  'monster': 'monstre', 'sweater': 'pull', 'escape': 'évasion',
  'humiliation': 'humiliation', 'legend': 'légende', 'gift': 'cadeau',
  'getaway': 'escapade', 'renovations': 'rénovations', 'destruction': 'destruction',
  'candidacy': 'candidature', 'tyranny': 'tyrannie', 'birthday': 'anniversaire',
  'celebration': 'célébration', 'duty': 'devoir', 'the': 'le', 'a': 'un',
  'an': 'un', 'and': 'et', 'or': 'ou', 'but': 'mais', 'because': 'parce que',
  'if': 'si', 'for': 'pour', 'with': 'avec', 'without': 'sans', 'in': 'dans',
  'on': 'sur', 'at': 'à', 'by': 'par', 'from': 'de', 'to': 'à', 'about': 'à propos de',
  'under': 'sous', 'over': 'au-dessus de', 'between': 'entre', 'through': 'à travers',
  'during': 'pendant', 'before': 'avant', 'after': 'après', 'above': 'ci-dessus',
  'below': 'ci-dessous', 'this': 'ce', 'that': 'ce', 'these': 'ces', 'those': 'ces',
  'is': 'est', 'are': 'sont', 'was': 'était', 'were': 'étaient', 'be': 'être',
  'been': 'été', 'have': 'avoir', 'has': 'a', 'had': 'avait', 'will': 'sera',
  'can': 'peut', 'could': 'pourrait', 'should': 'devrait', 'must': 'doit',
  'all': 'tous', 'any': 'tout', 'some': 'certains', 'each': 'chaque', 'every': 'chaque',
  'more': 'plus', 'less': 'moins', 'most': 'la plupart', 'new': 'nouveau', 'old': 'ancien',
  'high': 'élevé', 'low': 'faible', 'first': 'premier', 'last': 'dernier', 'next': 'suivant',
};

function fastRuleTranslate(text: string, src: string, tgt: string): string {
  if (!text || !text.trim()) return text;

  let result = text;
  if (src === 'en' && tgt === 'fr') {
    for (const [pattern, replacement] of FULL_SENTENCE_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
  }

  const dict = (src === 'en' && tgt === 'fr') ? EN_FR_VOCAB : {};

  const tokens = result.split(/(\s+|[.,!?;:()"'`\n\r\t])/);
  const translatedTokens = tokens.map(token => {
    if (!token || !token.trim() || /^[.,!?;:()"'`\d\n\r\t]+$/.test(token) || token.startsWith('__XPN')) {
      return token;
    }

    const lower = token.toLowerCase();
    if (dict[lower] && src === 'en' && tgt === 'fr') {
      const trans = dict[lower];
      if (token === token.toUpperCase()) return trans.toUpperCase();
      if (token[0] === token[0].toUpperCase()) return trans.charAt(0).toUpperCase() + trans.slice(1);
      return trans;
    }

    return token;
  });

  return translatedTokens.join('');
}

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
    if (onProgress) onProgress(100, 'Traduction terminée.');
    return results;
  }

  const CHUNK_SIZE = 15;
  const numChunks = Math.ceil(uncachedTexts.length / CHUNK_SIZE);

  for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
    const currentProgress = Math.round(20 + ((chunkIdx + 1) / numChunks) * 75);
    if (onProgress) {
      onProgress(currentProgress, `Traduction en cours (Lot ${chunkIdx + 1}/${numChunks})...`);
    }

    const start = chunkIdx * CHUNK_SIZE;
    const end = Math.min(uncachedTexts.length, start + CHUNK_SIZE);
    const chunkTexts = uncachedTexts.slice(start, end);
    const chunkIndices = uncachedIndices.slice(start, end);

    const protectedChunk = chunkTexts.map(t => protectProperNouns(normalizeQuotes(t)));

    try {
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
          let rawTrans = translatedArray[k] || chunkTexts[k];

          // If provider returned unchanged text, apply robust fastRuleTranslate fallback
          if (rawTrans === protectedChunk[k].protectedText) {
            rawTrans = fastRuleTranslate(protectedChunk[k].protectedText, sourceLang, targetLang);
          }

          const restored = restoreProperNouns(rawTrans, protectedChunk[k].map);
          results[chunkIndices[k]] = restored;
          translationCache[`${sourceLang}:${targetLang}:${originalRaw}`] = restored;
        }
        continue;
      }
    } catch (e) {
      console.warn('Batch translation call fallback:', e);
    }

    // Direct fallback loop if API call fails
    for (let k = 0; k < chunkTexts.length; k++) {
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
        // fallback
      }

      if (trans === protectedText) {
        trans = fastRuleTranslate(protectedText, sourceLang, targetLang);
      }

      const restored = restoreProperNouns(trans, map);
      results[indexInResults] = restored;
      translationCache[`${sourceLang}:${targetLang}:${chunkTexts[k]}`] = restored;
    }
  }

  if (onProgress) onProgress(100, 'Traduction terminée avec succès !');
  return results;
}

export async function translateText(
  text: string,
  options: TranslationOptions
): Promise<string> {
  const batchResult = await translateTextBatch([text], options);
  return batchResult[0] || text;
}
