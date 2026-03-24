import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import {
  normalizeImportHeader,
  EMAIL_KEYS,
  PRIMARY_PHONE_KEYS,
  FULL_NAME_KEYS,
  FIRST_NAME_KEYS,
  LAST_NAME_KEYS,
  DISPLAY_NAME_KEYS,
  CITY_KEYS,
  STATE_KEYS,
  COUNTRY_KEYS,
  ADDRESS_KEYS,
  ADDRESS_LINE2_KEYS,
  PIN_CODE_KEYS,
  COMPANY_KEYS,
  JOB_TITLE_KEYS,
  WEBSITE_KEYS,
  INDUSTRY_KEYS,
  DATE_OF_BIRTH_KEYS,
  TAX_ID_KEYS,
  REMARK_KEYS,
  REMARK_STATUS_KEYS,
  ASSIGN_DATE_KEYS,
  LEAD_DATE_KEYS,
  LEAD_TIMESTAMP_KEYS,
  ASSIGN_STATUS_KEYS,
  SERVICES_KEYS,
} from './leadImportCsvHelpers.js';

function isZipStyleXlsxBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  return buf[0] === 0x50 && buf[1] === 0x4b;
}

function isLegacyXlsBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return false;
  return buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
}

function buildHeaderHintSet() {
  const keys = [
    ...EMAIL_KEYS,
    ...PRIMARY_PHONE_KEYS,
    ...FULL_NAME_KEYS,
    ...FIRST_NAME_KEYS,
    ...LAST_NAME_KEYS,
    ...DISPLAY_NAME_KEYS,
    'sno',
    'serial',
    'serial_no',
    'sr_no',
    ...CITY_KEYS,
    ...STATE_KEYS,
    ...COUNTRY_KEYS,
    ...ADDRESS_KEYS,
    ...ADDRESS_LINE2_KEYS,
    ...COMPANY_KEYS,
    ...JOB_TITLE_KEYS,
    ...WEBSITE_KEYS,
    ...INDUSTRY_KEYS,
    ...DATE_OF_BIRTH_KEYS,
    ...TAX_ID_KEYS,
    ...ASSIGN_DATE_KEYS,
    ...LEAD_DATE_KEYS,
    ...LEAD_TIMESTAMP_KEYS,
    ...PIN_CODE_KEYS,
    ...REMARK_KEYS,
    ...REMARK_STATUS_KEYS,
    ...ASSIGN_STATUS_KEYS,
    ...SERVICES_KEYS,
  ];
  return new Set(keys.map((k) => normalizeImportHeader(k)));
}

/**
 * Pick the row most likely to be column headers (handles pivot/summary rows above the real table).
 */
function findBestHeaderRowIndex(matrix, maxScan = 80) {
  const hints = buildHeaderHintSet();
  let bestIdx = 0;
  let bestScore = -1;
  const limit = Math.min(matrix.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    let score = 0;
    for (const cell of row) {
      const n = normalizeImportHeader(String(cell ?? ''));
      if (n && hints.has(n)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestScore >= 2) return bestIdx;
  return 0;
}

function dedupeHeaderLabels(rawHeaders) {
  const seen = new Map();
  return rawHeaders.map((h, idx) => {
    const base = String(h ?? '').trim() || `__EMPTY_${idx}`;
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    if (n === 0) return base;
    return `${base}_${n + 1}`;
  });
}

function matrixToRecords(matrix, headerRowIndex) {
  const headerCells = matrix[headerRowIndex] || [];
  const headers = dedupeHeaderLabels(headerCells.map((c) => (c != null && c !== '' ? String(c) : '')));
  const records = [];

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!Array.isArray(row)) continue;
    const obj = {};
    let any = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key || key.startsWith('__EMPTY_')) continue;
      const raw = row[c];
      let val = raw;
      if (val instanceof Date) {
        val = val.toISOString().slice(0, 10);
      } else if (val != null && val !== '') {
        val = String(val).trim();
      } else {
        val = '';
      }
      if (val) any = true;
      obj[key] = val;
    }
    if (any) records.push(obj);
  }
  return records;
}

function parseXlsxBuffer(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch (e) {
    const err = new Error(`Could not read Excel file: ${e?.message || 'invalid workbook'}`);
    err.status = 400;
    throw err;
  }
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) {
    const err = new Error('Excel file has no sheets.');
    err.status = 400;
    throw err;
  }
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  });
  if (!matrix || matrix.length === 0) {
    return { records: [], headerRowIndex: 0 };
  }
  const headerIdx = findBestHeaderRowIndex(matrix);
  const records = matrixToRecords(matrix, headerIdx);
  return { records, headerRowIndex: headerIdx };
}

function parseCsvBuffer(buffer) {
  const csvText = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer || '');
  try {
    const records = parseCsv(csvText, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
    return { records };
  } catch (e) {
    const msg = e?.message || String(e);
    if (isZipStyleXlsxBuffer(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []))) {
      const err = new Error(
        'This file is an Excel workbook (.xlsx), not a CSV. Renaming .xlsx to .csv does not convert it — upload the real .xlsx file or export CSV from Excel.'
      );
      err.status = 400;
      throw err;
    }
    const err = new Error(
      `Could not parse CSV (${msg}). Check encoding (UTF-8), quoting, or export again from Excel as CSV.`
    );
    err.status = 400;
    throw err;
  }
}

/**
 * Parse an uploaded import file into row objects (same shape as csv-parse with columns: true).
 * Supports UTF-8 CSV and .xlsx (first sheet). Detects Excel ZIP magic even when the filename is .csv.
 *
 * @param {Buffer} buffer
 * @param {{ originalFilename?: string }} [opts]
 * @returns {{ records: Record<string, string>[], headerRowIndex: number }}
 *   headerRowIndex is 0-based row index of the header row in the sheet (0 for CSV).
 */
export function parseImportBufferToRecords(buffer, { originalFilename = '' } = {}) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const name = String(originalFilename || '').toLowerCase();

  if (isLegacyXlsBuffer(buf)) {
    const err = new Error(
      'Old Excel format (.xls) is not supported. Open the file in Excel and save as .xlsx or export as CSV, then upload again.'
    );
    err.status = 400;
    throw err;
  }

  // OOXML workbooks are ZIP-based (PK…). Detect that even when the file was renamed to .csv.
  if (isZipStyleXlsxBuffer(buf)) {
    return parseXlsxBuffer(buf);
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || name.endsWith('.xlsb')) {
    return parseXlsxBuffer(buf);
  }

  const { records } = parseCsvBuffer(buf);
  return { records, headerRowIndex: 0 };
}
