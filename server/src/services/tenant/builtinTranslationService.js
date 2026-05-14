/**
 * In-process script translation (no LibreTranslate server).
 * Uses Transformers.js NLLB + franc-min for source=auto.
 */
import { pipeline, env as tfEnv } from '@xenova/transformers';
import { franc } from 'franc-min';

tfEnv.allowLocalModels = true;

const MODEL_ID = 'Xenova/nllb-200-distilled-600M';
/** NLLB context length — keep slices small for CPU stability */
const SUB_CHUNK = 480;

/** ISO 639-1 → NLLB FLORES-200 codes (subset aligned with call script UI languages) */
const ISO1_TO_FLORES = {
  en: 'eng_Latn',
  es: 'spa_Latn',
  fr: 'fra_Latn',
  de: 'deu_Latn',
  hi: 'hin_Deva',
  pt: 'por_Latn',
  it: 'ita_Latn',
  ja: 'jpn_Jpan',
  zh: 'zho_Hans',
  ar: 'arb_Arab',
  nl: 'nld_Latn',
  pl: 'pol_Latn',
  ru: 'rus_Cyrl',
  tr: 'tur_Latn',
  ko: 'kor_Hang',
  vi: 'vie_Latn',
  th: 'tha_Thai',
  id: 'ind_Latn',
  ta: 'tam_Taml',
  te: 'tel_Telu',
  mr: 'mar_Deva',
  bn: 'ben_Beng',
  gu: 'guj_Gujr',
  kn: 'kan_Knda',
  ml: 'mal_Mlym',
  pa: 'pan_Guru',
  ur: 'urd_Arab',
  fa: 'pes_Arab',
  uk: 'ukr_Cyrl',
  cs: 'ces_Latn',
  sv: 'swe_Latn',
  da: 'dan_Latn',
  fi: 'fin_Latn',
  no: 'nob_Latn',
  ro: 'ron_Latn',
  el: 'ell_Grek',
  he: 'heb_Hebr',
};

/** franc-min returns ISO 639-3 */
const FRANC3_TO_ISO1 = {
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  hin: 'hi',
  por: 'pt',
  ita: 'it',
  jpn: 'ja',
  cmn: 'zh',
  arb: 'ar',
  nld: 'nl',
  pol: 'pl',
  rus: 'ru',
  tur: 'tr',
  kor: 'ko',
  vie: 'vi',
  tha: 'th',
  ind: 'id',
  tam: 'ta',
  tel: 'te',
  mar: 'mr',
  ben: 'bn',
  guj: 'gu',
  kan: 'kn',
  mal: 'ml',
  pan: 'pa',
  urd: 'ur',
  pes: 'fa',
  ukr: 'uk',
  ces: 'cs',
  swe: 'sv',
  dan: 'da',
  fin: 'fi',
  nob: 'no',
  ron: 'ro',
  ell: 'el',
  heb: 'he',
};

let translatorPromise = null;

async function getTranslator() {
  if (!translatorPromise) {
    translatorPromise = pipeline('translation', MODEL_ID);
  }
  return translatorPromise;
}

function detectSourceIso1(text) {
  const sample = String(text || '').slice(0, 2000);
  if (sample.trim().length < 12) return 'en';
  const code3 = franc(sample, { minLength: 8 });
  if (!code3 || code3 === 'und') return 'en';
  return FRANC3_TO_ISO1[code3] || 'en';
}

function toFlores(iso1) {
  const k = String(iso1 || 'en').toLowerCase();
  const fl = ISO1_TO_FLORES[k];
  if (!fl) {
    const err = new Error(
      `Built-in translation has no FLORES mapping for "${k}". Set LIBRETRANSLATE_BASE_URL for full language coverage.`
    );
    err.status = 400;
    throw err;
  }
  return fl;
}

/**
 * Translate one plain-text segment (may split internally for model limits).
 */
export async function translatePlainChunk(text, sourceIso, targetIso) {
  const src = String(sourceIso || 'auto').toLowerCase();
  const tgt = String(targetIso || '').toLowerCase();
  if (!tgt) {
    const err = new Error('target language is required');
    err.status = 400;
    throw err;
  }

  const srcResolved = src === 'auto' || !src ? detectSourceIso1(text) : src;
  const srcFlores = toFlores(srcResolved);
  const tgtFlores = toFlores(tgt);
  if (srcFlores === tgtFlores) {
    return String(text ?? '');
  }

  const raw = String(text ?? '');
  if (!raw) return '';

  const translator = await getTranslator();
  const pieces = [];
  for (let i = 0; i < raw.length; i += SUB_CHUNK) {
    const slice = raw.slice(i, i + SUB_CHUNK);
    if (!slice.trim()) {
      pieces.push(slice);
      continue;
    }
    const out = await translator(slice, { src_lang: srcFlores, tgt_lang: tgtFlores });
    const line =
      Array.isArray(out) && out[0] && typeof out[0].translation_text === 'string'
        ? out[0].translation_text
        : '';
    pieces.push(line);
  }
  return pieces.join('');
}
