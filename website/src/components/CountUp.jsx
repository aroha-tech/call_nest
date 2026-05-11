import { useEffect, useRef, useState } from 'react';
import { useInView } from '../hooks/useInView';

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

/**
 * Counts from `start` to `end` when scrolled into view (once), or on mount if `playOnMount`.
 * Respects prefers-reduced-motion.
 */
export function CountUp({
  end,
  start = 0,
  duration = 1.45,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  /** Hero / above-the-fold: animate shortly after mount (no IntersectionObserver). */
  playOnMount = false,
  /** Group digits for INR-style amounts (e.g. 1,499). Only when decimals === 0. */
  formatIndian = false,
}) {
  const [ref, inView] = useInView({ once: true, rootMargin: '-8% 0px' });
  const [mountReady, setMountReady] = useState(false);
  const [display, setDisplay] = useState(start);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!playOnMount) return undefined;
    const id = window.setTimeout(() => setMountReady(true), 280);
    return () => window.clearTimeout(id);
  }, [playOnMount]);

  const shouldRun = playOnMount ? mountReady : inView;

  useEffect(() => {
    if (!shouldRun) return undefined;
    if (reducedRef.current) {
      setDisplay(end);
      return undefined;
    }

    const t0 = performance.now();
    let raf = 0;

    const tick = (now) => {
      const elapsed = (now - t0) / 1000;
      const p = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(p);
      const v = start + (end - start) * eased;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shouldRun, end, start, duration]);

  const n = Math.round(display);
  let formatted;
  if (decimals > 0) {
    formatted = display.toFixed(decimals);
  } else if (formatIndian) {
    formatted = new Intl.NumberFormat('en-IN').format(n);
  } else {
    formatted = String(n);
  }

  return (
    <span ref={ref} className={`tabular-nums ${className}`.trim()}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
