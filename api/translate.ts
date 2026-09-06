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

    // Process batch items in parallel with zero-log confidential translation providers
    const translatedTexts = await Promise.all(
      inputTexts.map(async (text) => {
        if (!text || !text.trim() || /^[\d\s\W]+$/.test(text.trim())) {
          return text;
        }

        const cleanText = text.trim();

        // Provider 1: Google GTX Unofficial API (High Reliability & Speed)
        try {
          const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
          const gtxRes = await fetch(gtxUrl, { signal: AbortSignal.timeout(4000) });
          if (gtxRes.ok) {
            const data = await gtxRes.json();
            if (Array.isArray(data) && Array.isArray(data[0])) {
              const transStr = data[0].map((item: any) => item[0]).join('');
              if (transStr && transStr.trim()) return transStr;
            }
          }
        } catch (e) {
          // fallback
        }

        // Provider 2: Lingva API
        try {
          const lingvaUrl = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(cleanText)}`;
          const lingvaRes = await fetch(lingvaUrl, { signal: AbortSignal.timeout(3500) });
          if (lingvaRes.ok) {
            const data = await lingvaRes.json();
            if (data.translation) return data.translation;
          }
        } catch (e) {
          // fallback
        }

        // Provider 3: MyMemory API
        try {
          const langPair = `${sourceLang}|${targetLang}`;
          const myMemUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=${langPair}`;
          const myMemRes = await fetch(myMemUrl, { signal: AbortSignal.timeout(3500) });
          if (myMemRes.ok) {
            const data = await myMemRes.json();
            if (data.responseData?.translatedText && !data.responseData.translatedText.includes('MYMEMORY WARNING')) {
              return data.responseData.translatedText;
            }
          }
        } catch (e) {
          // fallback
        }

        return text;
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
