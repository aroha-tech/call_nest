import { env } from '../../config/env.js';

const MAX_TRANSLATE_CHARS = 450_000;
const CHUNK_SIZE = 3500;

function trimBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

/** ECONNREFUSED etc. from undici/node fetch */
function getFetchFailureCode(err) {
  const c = err?.cause;
  if (c?.code) return c.code;
  if (Array.isArray(c?.errors) && c.errors[0]?.code) return c.errors[0].code;
  return err?.code;
}

function wrapUpstreamFetchFailure(err, label, baseUrl) {
  const code = getFetchFailureCode(err);
  const connFail = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(code);
  const e = new Error(
    connFail
      ? `Cannot reach ${label} at ${baseUrl} (${code}). Check the service is running (e.g. docker ps, docker logs <container>). On macOS avoid mapping LibreTranslate to host port 5000 (AirPlay uses it). First start can take several minutes while models download—wait, then curl /languages on the same host:port. Or clear LIBRETRANSLATE_BASE_URL in .env if unused.`
      : `${label} request failed: ${err?.message || String(err)}`
  );
  e.status = 502;
  return e;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Avoid IPv6 ::1 vs Docker port-publish quirks on some macOS setups */
function preferIpv4LoopbackUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.hostname === 'localhost') {
      u.hostname = '127.0.0.1';
      return u.toString();
    }
  } catch {
    /* ignore */
  }
  return urlStr;
}

function isRetryableFetchError(err) {
  const code = getFetchFailureCode(err);
  if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'].includes(code)) return true;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return true;
  return false;
}

/**
 * Split long text into chunks under maxLen without breaking mid-word when possible.
 */
function chunkTextForTranslation(text, maxLen = CHUNK_SIZE) {
  const s = String(text ?? '');
  if (s.length <= maxLen) return s ? [s] : [''];
  const chunks = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + maxLen, s.length);
    if (end < s.length) {
      const slice = s.slice(i, end);
      const lastPara = slice.lastIndexOf('\n\n');
      const lastNl = slice.lastIndexOf('\n');
      const breakAt = lastPara > maxLen * 0.4 ? lastPara + 2 : lastNl > maxLen * 0.5 ? lastNl + 1 : slice.lastIndexOf(' ');
      if (breakAt > maxLen * 0.35) {
        end = i + breakAt;
      }
    }
    chunks.push(s.slice(i, end));
    i = end;
  }
  return chunks;
}

async function postLibreTranslate(body) {
  const base = trimBase(env.scriptLanguage.libretranslateBaseUrl);
  if (!base) {
    const err = new Error('Translation is not configured (set LIBRETRANSLATE_BASE_URL on the server).');
    err.status = 503;
    throw err;
  }
  const payload = { ...body, format: 'text' };
  if (env.scriptLanguage.libretranslateApiKey) {
    payload.api_key = env.scriptLanguage.libretranslateApiKey;
  }
  const url = preferIpv4LoopbackUrl(`${base}/translate`);
  const maxAttempts = 4;
  const translateTimeoutMs = 180_000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(translateTimeoutMs)
        : undefined;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      if (isRetryableFetchError(err) && attempt < maxAttempts) {
        await sleep(400 * attempt * attempt);
        continue;
      }
      throw wrapUpstreamFetchFailure(err, 'LibreTranslate', base);
    }

    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = { raw };
    }

    if (!res.ok) {
      const msg = data?.error || data?.message || raw || `LibreTranslate HTTP ${res.status}`;
      if (res.status >= 502 && attempt < maxAttempts) {
        await sleep(600 * attempt * attempt);
        continue;
      }
      const err = new Error(typeof msg === 'string' ? msg : 'LibreTranslate request failed');
      err.status = res.status >= 500 ? 502 : 400;
      throw err;
    }

    const translated = data?.translatedText;
    if (typeof translated !== 'string') {
      if (attempt < maxAttempts) {
        await sleep(500 * attempt);
        continue;
      }
      const err = new Error('LibreTranslate returned an unexpected response.');
      err.status = 502;
      throw err;
    }
    return translated;
  }

  const err = new Error('LibreTranslate failed after retries.');
  err.status = 502;
  throw err;
}

export function getScriptLanguageStatus() {
  const remoteLt = Boolean(trimBase(env.scriptLanguage.libretranslateBaseUrl));
  const builtinOn = !env.scriptLanguage.disableBuiltinTranslation;
  return {
    libretranslateConfigured: remoteLt,
    translationBuiltin: !remoteLt && builtinOn,
    scriptTranslationAvailable: remoteLt || builtinOn,
    asrConfigured: Boolean(trimBase(env.scriptLanguage.asrProxyUrl)),
    ttsConfigured: Boolean(trimBase(env.scriptLanguage.ttsProxyUrl)),
  };
}

export async function translateText({ text, source, target }) {
  const src = String(source || 'auto').toLowerCase();
  const tgt = String(target || '').toLowerCase();
  if (!tgt) {
    const err = new Error('target language is required');
    err.status = 400;
    throw err;
  }
  if (src === tgt) {
    return { translatedText: String(text ?? '') };
  }
  const full = String(text ?? '');
  if (full.length > MAX_TRANSLATE_CHARS) {
    const err = new Error(`Text exceeds maximum length (${MAX_TRANSLATE_CHARS} characters).`);
    err.status = 400;
    throw err;
  }
  const remoteBase = trimBase(env.scriptLanguage.libretranslateBaseUrl);
  const useRemoteLibre = Boolean(remoteBase);

  if (!useRemoteLibre && env.scriptLanguage.disableBuiltinTranslation) {
    const err = new Error(
      'Script translation is off: set LIBRETRANSLATE_BASE_URL or remove DISABLE_BUILTIN_SCRIPT_TRANSLATION.'
    );
    err.status = 503;
    throw err;
  }

  const outerMax = useRemoteLibre ? CHUNK_SIZE : 900;
  const parts = chunkTextForTranslation(full, outerMax);
  let translatePlainChunkFn;

  if (useRemoteLibre) {
    const out = [];
    for (const part of parts) {
      if (!part) {
        out.push('');
        continue;
      }
      out.push(
        await postLibreTranslate({
          q: part,
          source: src,
          target: tgt,
        })
      );
    }
    return { translatedText: out.join('') };
  }

  const loadBuiltin = async () => {
    if (!translatePlainChunkFn) {
      const mod = await import('./builtinTranslationService.js');
      translatePlainChunkFn = mod.translatePlainChunk;
    }
  };
  await loadBuiltin();

  /** Run up to `limit` async mappers in parallel (results aligned to `arr`). */
  const mapPool = async (arr, limit, fn) => {
    if (arr.length === 0) return [];
    const results = new Array(arr.length);
    let idx = 0;
    const worker = async () => {
      while (true) {
        const i = idx++;
        if (i >= arr.length) return;
        results[i] = await fn(arr[i], i);
      }
    };
    const n = Math.min(Math.max(1, limit), arr.length);
    await Promise.all(Array.from({ length: n }, () => worker()));
    return results;
  };

  try {
    const translatedParts = await mapPool(parts, 2, async (part) => {
      if (!part) return '';
      return translatePlainChunkFn(part, src, tgt);
    });
    return { translatedText: translatedParts.join('') };
  } catch (e) {
    if (e.status) throw e;
    const wrap = new Error(
      `Built-in translation failed (${e.message}). First run downloads the NLLB model (~1GB+). Ensure disk/RAM, or set LIBRETRANSLATE_BASE_URL instead.`
    );
    wrap.status = 502;
    throw wrap;
  }
}

function buildMultipartBody(fields, fileFieldName, fileBuffer, fileName, fileMime) {
  const boundary = `----CallXTimeScriptLang${Date.now().toString(36)}`;
  const crlf = '\r\n';
  const parts = [];

  for (const [name, value] of fields) {
    if (value == null || value === '') continue;
    parts.push(
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="${String(name).replace(/"/g, '')}"${crlf}${crlf}${String(value)}${crlf}`
      )
    );
  }

  const safeName = String(fileName || 'audio.webm').replace(/"/g, '');
  const mime = String(fileMime || 'application/octet-stream').replace(/[\r\n]/g, '');
  parts.push(
    Buffer.from(
      `--${boundary}${crlf}Content-Disposition: form-data; name="${String(fileFieldName).replace(/"/g, '')}"; filename="${safeName}"${crlf}Content-Type: ${mime}${crlf}${crlf}`
    )
  );
  parts.push(Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer));
  parts.push(Buffer.from(`${crlf}--${boundary}--${crlf}`));

  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: Buffer.concat(parts),
  };
}

export async function transcribeAudioBuffer({ buffer, mimeType, originalName, language }) {
  const url = trimBase(env.scriptLanguage.asrProxyUrl);
  if (!url) {
    const err = new Error('Server-side transcription is not configured (set SCRIPT_ASR_URL).');
    err.status = 503;
    throw err;
  }
  const fields = [];
  if (language) fields.push(['language', String(language)]);

  const { contentType, body } = buildMultipartBody(
    fields,
    'audio',
    buffer,
    originalName || 'recording.webm',
    mimeType || 'application/octet-stream'
  );

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': contentType, Accept: 'application/json' },
      body,
    });
  } catch (err) {
    throw wrapUpstreamFetchFailure(err, 'SCRIPT_ASR_URL', url);
  }
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || raw || `ASR proxy HTTP ${res.status}`;
    const err = new Error(typeof msg === 'string' ? msg : 'ASR proxy request failed');
    err.status = res.status >= 500 ? 502 : 400;
    throw err;
  }
  const text =
    (data && typeof data.text === 'string' && data.text) ||
    (data && typeof data.transcript === 'string' && data.transcript) ||
    (data && typeof data.transcription === 'string' && data.transcription) ||
    '';
  if (!text && typeof data === 'object' && data !== null && Object.keys(data).length > 0) {
    const err = new Error('ASR proxy returned no text field (expected text, transcript, or transcription).');
    err.status = 502;
    throw err;
  }
  return { text: text || '' };
}

export async function textToSpeech({ text, locale }) {
  const url = trimBase(env.scriptLanguage.ttsProxyUrl);
  if (!url) {
    const err = new Error('Server-side TTS is not configured (set SCRIPT_TTS_URL).');
    err.status = 503;
    throw err;
  }
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/*,*/*' },
      body: JSON.stringify({ text: String(text ?? ''), locale: String(locale || 'en') }),
    });
  } catch (err) {
    throw wrapUpstreamFetchFailure(err, 'SCRIPT_TTS_URL', url);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const err = new Error(errText || `TTS proxy HTTP ${res.status}`);
    err.status = res.status >= 500 ? 502 : 400;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'audio/wav';
  return { buffer: buf, contentType };
}
