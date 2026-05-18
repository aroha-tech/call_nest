import { PLAN_BILLING_CYCLES } from './planCyclePricing';

/** Months per billing cycle (for linear scaling). */
export const CYCLE_MONTH_COUNT = {
  month: 1,
  quarter: 3,
  semiannual: 6,
  year: 12,
};

const CYCLE_VALUES = PLAN_BILLING_CYCLES.map((c) => c.value);

/** Default extra credit % when inferring from form (yearly only). */
export const DEFAULT_CREDIT_BONUS_PERCENT = {
  month: '0',
  quarter: '0',
  semiannual: '0',
  year: '10',
};

function parseRupee(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parsePercent(v) {
  if (v == null || String(v).trim() === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, n);
}

/** Round to whole rupees for plan form inputs. */
export function roundPlanRupee(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** Derive discount % from original and sale (for form fields). */
export function discountPercentFromPrices(original, sale) {
  const o = Number(original);
  const s = Number(sale);
  if (!Number.isFinite(o) || o <= 0 || !Number.isFinite(s) || s >= o) return '';
  return String(Math.min(100, Math.max(0, Math.round((1 - s / o) * 100))));
}

function emptyRow(cycle) {
  return {
    credit: '',
    creditBonus: DEFAULT_CREDIT_BONUS_PERCENT[cycle] ?? '0',
    sale: '',
    original: '',
    discount: '',
  };
}

export function emptyCycleTable() {
  const table = {};
  for (const v of CYCLE_VALUES) table[v] = emptyRow(v);
  return table;
}

/** Included credit = monthly base × months × (1 + add-on % / 100). */
export function computeCreditForCycle(monthlyBase, cycle, creditBonusPercent) {
  const base = parseRupee(monthlyBase);
  if (base == null) return null;
  const months = CYCLE_MONTH_COUNT[cycle] ?? 1;
  const bonus = parsePercent(creditBonusPercent) / 100;
  return roundPlanRupee(base * months * (1 + bonus));
}

/** Infer add-on % from monthly base, months, and total credit for the period. */
export function creditBonusFromCredit(monthlyBase, cycle, credit) {
  const base = parseRupee(monthlyBase);
  const total = parseRupee(credit);
  const months = CYCLE_MONTH_COUNT[cycle] ?? 1;
  if (base == null || base <= 0 || total == null) return '';
  const linear = base * months;
  if (linear <= 0) return '';
  const bonus = Math.max(0, Math.round((total / linear - 1) * 100));
  return String(bonus);
}

/** Recompute included credit on every row from monthly base + each row's add-on %. */
export function recalcCreditsFromMonthlyBase(table) {
  const base = parseRupee(table.month?.credit);
  if (base == null) return table;

  const next = { ...table };
  for (const { value } of PLAN_BILLING_CYCLES) {
    const credit = computeCreditForCycle(base, value, next[value]?.creditBonus);
    next[value] = {
      ...next[value],
      credit: credit != null ? String(credit) : '',
    };
  }
  return next;
}

/** Build calculator table state from plan form. */
export function cycleTableFromForm(form, { showIncludedCredit = true } = {}) {
  const table = emptyCycleTable();
  for (const { value } of PLAN_BILLING_CYCLES) {
    const row = table[value];
    if (showIncludedCredit) {
      row.credit = String(form[`included_wallet_credit_${value}_paise`] ?? '').trim();
      if (value === 'month' && !row.credit) {
        row.credit = String(form.included_wallet_credit_paise ?? '').trim();
      }
    }
    row.sale = String(form[`price_${value}_sale_paise`] ?? '').trim();
    row.original = String(form[`price_${value}_original_paise`] ?? '').trim();
    row.discount = String(form[`price_${value}_discount_percent`] ?? '').trim();
    if (!row.discount && row.original && row.sale) {
      row.discount = discountPercentFromPrices(row.original, row.sale);
    }
  }

  if (showIncludedCredit && parseRupee(table.month?.credit) != null) {
    for (const { value } of PLAN_BILLING_CYCLES) {
      const inferred = creditBonusFromCredit(table.month.credit, value, table[value].credit);
      if (inferred !== '') {
        table[value].creditBonus = inferred;
      }
    }
  }

  return table;
}

function syncRowDiscount(row) {
  return {
    ...row,
    discount: discountPercentFromPrices(row.original, row.sale),
  };
}

function saleFromOriginalAndDiscount(original, discountStr) {
  const o = parseRupee(original);
  if (o == null || o <= 0) return null;
  const d = parsePercent(discountStr) / 100;
  return roundPlanRupee(o * (1 - d));
}

/** Scale sale or original from monthly to other cycles (× months, no add-on). */
export function scaleFieldFromMonthly(table, field) {
  const monthlyVal = parseRupee(table.month?.[field]);
  if (monthlyVal == null) return table;

  const next = { ...table };
  for (const { value } of PLAN_BILLING_CYCLES) {
    if (value === 'month') continue;
    const months = CYCLE_MONTH_COUNT[value];
    const scaled = roundPlanRupee(monthlyVal * months);
    next[value] = {
      ...next[value],
      [field]: scaled != null ? String(scaled) : '',
    };
    if (field === 'sale' || field === 'original') {
      next[value] = syncRowDiscount(next[value]);
    }
  }
  return next;
}

/** Recalculate credits (with add-on %) and linear sale/original from monthly row. */
export function scaleAllFromMonthly(table, { showIncludedCredit = true } = {}) {
  let next = table;
  if (showIncludedCredit) next = recalcCreditsFromMonthlyBase(next);
  next = scaleFieldFromMonthly(next, 'sale');
  next = scaleFieldFromMonthly(next, 'original');
  return next;
}

/**
 * Update one editable cell.
 * @param {'credit'|'creditBonus'|'sale'|'original'|'discount'} column
 */
export function updateCycleTableCell(table, cycle, column, value, { showIncludedCredit = true } = {}) {
  let next = {
    ...table,
    [cycle]: { ...table[cycle], [column]: value },
  };

  const row = { ...next[cycle] };

  if (column === 'creditBonus' && showIncludedCredit) {
    row.creditBonus = value;
    const base = parseRupee(next.month?.credit);
    if (base != null) {
      const credit = computeCreditForCycle(base, cycle, value);
      row.credit = credit != null ? String(credit) : '';
    }
  } else if (column === 'credit' && showIncludedCredit) {
    row.credit = value;
    row.creditBonus = creditBonusFromCredit(next.month?.credit, cycle, value);
  } else if (column === 'discount') {
    const sale = saleFromOriginalAndDiscount(row.original, value);
    if (sale != null) row.sale = String(sale);
    row.discount = value;
  } else if (column === 'sale' || column === 'original') {
    row[column] = value;
    row.discount = discountPercentFromPrices(row.original, row.sale);
  } else {
    row[column] = value;
  }

  next[cycle] = row;

  if (cycle === 'month') {
    if (column === 'credit' && showIncludedCredit) {
      next = recalcCreditsFromMonthlyBase(next);
    } else if (column === 'creditBonus' && showIncludedCredit) {
      const credit = computeCreditForCycle(next.month.credit, 'month', value);
      next.month = {
        ...next.month,
        creditBonus: value,
        credit: credit != null ? String(credit) : next.month.credit,
      };
    } else if (column === 'sale') {
      next = scaleFieldFromMonthly(next, 'sale');
    } else if (column === 'original') {
      next = scaleFieldFromMonthly(next, 'original');
    } else if (column === 'discount') {
      const sale = saleFromOriginalAndDiscount(next.month.original, value);
      if (sale != null) {
        next.month = { ...next.month, sale: String(sale), discount: value };
        next = scaleFieldFromMonthly(next, 'sale');
        next.month = { ...next.month, discount: value };
      }
    }
  }

  return next;
}
