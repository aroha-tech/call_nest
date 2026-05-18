/** Help copy for cycle calculator info popover. */

export function cycleCalculatorHelpText({ showIncludedCredit = true } = {}) {
  const creditBlock = showIncludedCredit
    ? `

Included wallet credit is granted once per period (e.g. yearly can offer more than 12× monthly).

Set monthly included credit, then use Credit add-on % per cycle for extra wallet credit (e.g. 10% on yearly). Changing monthly credit or add-on % recalculates included credit.

Credit add-on %: included credit = monthly base × months × (1 + add-on%).`
    : '';

  return `Set prices for each billing cycle on this plan. Tenants pick a cycle at checkout. Leave a cycle empty to hide it.${creditBlock}

Sale prices scale ×3, ×6, ×12 from the monthly row when you recalculate.

Price disc % updates sale from original on that row.

Load from form — copies current form values into the table.

Recalculate all from monthly — scales sale prices (and included credit when enabled) for quarterly, 6-month, and yearly rows.

Apply credits / Apply sale prices / Apply all — writes the table back to the form.`;
}

export const PLAN_TAX_HELP_TEXT = `GST is applied at checkout.

When Sale prices include GST is checked, entered sale prices already contain tax. When unchecked, GST is added on top of the catalog price at checkout.

Checkout preview shows taxable amount (pre-tax base), GST, and total charged.`;
