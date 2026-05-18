import React from 'react';
import { formatPriceWithTax } from '../../utils/planTaxUtils';
import defaultStyles from './TaxAwarePrice.module.scss';

/** Sale price with optional GST line for tenant catalog cards. */
export function TaxAwarePrice({
  salePaise,
  plan,
  saleClassName,
  className,
  taxClassName,
}) {
  const { main, taxLine } = formatPriceWithTax(salePaise, plan);
  const taxCls = taxClassName || defaultStyles.taxLine;

  return (
    <span className={className}>
      <span className={saleClassName}>{main}</span>
      {taxLine ? <span className={taxCls}>{taxLine}</span> : null}
    </span>
  );
}
