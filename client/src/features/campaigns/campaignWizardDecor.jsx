import React from 'react';
import styles from './CampaignsPage.module.scss';

const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
};

function strokeIcon(children) {
  return (
    <svg {...svgProps}>
      {children}
    </svg>
  );
}

export const WizardDecorIcons = {
  basic: strokeIcon(
    <>
      <path
        d="M3 11v3a1 1 0 001 1h2l4 4V7L6 11H4a1 1 0 00-1 1zM16.5 7.5a3 3 0 013 3c0 1.5-1.1 2.7-2.5 3v2l-2-1v-1A3 3 0 0113.5 10a3 3 0 013-2.5z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  settings: strokeIcon(
    <>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.65" />
      <path
        d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </>
  ),
  audience: strokeIcon(
    <>
      <path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  rules: strokeIcon(
    <>
      <path
        d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  channel: strokeIcon(
    <>
      <path
        d="M3 11v3a1 1 0 001 1h2l4 4V7L6 11H4a1 1 0 00-1 1zM18.5 8.5a2.5 2.5 0 012.5 2.5v3a2.5 2.5 0 01-2.5 2.5M15 9v6"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  call: strokeIcon(
    <>
      <path
        d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12.86.3 1.71.6 2.54a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.83.3 1.68.48 2.54.6A2 2 0 0122 16.92z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  article: strokeIcon(
    <>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
    </>
  ),
};

/**
 * @param {Object} p
 * @param {string} p.title
 * @param {string} [p.hint]
 * @param {'indigo'|'teal'|'violet'|'orange'|'pink'|'emerald'|'blue'|'brand'} [p.tone]
 * @param {React.ReactNode} [p.icon] — SVG from WizardDecorIcons; omit for title-only blocks
 */
export function CampaignWizardSectionHeader({ title, hint, tone = 'brand', icon }) {
  return (
    <div className={styles.wizardBlockHeader}>
      {icon ? (
        <div className={`${styles.wizardBadge} ${styles[`wizardBadge_${tone}`]}`.trim()}>{icon}</div>
      ) : null}
      <div className={styles.wizardBlockHeaderText}>
        <h3 className={styles.wizardBlockTitle}>{title}</h3>
        {hint ? <p className={styles.wizardSectionHint}>{hint}</p> : null}
      </div>
    </div>
  );
}
