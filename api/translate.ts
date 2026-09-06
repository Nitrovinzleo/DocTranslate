import type { RequestContext } from '@vercel/functions';

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { text, sourceLang = 'en', targetLang = 'fr' } = await req.json();

    if (!text || !text.trim() || sourceLang === targetLang) {
      return new Response(JSON.stringify({ translatedText: text }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Primary Neural Provider: Free Confidential Lingva / MyMemory API (Zero Logging / Zero Training)
    try {
      const lingvaUrl = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(text)}`;
      const lingvaRes = await fetch(lingvaUrl, { signal: AbortSignal.timeout(4000) });
      if (lingvaRes.ok) {
        const data = await lingvaRes.json();
        if (data.translation) {
          return new Response(JSON.stringify({ translatedText: data.translation }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    } catch (err) {
      console.warn('Lingva provider fallback:', err);
    }

    // 2. Secondary Neural Provider: MyMemory Translation API
    try {
      const langPair = `${sourceLang}|${targetLang}`;
      const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
      const myMemRes = await fetch(myMemoryUrl, { signal: AbortSignal.timeout(4000) });
      if (myMemRes.ok) {
        const data = await myMemRes.json();
        if (data.responseData?.translatedText) {
          return new Response(JSON.stringify({ translatedText: data.responseData.translatedText }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    } catch (err) {
      console.warn('MyMemory provider fallback:', err);
    }

    return new Response(JSON.stringify({ translatedText: text }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Translation error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
