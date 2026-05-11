import { useEffect, useState } from 'react';
import { useInView } from '../hooks/useInView';

/**
 * Horizontal odometer-style digits (0–9 strip slides into place).
 * `suffix` renders after digits (e.g. "×", "%", "+ hrs").
 */
export function RollingNumber({
  end,
  prefix = '',
  suffix = '',
  className = '',
  playOnMount = false,
  duration = 1,
  stagger = 0.07,
}) {
  const [ref, inView] = useInView({ once: true, rootMargin: '-10% 0px' });
  const [mountReady, setMountReady] = useState(false);

  useEffect(() => {
    if (!playOnMount) return undefined;
    const t = window.setTimeout(() => setMountReady(true), 200);
    return () => clearTimeout(t);
  }, [playOnMount]);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const run = playOnMount ? mountReady : inView;
  const n = Math.max(0, Math.floor(Number(end) || 0));
  const digits = String(n).split('').map((c) => parseInt(c, 10));

  const label = `${prefix}${n}${suffix}`.replace(/\s+/g, ' ').trim();

  return (
    <span ref={ref} className={`rolling-number ${className}`.trim()} aria-label={label}>
      {prefix ? <span className="rolling-number__prefix">{prefix}</span> : null}
      <span className="rolling-number__digits" aria-hidden="true">
        {digits.map((d, i) => (
          <RollingDigit
            key={`${digits.length}-${i}`}
            target={d}
            run={run}
            reduced={reduced}
            duration={duration}
            delay={reduced ? 0 : i * stagger}
          />
        ))}
      </span>
      {suffix ? (
        <span className="rolling-number__suffix" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

function RollingDigit({ target, run, reduced, duration, delay }) {
  const [on, setOn] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setOn(true);
      return undefined;
    }
    if (!run) return undefined;
    const t = window.setTimeout(() => setOn(true), Math.round(delay * 1000));
    return () => clearTimeout(t);
  }, [run, reduced, delay]);

  const t = Math.min(9, Math.max(0, target));

  return (
    <span className="roll-digit" aria-hidden="true">
      <span className="roll-digit__mask">
        <span
          className={'roll-digit__track' + (on ? ' roll-digit__track--on' : '')}
          style={{
            '--roll-to': t,
            '--roll-dur': `${duration}s`,
          }}
        >
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <span key={n} className="roll-digit__cell">
              {n}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
