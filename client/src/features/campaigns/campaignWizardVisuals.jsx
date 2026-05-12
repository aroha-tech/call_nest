import React from 'react';

/** Send / paper plane for wizard modal header (white on purple tile). */
export function WizardPaperPlaneIcon({ className }) {
  return (
    <svg
      className={className}
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

/** Small rocket (stroke) for buttons and stepper — use currentColor. */
export function WizardRocketMini({ className }) {
  const s = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true, className };
  return (
    <svg {...s}>
      <path
        d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2l.5-.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Hero rocket for Review & Launch card (purple + accent stars). */
export function WizardLaunchRocketHero({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx="50" cy="14" r="2.2" fill="#818cf8" />
      <circle cx="54" cy="22" r="1.6" fill="#c4b5fd" />
      <circle cx="46" cy="20" r="1.2" fill="#fb923c" opacity="0.95" />
      <path
        d="M14 44c-4 1.2-6.5 4.2-8 8.5-.4 1.2.6 2.5 2 2.5 4.2 0 7.2-2.8 8.5-6.5l-2.5-4.5Z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M32 10c10 5 16 14 18 24-5-2.5-10.5-4-18-4s-13 1.5-18 4c2-10 8-19 18-24Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M32 10v16M26 20l6 4 6-4"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.35"
      />
    </svg>
  );
}

/** Icons for audience source cards (stroke; color via CSS currentColor). */
export function AudienceSourceIcon({ variant }) {
  const s = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  const strokeIc = {
    stroke: 'currentColor',
    strokeWidth: 1.65,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  if (variant === 'filter') {
    return (
      <svg {...s}>
        <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" {...strokeIc} />
      </svg>
    );
  }
  if (variant === 'list') {
    return (
      <svg {...s}>
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...strokeIc} />
      </svg>
    );
  }
  if (variant === 'import') {
    return (
      <svg {...s}>
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" {...strokeIc} />
      </svg>
    );
  }
  return null;
}

const ic = {
  stroke: 'currentColor',
  fill: 'none',
  strokeWidth: 1.65,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

/** Icons for left stepper (render inside gradient tile; use currentColor = white). */
export function WizardStepperGlyph({ id }) {
  const s = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  switch (id) {
    case 'info':
      return (
        <svg {...s}>
          <path
            d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8"
            {...ic}
          />
        </svg>
      );
    case 'audience':
      return (
        <svg {...s}>
          <path
            d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
            {...ic}
          />
        </svg>
      );
    case 'channel':
      return (
        <svg {...s}>
          <path
            d="M3 11v3a1 1 0 001 1h2l4 4V7L6 11H4a1 1 0 00-1 1zM18.5 8.5a2.5 2.5 0 012.5 2.5v3a2.5 2.5 0 01-2.5 2.5M15 9v6"
            {...ic}
          />
        </svg>
      );
    case 'review':
      return (
        <svg {...s}>
          <path
            d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2l.5-.5"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"
            stroke="currentColor"
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

/** Large channel picker glyphs (inside card gradient wells). */
export function ChannelPickerGlyph({ channel }) {
  const s = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  switch (channel) {
    case 'phone':
      return (
        <svg {...s}>
          <path
            d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12.86.3 1.71.6 2.54a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.83.3 1.68.48 2.54.6A2 2 0 0122 16.92z"
            {...ic}
          />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg {...s}>
          <path
            d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8.5z"
            {...ic}
          />
          <path d="M9.5 9.5h.01M12.5 9.5h.01M15.5 14.5a4 4 0 01-4 2" {...ic} />
        </svg>
      );
    case 'email':
      return (
        <svg {...s}>
          <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" {...ic} />
          <path d="M22 7l-10 6L2 7" {...ic} />
        </svg>
      );
    case 'sms':
      return (
        <svg {...s}>
          <rect x="5" y="2" width="14" height="20" rx="2" {...ic} />
          <path d="M12 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
