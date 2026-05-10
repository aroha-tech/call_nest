import React from 'react';

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
            d="M12 2.5c1.5 3 4.5 6.5 4.5 10a4.5 4.5 0 11-9 0c0-3.5 3-7 4.5-10zM12 12.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"
            {...ic}
          />
          <path d="M12 22v-4M9 20h6" {...ic} />
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
