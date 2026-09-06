import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Custom dev server middleware to support /api/translate during local npm run dev
function localTranslatePlugin() {
  return {
    name: 'local-translate-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/translate', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        let bodyStr = '';
        req.on('data', (chunk: any) => { bodyStr += chunk; });
        req.on('end', async () => {
          try {
            const body = JSON.parse(bodyStr || '{}');
            const sourceLang = body.sourceLang || 'en';
            const targetLang = body.targetLang || 'fr';
            const inputTexts: string[] = Array.isArray(body.texts) 
              ? body.texts 
              : body.text 
              ? [body.text] 
              : [];

            const translatedTexts = await Promise.all(
              inputTexts.map(async (text) => {
                if (!text || !text.trim() || /^[\d\s\W]+$/.test(text.trim())) {
                  return text;
                }
                const cleanText = text.trim();

                // Google GTX Provider (Primary)
                try {
                  const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(cleanText)}`;
                  const gtxRes = await fetch(gtxUrl, { signal: AbortSignal.timeout(4000) });
                  if (gtxRes.ok) {
                    const data: any = await gtxRes.json();
                    if (Array.isArray(data) && Array.isArray(data[0])) {
                      const transStr = data[0].map((item: any) => item[0]).join('');
                      if (transStr && transStr.trim()) return transStr;
                    }
                  }
                } catch (e) {
                  // fallback
                }

                // Lingva Provider
                try {
                  const lingvaUrl = `https://lingva.ml/api/v1/${sourceLang}/${targetLang}/${encodeURIComponent(cleanText)}`;
                  const lingvaRes = await fetch(lingvaUrl, { signal: AbortSignal.timeout(4000) });
                  if (lingvaRes.ok) {
                    const data: any = await lingvaRes.json();
                    if (data.translation) return data.translation;
                  }
                } catch (e) {
                  // fallback
                }

                // MyMemory Provider
                try {
                  const langPair = `${sourceLang}|${targetLang}`;
                  const myMemUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=${langPair}`;
                  const myMemRes = await fetch(myMemUrl, { signal: AbortSignal.timeout(4000) });
                  if (myMemRes.ok) {
                    const data: any = await myMemRes.json();
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

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              translatedText: translatedTexts[0] || '',
              translatedTexts
            }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err?.message || 'Local translate error' }));
          }
        });
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    localTranslatePlugin(),
  ],
  optimizeDeps: {
    exclude: ['@xenova/transformers', 'onnxruntime-web']
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
})
