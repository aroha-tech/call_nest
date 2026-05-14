/** ISO 639-1 → BCP-47 for Web Speech API */
export const SPEECH_RECOGNITION_LANG = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  hi: 'hi-IN',
  pt: 'pt-BR',
  it: 'it-IT',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ar: 'ar-SA',
  nl: 'nl-NL',
  pl: 'pl-PL',
  ru: 'ru-RU',
  tr: 'tr-TR',
  ko: 'ko-KR',
  vi: 'vi-VN',
  th: 'th-TH',
  id: 'id-ID',
  ta: 'ta-IN',
  te: 'te-IN',
  mr: 'mr-IN',
  bn: 'bn-IN',
  gu: 'gu-IN',
  kn: 'kn-IN',
  ml: 'ml-IN',
  pa: 'pa-IN',
  ur: 'ur-PK',
  fa: 'fa-IR',
  uk: 'uk-UA',
  cs: 'cs-CZ',
  sv: 'sv-SE',
  da: 'da-DK',
  fi: 'fi-FI',
  no: 'nb-NO',
  ro: 'ro-RO',
  el: 'el-GR',
  he: 'he-IL',
};

export const SCRIPT_LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'hi', label: 'Hindi' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'nl', label: 'Dutch' },
  { value: 'pl', label: 'Polish' },
  { value: 'ru', label: 'Russian' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ko', label: 'Korean' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'th', label: 'Thai' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'bn', label: 'Bengali' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
  { value: 'pa', label: 'Punjabi' },
  { value: 'ur', label: 'Urdu' },
  { value: 'fa', label: 'Persian' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'cs', label: 'Czech' },
  { value: 'sv', label: 'Swedish' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'ro', label: 'Romanian' },
  { value: 'el', label: 'Greek' },
  { value: 'he', label: 'Hebrew' },
];

function escapeHtmlText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Turn plain text (possibly with newlines) into minimal HTML suitable for Quill.
 */
export function plainTextToQuillHtml(plain) {
  const raw = String(plain ?? '').replace(/\r\n/g, '\n');
  if (!raw.trim()) {
    return '<p><br></p>';
  }
  const blocks = raw.split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split('\n');
      const inner = lines
        .map((line) => {
          const t = line.trimEnd();
          return t === '' ? '<br>' : escapeHtmlText(t);
        })
        .join('<br>');
      return `<p>${inner || '<br>'}</p>`;
    })
    .join('');
}

export function getSpeechRecognitionLangCode(iso639) {
  const key = String(iso639 || 'en').toLowerCase();
  return SPEECH_RECOGNITION_LANG[key] || `${key}-${key.toUpperCase()}`;
}
