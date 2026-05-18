import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { InfoHelpIcon, infoHelpHeadingRowClassName } from '../ui/InfoHelpIcon';
import { PLAN_BILLING_CYCLES } from '../../utils/planCyclePricing';
import {
  CYCLE_MONTH_COUNT,
  cycleTableFromForm,
  discountPercentFromPrices,
  scaleAllFromMonthly,
  updateCycleTableCell,
} from '../../utils/planCycleCalculatorUtils';
import { cycleCalculatorHelpText } from './planCycleCalculatorHelp';
import styles from './PlanCyclePricingCalculator.module.scss';

/**
 * Editable per-cycle table: change any cell, monthly row auto-scales other cycles (×3, ×6, ×12).
 */
export function PlanCyclePricingCalculator({ form, setForm, showIncludedCredit = true }) {
  const [collapsed, setCollapsed] = useState(false);
  const [table, setTable] = useState(() => cycleTableFromForm(form, { showIncludedCredit }));
  const helpMessage = useMemo(
    () => cycleCalculatorHelpText({ showIncludedCredit }),
    [showIncludedCredit]
  );

  const pullFromForm = useCallback(() => {
    setTable(cycleTableFromForm(form, { showIncludedCredit }));
  }, [form, showIncludedCredit]);

  const scaleFromMonthly = useCallback(() => {
    setTable((t) => scaleAllFromMonthly(t, { showIncludedCredit }));
  }, [showIncludedCredit]);

  const onCellChange = useCallback(
    (cycle, column, value) => {
      setTable((t) => updateCycleTableCell(t, cycle, column, value, { showIncludedCredit }));
    },
    [showIncludedCredit]
  );

  function applyCredits() {
    setForm((f) => {
      const next = { ...f };
      for (const { value } of PLAN_BILLING_CYCLES) {
        next[`included_wallet_credit_${value}_paise`] = table[value]?.credit ?? '';
      }
      next.included_wallet_credit_paise = table.month?.credit ?? '';
      return next;
    });
  }

  function applySalePrices() {
    setForm((f) => {
      const next = { ...f };
      for (const { value } of PLAN_BILLING_CYCLES) {
        const row = table[value];
        next[`price_${value}_sale_paise`] = row?.sale ?? '';
        next[`price_${value}_original_paise`] = row?.original ?? '';
        next[`price_${value}_discount_percent`] = row?.discount ?? '';
      }
      next.sale_price_paise = table.month?.sale ?? '';
      next.original_price_paise = table.month?.original ?? '';
      next.discount_percent = discountPercentFromPrices(table.month?.original, table.month?.sale);
      return next;
    });
  }

  function applyAll() {
    if (showIncludedCredit) applyCredits();
    applySalePrices();
  }

  const titleRow = (
    <div className={`${infoHelpHeadingRowClassName} ${styles.titleRow}`.trim()}>
      <MaterialSymbol name="calculate" size="sm" aria-hidden />
      <span className={styles.title}>Cycle calculator</span>
      <InfoHelpIcon
        title="Cycle calculator info"
        modalTitle="Cycle calculator"
        message={helpMessage}
      />
    </div>
  );

  if (collapsed) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          {titleRow}
          <button type="button" className={styles.toggleBtn} onClick={() => setCollapsed(false)}>
            Show
          </button>
        </div>
      </div>
    );
  }

  return (
    <fieldset className={styles.panel}>
      <div className={styles.header}>
        {titleRow}
        <button type="button" className={styles.toggleBtn} onClick={() => setCollapsed(true)}>
          Hide
        </button>
      </div>

      <div className={styles.toolbar}>
        <Button type="button" variant="secondary" size="sm" onClick={pullFromForm}>
          <MaterialSymbol name="download" size="sm" aria-hidden />
          Load from form
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={scaleFromMonthly}>
          <MaterialSymbol name="autorenew" size="sm" aria-hidden />
          Recalculate all from monthly
        </Button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Cycle</th>
              <th>Mo</th>
              {showIncludedCredit ? (
                <>
                  <th>Credit add-on %</th>
                  <th>Included credit (₹)</th>
                </>
              ) : null}
              <th>Sale (₹)</th>
              <th>Original (₹)</th>
              <th>Disc %</th>
            </tr>
          </thead>
          <tbody>
            {PLAN_BILLING_CYCLES.map(({ value, label }) => {
              const row = table[value] || {};
              const months = CYCLE_MONTH_COUNT[value];
              return (
                <tr key={value}>
                  <td className={styles.cycleLabel}>{label}</td>
                  <td className={styles.monthsCol}>{months}</td>
                  {showIncludedCredit ? (
                    <>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="1"
                          className={`${styles.cellInput} ${styles.discountInput}`}
                          placeholder="0"
                          value={row.creditBonus ?? ''}
                          onChange={(e) => onCellChange(value, 'creditBonus', e.target.value)}
                          aria-label={`${label} credit add-on percent`}
                          title="Extra included credit vs linear (monthly × months)"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className={styles.cellInput}
                          placeholder="—"
                          value={row.credit ?? ''}
                          onChange={(e) => onCellChange(value, 'credit', e.target.value)}
                          aria-label={`${label} included credit`}
                        />
                      </td>
                    </>
                  ) : null}
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className={styles.cellInput}
                      placeholder="—"
                      value={row.sale ?? ''}
                      onChange={(e) => onCellChange(value, 'sale', e.target.value)}
                      aria-label={`${label} sale price`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className={styles.cellInput}
                      placeholder="—"
                      value={row.original ?? ''}
                      onChange={(e) => onCellChange(value, 'original', e.target.value)}
                      aria-label={`${label} original price`}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      className={`${styles.cellInput} ${styles.discountInput}`}
                      placeholder="—"
                      value={row.discount ?? ''}
                      onChange={(e) => onCellChange(value, 'discount', e.target.value)}
                      aria-label={`${label} discount percent`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.actions}>
        {showIncludedCredit ? (
          <Button type="button" variant="secondary" size="sm" onClick={applyCredits}>
            Apply credits
          </Button>
        ) : null}
        <Button type="button" variant="secondary" size="sm" onClick={applySalePrices}>
          Apply sale prices
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={applyAll}>
          Apply all
        </Button>
      </div>
    </fieldset>
  );
}
