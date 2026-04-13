/**
 * Shared phone UI rules: country code from a fixed dropdown list, national part max 10 digits.
 */

export const DEFAULT_PHONE_COUNTRY_CODE = '+91';
export const PHONE_NATIONAL_MAX_DIGITS = 10;

/** Dialing codes for <Select> (value must include leading +). */
export const CALLING_CODE_OPTIONS = [
  { value: '+1', label: 'United States / Canada (+1)' },
  { value: '+7', label: 'Russia / Kazakhstan (+7)' },
  { value: '+20', label: 'Egypt (+20)' },
  { value: '+27', label: 'South Africa (+27)' },
  { value: '+30', label: 'Greece (+30)' },
  { value: '+31', label: 'Netherlands (+31)' },
  { value: '+32', label: 'Belgium (+32)' },
  { value: '+33', label: 'France (+33)' },
  { value: '+34', label: 'Spain (+34)' },
  { value: '+39', label: 'Italy (+39)' },
  { value: '+40', label: 'Romania (+40)' },
  { value: '+41', label: 'Switzerland (+41)' },
  { value: '+43', label: 'Austria (+43)' },
  { value: '+44', label: 'United Kingdom (+44)' },
  { value: '+45', label: 'Denmark (+45)' },
  { value: '+46', label: 'Sweden (+46)' },
  { value: '+47', label: 'Norway (+47)' },
  { value: '+48', label: 'Poland (+48)' },
  { value: '+49', label: 'Germany (+49)' },
  { value: '+51', label: 'Peru (+51)' },
  { value: '+52', label: 'Mexico (+52)' },
  { value: '+54', label: 'Argentina (+54)' },
  { value: '+55', label: 'Brazil (+55)' },
  { value: '+56', label: 'Chile (+56)' },
  { value: '+57', label: 'Colombia (+57)' },
  { value: '+60', label: 'Malaysia (+60)' },
  { value: '+61', label: 'Australia (+61)' },
  { value: '+62', label: 'Indonesia (+62)' },
  { value: '+63', label: 'Philippines (+63)' },
  { value: '+64', label: 'New Zealand (+64)' },
  { value: '+65', label: 'Singapore (+65)' },
  { value: '+66', label: 'Thailand (+66)' },
  { value: '+81', label: 'Japan (+81)' },
  { value: '+82', label: 'South Korea (+82)' },
  { value: '+84', label: 'Vietnam (+84)' },
  { value: '+86', label: 'China (+86)' },
  { value: '+90', label: 'Turkey (+90)' },
  { value: '+91', label: 'India (+91)' },
  { value: '+92', label: 'Pakistan (+92)' },
  { value: '+93', label: 'Afghanistan (+93)' },
  { value: '+94', label: 'Sri Lanka (+94)' },
  { value: '+95', label: 'Myanmar (+95)' },
  { value: '+98', label: 'Iran (+98)' },
  { value: '+212', label: 'Morocco (+212)' },
  { value: '+234', label: 'Nigeria (+234)' },
  { value: '+254', label: 'Kenya (+254)' },
  { value: '+351', label: 'Portugal (+351)' },
  { value: '+352', label: 'Luxembourg (+352)' },
  { value: '+353', label: 'Ireland (+353)' },
  { value: '+354', label: 'Iceland (+354)' },
  { value: '+358', label: 'Finland (+358)' },
  { value: '+370', label: 'Lithuania (+370)' },
  { value: '+852', label: 'Hong Kong (+852)' },
  { value: '+853', label: 'Macau (+853)' },
  { value: '+855', label: 'Cambodia (+855)' },
  { value: '+856', label: 'Laos (+856)' },
  { value: '+880', label: 'Bangladesh (+880)' },
  { value: '+886', label: 'Taiwan (+886)' },
  { value: '+966', label: 'Saudi Arabia (+966)' },
  { value: '+971', label: 'United Arab Emirates (+971)' },
  { value: '+972', label: 'Israel (+972)' },
  { value: '+973', label: 'Bahrain (+973)' },
  { value: '+974', label: 'Qatar (+974)' },
  { value: '+975', label: 'Bhutan (+975)' },
  { value: '+977', label: 'Nepal (+977)' },
];

export function normalizeCallingCode(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return DEFAULT_PHONE_COUNTRY_CODE;
  const digits = s.replace(/\D/g, '');
  if (!digits) return DEFAULT_PHONE_COUNTRY_CODE;
  return `+${digits}`;
}

export function onlyNationalDigits(input) {
  return String(input ?? '').replace(/\D/g, '');
}

export function clampNationalDigits(input, max = PHONE_NATIONAL_MAX_DIGITS) {
  return onlyNationalDigits(input).slice(0, max);
}

/**
 * Options for a <Select>: includes the current value at the top if it is not in the catalog.
 */
export function getCallingCodeOptionsForSelect(currentCode) {
  const n = normalizeCallingCode(currentCode);
  if (CALLING_CODE_OPTIONS.some((o) => o.value === n)) return CALLING_CODE_OPTIONS;
  return [{ value: n, label: `Other (${n})` }, ...CALLING_CODE_OPTIONS];
}

export function buildE164FromParts(countryCode, nationalDigits) {
  const cc = normalizeCallingCode(countryCode);
  const num = clampNationalDigits(nationalDigits);
  if (!num) return '';
  return `${cc}${num}`;
}

/**
 * Parse stored E.164 or digit string into country + national (national capped at PHONE_NATIONAL_MAX_DIGITS).
 */
export function splitE164ToParts(value, defaultCode = DEFAULT_PHONE_COUNTRY_CODE) {
  const raw = String(value || '').trim();
  if (!raw) return { country_code: normalizeCallingCode(defaultCode), national: '' };

  const compact = raw.replace(/[^\d+]/g, '');
  const defaultCcDigits = normalizeCallingCode(defaultCode).replace(/\D/g, '');
  const prefix = `+${defaultCcDigits}`;

  if (compact.startsWith(prefix) && compact.length > prefix.length) {
    const rest = compact.slice(prefix.length).replace(/\D/g, '');
    return {
      country_code: normalizeCallingCode(defaultCode),
      national: clampNationalDigits(rest),
    };
  }

  const m = compact.match(/^\+(\d{1,3})(\d*)$/);
  if (m) {
    return { country_code: `+${m[1]}`, national: clampNationalDigits(m[2] || '') };
  }

  return {
    country_code: normalizeCallingCode(defaultCode),
    national: clampNationalDigits(raw),
  };
}

export function isCompleteNationalNumber(nationalDigits) {
  const d = onlyNationalDigits(nationalDigits);
  return d.length === PHONE_NATIONAL_MAX_DIGITS;
}
