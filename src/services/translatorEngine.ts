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

const translationPipelines: Record<string, any> = {};
const loadingPromises: Record<string, Promise<any>> = {};

const PROTECTED_PROPER_NOUNS = [
  'Gaumont', 'Lisa Kohn', 'Virginy L. Sam', 'Journal dune Peste', "Journal d'une Peste",
  'Fanny', 'Sonia', 'John', 'Eva', 'Pépé', 'Linda', 'Charley', 'Marilyn', 'Theo',
  'Madame Turant', 'Semi-Colon', 'Perfect Family', 'Tooth Fairy', 'BRAT Revolution',
  'BRAT Support Group', 'BRAT Rule', 'BRAT Rules', 'BRAT', 'BRATs', 'BRAT-isophical',
  'Lindaventions', 'Lindavention', 'BRATocracy', 'Picture Day', 'Save Room for Two Desserts Campaign',
  'Save Room pour Two Desserts Campaign'
];

const FULL_SENTENCE_PATTERNS: [RegExp, string][] = [
  [/\bDIARY OF A BRAT\b/gi, "JOURNAL D'UNE PESTE"],
  [/\bA NEW ANIMATED SERIES FOR 6-11 YEAR OLDS\b/gi, "Une nouvelle série animée pour les 6-11 ans"],
  [/\bA NEW ANIMATED SERIES FOR 611-YEAR-OLDS\b/gi, "Une nouvelle série animée pour les 6-11 ans"],
  [/\bBased on the book series\b/gi, "D'après la série de livres"],
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
  [/\bACT 1: THE SETUP\b/gi, "ACTE 1 : LA MISE EN PLACE"],
  [/\bACT 2: THE ESCALATION\b/gi, "ACTE 2 : L'ESCALADE"],
  [/\bACT 3: THE RESOLUTION\b/gi, "ACTE 3 : LE DÉNOUEMENT"],
  [/\bSTORY IDEAS\b/gi, "IDÉES D'ÉPISODES"],
  [/\bKEY DIARY PASSAGE\b/gi, "EXTRAIT CLÉ DU JOURNAL"],
  [/\bLOGLINE:\b/gi, "ACCROCHE :"],
  [/\bPREMISE:\b/gi, "SYNOPSIS :"],

  [/\bIf you're looking for tips on how to be a perfect kid\b/gi, "Si tu cherches des conseils pour être un enfant parfait"],
  [/\band make adults happy all the time\b/gi, "et faire plaisir aux adultes tout le temps"],
  [/\bSTOP! READ NO FURTHER!\b/gi, "ARRÊTE-TOI ! NE LIS PAS PLUS LOIN !"],
  [/\bThis isn't the show for you\b/gi, "Ce n'est pas la série pour toi"],
  [/\bBut if you believe kids deserve freedom, honesty, and a little healthy rebellion\b/gi, "Mais si tu penses que les enfants méritent de la liberté, de l'honnêteté et une petite rébellion saine"],
  [/\bKEEP READING\b/gi, "CONTINUE À LIRE"],
  [/\bAnd join the BRAT Revolution!\b/gi, "Et rejoins la Révolution PESTE !"],
];

const DICT_EN_FR: Record<string, string> = {
  'diary': 'journal', 'brat': 'peste', 'series': 'série', 'animated': 'animée',
  'bible': 'bible', 'book': 'livre', 'comedy': 'comédie', 'warning': 'avertissement',
  'kids': 'enfants', 'adults': 'adultes', 'freedom': 'liberté', 'honesty': 'honnêteté',
  'rebellion': 'rébellion', 'nutshell': 'résumé', 'disasters': 'catastrophes',
  'family': 'famille', 'school': 'école', 'episodes': 'épisodes', 'episode': 'épisode',
  'visionary': 'visionnaire', 'revolutionary': 'révolutionnaire', 'generation': 'génération',
  'masterpiece': 'chef-d’œuvre', 'spirit': 'esprit', 'traditions': 'traditions',
  'secret': 'secret', 'version': 'version', 'contradictions': 'contradictions',
  'status': 'statut', 'injustice': 'injustice', 'quizzes': 'interrogations',
  'tactics': 'tactiques', 'hero': 'héroïne', 'diary.': 'journal.', 'format': 'format',
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
  'friendship': 'amitié', 'secretary': 'secrétaire',
  'reputation': 'réputation', 'procedures': 'procédures', 'dilemma': 'dilemme',
  'soulmate': 'âme sœur', 'husband': 'mari', 'membership': 'appartenance',
  'nightmare': 'cauchemar', 'monster': 'monstre', 'sweater': 'pull',
  'escape': 'évasion', 'humiliation': 'humiliation', 'legend': 'légende',
  'gift': 'cadeau', 'getaway': 'escapade', 'renovations': 'rénovations',
  'destruction': 'destruction', 'candidacy': 'candidature', 'tyranny': 'tyrannie',
  'birthday': 'anniversaire', 'celebration': 'célébration', 'duty': 'devoir',
};

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

async function getPipeline(src: string, tgt: string, onProgress?: (percent: number, msg: string) => void) {
  const key = `${src}-${tgt}`;
  if (translationPipelines[key]) {
    return translationPipelines[key];
  }

  if (key in loadingPromises) {
    return loadingPromises[key];
  }

  const modelName = `Xenova/opus-mt-${src}-${tgt}`;

  loadingPromises[key] = (async () => {
    try {
      if (onProgress) onProgress(15, `Chargement du modèle IA local (${src} -> ${tgt})...`);
      
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = false;
      env.allowRemoteModels = true;

      const pipe = await pipeline('translation', modelName, {
        progress_callback: (info: any) => {
          if (info.status === 'progress' && onProgress) {
            const pct = Math.round((info.loaded / (info.total || 1)) * 100);
            onProgress(Math.min(90, Math.max(15, pct)), `Téléchargement du modèle IA (${pct}%)...`);
          }
        }
      });
      translationPipelines[key] = pipe;
      if (onProgress) onProgress(100, `Modèle IA prêt.`);
      return pipe;
    } catch (err) {
      console.warn(`Opus-MT model ${modelName} error, attempting NLLB fallback...`, err);
      try {
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowLocalModels = false;
        env.allowRemoteModels = true;

        const nllbPipe = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', {
          progress_callback: (info: any) => {
            if (info.status === 'progress' && onProgress) {
              const pct = Math.round((info.loaded / (info.total || 1)) * 100);
              onProgress(Math.min(90, Math.max(15, pct)), `Chargement NLLB Distilled (${pct}%)...`);
            }
          }
        });
        translationPipelines[key] = nllbPipe;
        return nllbPipe;
      } catch (nllbErr) {
        console.warn('Local WASM AI download skipped/offline, using smart local rule & dictionary engine', nllbErr);
        return null;
      }
    } finally {
      delete loadingPromises[key];
    }
  })();

  return loadingPromises[key];
}

function fastRuleTranslate(text: string, src: string, tgt: string): string {
  if (!text || !text.trim()) return text;

  const { protectedText, map } = protectProperNouns(text);
  let result = protectedText;

  if (src === 'en' && tgt === 'fr') {
    for (const [pattern, replacement] of FULL_SENTENCE_PATTERNS) {
      result = result.replace(pattern, replacement);
    }
  }

  const dict = (src === 'en' && tgt === 'fr') ? DICT_EN_FR : {};

  const tokens = result.split(/(\s+|[.,!?;:()"'`\n\r\t])/);
  const translatedTokens = tokens.map(token => {
    if (!token || !token.trim() || /^[.,!?;:()"'`\d\n\r\t]+$/.test(token) || token.startsWith('__PN_')) {
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

  result = translatedTokens.join('');
  result = restoreProperNouns(result, map);

  return result;
}

export async function translateText(
  text: string,
  options: TranslationOptions
): Promise<string> {
  const { sourceLang, targetLang, engineMode = 'browser-ai', ollamaUrl = 'http://localhost:11434', onProgress } = options;

  if (!text || !text.trim() || sourceLang === targetLang) {
    return text;
  }

  const leadingSpace = text.match(/^\s*/)?.[0] || '';
  const trailingSpace = text.match(/\s*$/)?.[0] || '';
  const cleanText = text.trim();

  if (/^[\d\s\W]+$/.test(cleanText)) {
    return text;
  }

  let result = cleanText;

  if (engineMode === 'local-ollama') {
    try {
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3:latest',
          prompt: `Translate the following text from ${sourceLang} to ${targetLang}. Keep proper names (Fanny, Sonia, John, Eva, Pépé, Linda, Charley, Marilyn, Theo, Madame Turant, Gaumont) untranslated. Return ONLY the direct translated text:\n\n${cleanText}`,
          stream: false
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.response) {
          result = data.response.trim();
        }
      } else {
        result = fastRuleTranslate(cleanText, sourceLang, targetLang);
      }
    } catch (e) {
      console.warn('Ollama local request failed, using local rule engine', e);
      result = fastRuleTranslate(cleanText, sourceLang, targetLang);
    }
  } else if (engineMode === 'browser-ai') {
    try {
      const { protectedText, map } = protectProperNouns(cleanText);
      const pipe = await getPipeline(sourceLang, targetLang, onProgress);
      if (pipe) {
        const output = await pipe(protectedText);
        
        let transStr = '';
        if (Array.isArray(output) && output[0]) {
          transStr = output[0].translation_text || output[0].generated_text || output[0];
        } else if (output && typeof output === 'object') {
          transStr = output.translation_text || output.generated_text || '';
        } else if (typeof output === 'string') {
          transStr = output;
        }

        if (transStr && transStr.trim()) {
          result = restoreProperNouns(transStr.trim(), map);
        } else {
          result = fastRuleTranslate(cleanText, sourceLang, targetLang);
        }
      } else {
        result = fastRuleTranslate(cleanText, sourceLang, targetLang);
      }
    } catch (err) {
      console.warn('Browser AI model execution error, using local dictionary engine:', err);
      result = fastRuleTranslate(cleanText, sourceLang, targetLang);
    }
  } else {
    result = fastRuleTranslate(cleanText, sourceLang, targetLang);
  }

  return leadingSpace + result + trailingSpace;
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
