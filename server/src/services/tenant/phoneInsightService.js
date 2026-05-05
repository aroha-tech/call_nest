import parsePhoneNumber from 'libphonenumber-js/max';

const INPUT_MAX_LEN = 250;

function normalizeDefaultCountry(raw) {
  if (raw == null || raw === '') return undefined;
  const s = String(raw).trim().toUpperCase();
  if (s.length !== 2 || !/^[A-Z]{2}$/.test(s)) return undefined;
  return s;
}

/**
 * Offline phone number analysis from public numbering-plan metadata (libphonenumber /max).
 * No carrier HLR, CNAM, or paid lookups.
 *
 * @param {string} phone - Raw user input or E.164
 * @param {string} [defaultCountry] - ISO 3166-1 alpha-2 when `phone` is not in international form
 * @returns {{
 *   source: 'libphonenumber',
 *   input: string,
 *   parseable: boolean,
 *   not_a_number?: boolean,
 *   e164?: string | null,
 *   country_calling_code?: string,
 *   national_number?: string,
 *   country?: string | null,
 *   possible_countries?: string[],
 *   number_type?: string | null,
 *   is_non_geographic?: boolean,
 *   extension?: string | null,
 *   carrier_dial_code?: string | null,
 *   is_possible?: boolean,
 *   is_valid?: boolean,
 *   length_issue?: string | null,
 *   formats?: { international: string, national: string, e164: string, rfc3966: string },
 * }}
 */
export function analyzePhoneNumber(phone, defaultCountry) {
  const input = String(phone ?? '')
    .trim()
    .slice(0, INPUT_MAX_LEN);
  if (!input) {
    const err = new Error('Missing phone — pass `phone` or `e164` query parameter');
    err.status = 400;
    throw err;
  }

  const defaultCountryResolved = normalizeDefaultCountry(defaultCountry);

  let parsed;
  try {
    parsed = parsePhoneNumber(input, defaultCountryResolved);
  } catch {
    parsed = undefined;
  }

  if (!parsed) {
    return {
      source: 'libphonenumber',
      input,
      parseable: false,
      not_a_number: true,
    };
  }

  const lengthIssue = typeof parsed.validateLength === 'function' ? parsed.validateLength() : null;

  return {
    source: 'libphonenumber',
    input,
    parseable: true,
    not_a_number: false,
    e164: parsed.number,
    country_calling_code: parsed.countryCallingCode,
    national_number: parsed.nationalNumber,
    country: parsed.country ?? null,
    possible_countries: parsed.getPossibleCountries(),
    number_type: parsed.getType() ?? null,
    is_non_geographic: parsed.isNonGeographic(),
    extension: parsed.ext ?? null,
    carrier_dial_code: parsed.carrierCode ?? null,
    is_possible: parsed.isPossible(),
    is_valid: parsed.isValid(),
    length_issue: lengthIssue ?? null,
    formats: {
      international: parsed.formatInternational(),
      national: parsed.formatNational(),
      e164: parsed.format('E.164'),
      rfc3966: parsed.getURI(),
    },
  };
}
