import React from 'react';

/** Shared outline icons for dialer flows (setup, preflight, workspace). */
export function DialerIcon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
  };
  const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

  if (name === 'users') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
        <circle {...stroke} cx="9" cy="7" r="3" />
        <path {...stroke} d="M22 19v-1a3 3 0 0 0-2-2.83M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (name === 'user') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle {...stroke} cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (name === 'flag') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M4 22V4" />
        <path {...stroke} d="M4 5h12l-2 4 2 4H4" />
      </svg>
    );
  }
  if (name === 'fileText') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path {...stroke} d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    );
  }
  if (name === 'shield') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  if (name === 'phone') {
    return (
      <svg {...common} aria-hidden="true">
        <path
          {...stroke}
          d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
        />
      </svg>
    );
  }
  if (name === 'link') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M10 13a5 5 0 0 0 7.54.54l2.92-2.92a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path {...stroke} d="M14 11a5 5 0 0 0-7.54-.54l-2.92 2.92a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  }
  if (name === 'check') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (name === 'x') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M18 6L6 18M6 6l12 12" />
      </svg>
    );
  }
  if (name === 'clock') {
    return (
      <svg {...common} aria-hidden="true">
        <circle {...stroke} cx="12" cy="12" r="9" />
        <path {...stroke} d="M12 7v5l3 2" />
      </svg>
    );
  }
  if (name === 'info') {
    return (
      <svg {...common} aria-hidden="true">
        <circle {...stroke} cx="12" cy="12" r="10" />
        <path {...stroke} d="M12 16v-5M12 8h.01" />
      </svg>
    );
  }
  if (name === 'play') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M8 5l11 7-11 7V5z" />
      </svg>
    );
  }
  return null;
}

export function outcomeIconName(nextAction) {
  const a = String(nextAction || '').toLowerCase();
  if (a.includes('next_number')) return 'phone';
  if (a.includes('next_contact')) return 'user';
  if (a.includes('fail') || a.includes('reject')) return 'x';
  return 'check';
}
