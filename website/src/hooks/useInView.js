import { useEffect, useRef, useState } from 'react';

/**
 * @param {{ once?: boolean; rootMargin?: string; threshold?: number }} options
 */
export function useInView(options = {}) {
  const { once = true, rootMargin = '-48px 0px', threshold = 0.06 } = options;
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        setInView(true);
        if (once) observer.disconnect();
      },
      { rootMargin, threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);

  return [ref, inView];
}
