/** Small inline SVGs for marketing / hero mock (no extra deps). */

export function IconSearch({ className = '', size = 16 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.2-3.2" />
    </svg>
  );
}

export function IconPlus({ className = '', size = 18 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconDotsHorizontal({ className = '', size = 18 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

/** Four-point star — SaaS CTA accent (matches common “sparkle” buttons) */
export function IconSparkleCta({ className = '', size = 18 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 1l1.8 6.2L20 9l-5.2 3.8L17 19l-5-3.1-5 3.1 2.2-6.2L4 9l6.2-1.8L12 1z" />
    </svg>
  );
}

/** Pair of small sparkles for hero CTA (Groilot-style, one SVG — no overlap/clipping) */
export function IconHeroCtaSparkles({ className = '' }) {
  return (
    <svg
      className={className}
      width={40}
      height={18}
      viewBox="0 0 40 18"
      fill="currentColor"
      aria-hidden
    >
      <path d="M9.2 1.2l1.15 3.65 3.55 1.75-3.55 1.75-1.15 3.65-1.15-3.65-3.55-1.75 3.55-1.75 1.15-3.65z" />
      <path d="M30.5 3.8l0.95 3.05 3.1 1.45-3.1 1.45-0.95 3.05-0.95-3.05-3.1-1.45 3.1-1.45 0.95-3.05z" />
    </svg>
  );
}
