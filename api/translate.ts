export const config = {
  maxDuration: 15,
};

function applyDomainPostProcessing(text: string, src: string, tgt: string): string {
  if (!text || src !== 'en' || tgt !== 'fr') return text;

  let result = text;
  result = result.replace(/\bDIARY OF A BRAT\b/gi, "JOURNAL D'UNE PESTE");
  result = result.replace(/\bJOURNAL D'UN GOGON\b/gi, "JOURNAL D'UNE PESTE");
  result = result.replace(/\bGOGON\b/gi, "PESTE");
  result = result.replace(/\bgogon\b/gi, "peste");
  result = result.replace(/\bWHEN DO WE ENTER THE DIARY\s*\?\b/gi, "QUAND ENTRE-T-ON DANS LE JOURNAL ?");
  result = result.replace(/\bWHERE FANNY DIGS DEEP\b/gi, "OÙ FANNY EXPLORE SES ÉMOTIONS");
  result = result.replace(/\bFANNY'S DIARY\b/gi, "LE JOURNAL DE FANNY");
  result = result.replace(/\bTHE DIARY\b/gi, "LE JOURNAL");
  result = result.replace(/\bBRAT Revolution\b/gi, "Révolution PESTE");
  result = result.replace(/\bBRAT Support Group\b/gi, "Groupe de Soutien PESTE");
  result = result.replace(/\bBRAT Rule\b/gi, "Règle PESTE");
  result = result.replace(/\bBRAT Rules\b/gi, "Règles PESTE");
  result = result.replace(/\bBRAT tactic\b/gi, "tactique PESTE");
  result = result.replace(/\bBRAT tactics\b/gi, "tactiques PESTE");
  result = result.replace(/\bBRAT spirit\b/gi, "esprit PESTE");
  result = result.replace(/\banti-BRAT\b/gi, "anti-PESTE");
  result = result.replace(/\ba BRAT\b/gi, "une PESTE");
  result = result.replace(/\bBRATs\b/gi, "PESTES");
  result = result.replace(/\bBRAT\b/g, "PESTE");

  return result;
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const sourceLang = body.sourceLang || 'en';
    const targetLang = body.targetLang || 'fr';
    const imageBase64 = body.imageBase64;

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    // Handle multimodal slide/image OCR & translation via Gemini 1.5 Flash Vision
    if (imageBase64 && apiKey) {
      try {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const prompt = `You are a world-class document & slide translator. Extract ALL readable text from this presentation slide image, ignoring diagonal background watermark text (e.g. emails or dates). Translate all extracted text into ${targetLang} (French). Keep titles in uppercase and preserve paragraph structure. Return ONLY the translated French text.`;

        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
                { text: prompt }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
            }
          }),
          signal: AbortSignal.timeout(14000)
        });

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const processed = applyDomainPostProcessing(rawText.trim(), sourceLang, targetLang);
          return new Response(JSON.stringify({
            translatedText: processed,
            translatedTexts: [processed]
          }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
            },
          });
        } else {
          const errText = await geminiRes.text();
          console.error('Gemini Vision API Error Status:', geminiRes.status, errText);
        }
      } catch (e) {
        console.warn('Gemini Vision Image Translation fallback:', e);
      }
    }

    // Support single text string or batch array of texts
    const inputTexts: string[] = Array.isArray(body.texts)
      ? body.texts
      : body.text
        ? [body.text]
        : [];

    if (inputTexts.length === 0 || sourceLang === targetLang) {
      return new Response(JSON.stringify({
        translatedText: body.text || '',
        translatedTexts: inputTexts
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Provider 0: High-Intelligence Google Gemini 1.5 Flash API (If GEMINI_API_KEY configured)
    if (apiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const prompt = `You are a world-class literary translator. Translate the following array of text blocks from ${sourceLang} to ${targetLang}.
Maintain literary tone, humor, context, and proper idioms (e.g. 'DIARY OF A BRAT' -> "JOURNAL D'UNE PESTE").
Return ONLY a JSON array of translated strings matching the exact size and order of the input array.

Input JSON:
${JSON.stringify(inputTexts)}`;

        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          }),
          signal: AbortSignal.timeout(6000)
        });

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const rawResponseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawResponseText) {
            const parsedArray = JSON.parse(rawResponseText);
            if (Array.isArray(parsedArray) && parsedArray.length === inputTexts.length) {
              const processedBatch = parsedArray.map((t: string) => applyDomainPostProcessing(t, sourceLang, targetLang));
              return new Response(JSON.stringify({
                translatedText: processedBatch[0] || '',
                translatedTexts: processedBatch
              }), {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
                },
              });
            }
          }
        }
      } catch (e) {
        console.warn('Gemini API Provider Fallback:', e);
      }
    }

    // Process batch items in parallel with zero-log confidential translation providers
    const translatedTexts = await Promise.all(
      inputTexts.map(async (text) => {
        if (!text || !text.trim() || /^[\d\s\W]+$/.test(text.trim())) {
          return text;
        }

        const cleanText = text.trim();
        let translated = cleanText;

        // Provider 1: Google GTX Unofficial API (High Reliability & Speed)
        try {
          const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
          const gtxRes = await fetch(gtxUrl, { signal: AbortSignal.timeout(4000) });
          if (gtxRes.ok) {
            const data = await gtxRes.json();
            if (Array.isArray(data) && Array.isArray(data[0])) {
              const transStr = data[0].map((item: any) => item[0]).join('');
              if (transStr && transStr.trim()) translated = transStr;
            }
          }
        } catch (e) {
          // fallback
        }

        if (translated === cleanText) {
          // Provider 2: Lingva API
          try {
            const lingvaUrl = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(cleanText)}`;
            const lingvaRes = await fetch(lingvaUrl, { signal: AbortSignal.timeout(3500) });
            if (lingvaRes.ok) {
              const data = await lingvaRes.json();
              if (data.translation) translated = data.translation;
            }
          } catch (e) {
            // fallback
          }
        }

        return applyDomainPostProcessing(translated, sourceLang, targetLang);
      })
    );

    return new Response(JSON.stringify({
      translatedText: translatedTexts[0] || '',
      translatedTexts
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Translation error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
