import React, { Children } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { formatPriceWithTax } from '../../utils/planTaxUtils';
import shared from './TelephonyPlanCardShared.module.scss';

const TYPE_CHIP = {
  credit: {
    icon: 'account_balance_wallet',
    label: 'Pay per minute',
    className: shared.chipCredit,
  },
  unlimited: {
    icon: 'all_inclusive',
    label: 'Unlimited calling',
    className: shared.chipUnlimited,
  },
  credit_pack: {
    icon: 'bolt',
    label: 'One-time top-up',
    className: shared.chipPack,
  },
  seat: {
    icon: 'person_add',
    label: 'Seat add-on',
    className: shared.chipSeat,
  },
  enterprise: {
    icon: 'handshake',
    label: 'Custom pricing',
    className: shared.chipEnterprise,
  },
  free: {
    icon: 'rocket_launch',
    label: 'Free trial',
    className: shared.chipFree,
  },
};

export function PlanTypeChip({ variant = 'credit' }) {
  const cfg = TYPE_CHIP[variant] || TYPE_CHIP.credit;
  return (
    <span className={`${shared.typeChip} ${cfg.className}`}>
      <MaterialSymbol name={cfg.icon} size="xs" className={shared.typeChipIcon} />
      {cfg.label}
    </span>
  );
}

export function PlanCardTopRow({ name, discountPercent, isCurrent, extraBadge = null }) {
  return (
    <div className={shared.topRow}>
      <h3 className={shared.cardName}>{name}</h3>
      <div className={shared.topBadges}>
        {extraBadge}
        {discountPercent > 0 ? (
          <span className={shared.discountPill}>{discountPercent}% off</span>
        ) : null}
        {isCurrent ? <span className={shared.currentPill}>Current</span> : null}
      </div>
    </div>
  );
}

export function PlanCardPrice({
  isEnterprise,
  isFree,
  showStrike,
  originalFormatted,
  salePaise,
  plan,
  intervalSuffix,
  customLabel = 'Custom',
}) {
  const priced = formatPriceWithTax(salePaise, plan);

  return (
    <div className={shared.priceSection}>
      <div className={shared.priceRow}>
        {isEnterprise ? (
          <span className={shared.priceCustom}>{customLabel}</span>
        ) : isFree ? (
          <span className={shared.salePrice}>Free</span>
        ) : (
          <>
            {showStrike ? <span className={shared.originalPrice}>{originalFormatted}</span> : null}
            <span className={shared.salePrice}>{priced.main}</span>
            {intervalSuffix ? <span className={shared.interval}>{intervalSuffix}</span> : null}
          </>
        )}
      </div>
      {!isEnterprise && !isFree && priced.taxLine ? (
        <p className={shared.taxLine}>{priced.taxLine}</p>
      ) : null}
    </div>
  );
}

export function PlanCardHighlight({ icon, children }) {
  return (
    <div className={shared.highlightRow}>
      <MaterialSymbol name={icon} size="xs" className={shared.highlightIcon} />
      <span className={shared.highlightText}>{children}</span>
    </div>
  );
}

export function PlanCardHighlights({ children }) {
  const items = Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return <div className={shared.highlights}>{items}</div>;
}

export function PlanCardFeatures({ plan }) {
  if (plan?.features_html) {
    return (
      <div
        className={shared.featuresHtml}
        dangerouslySetInnerHTML={{ __html: plan.features_html }}
      />
    );
  }
  const lines = Array.isArray(plan?.features_json)
    ? plan.features_json.map((x) => (typeof x === 'string' ? x : x?.text)).filter(Boolean)
    : [];
  if (!lines.length && plan?.description) {
    return <p className={shared.desc}>{plan.description}</p>;
  }
  if (!lines.length) return null;
  return (
    <ul className={shared.featuresList}>
      {lines.map((line, i) => (
        <li key={i}>
          <MaterialSymbol name="check_circle" size="xs" className={shared.featureCheck} />
          {line}
        </li>
      ))}
    </ul>
  );
}

export function PlanCardBody({ children }) {
  return <div className={shared.body}>{children}</div>;
}

export function PlanCardFooter({ children }) {
  return <div className={shared.footer}>{children}</div>;
}

export { shared as planCardStyles };
