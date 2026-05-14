/**
 * In-process script translation (no LibreTranslate server).
 * Uses Google Translate free API for instant translations.
 */
export async function translatePlainChunk(text, sourceIso, targetIso) {
  const src = String(sourceIso || 'auto').toLowerCase();
  const tgt = String(targetIso || '').toLowerCase();
  if (!tgt) {
    const err = new Error('target language is required');
    err.status = 400;
    throw err;
  }

  const raw = String(text ?? '');
  if (!raw.trim()) return '';

  try {
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${src}&tl=${tgt}&dt=t`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: raw })
    });

    if (!response.ok) {
      throw new Error(`Translation API HTTP ${response.status}`);
    }

    const data = await response.json();
    let translatedText = '';

    if (data && Array.isArray(data[0])) {
      for (const segment of data[0]) {
        if (segment[0]) {
          translatedText += segment[0];
        }
      }
    }

    return translatedText || raw;
  } catch (error) {
    console.error('[builtinTranslationService] translation error:', error);
    return raw; // Fallback to original text on failure
  }
}
