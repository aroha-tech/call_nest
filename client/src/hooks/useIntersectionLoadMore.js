import { useEffect, useRef } from 'react';

/**
 * Calls onLoadMore when target becomes visible inside root (scroll container), or the viewport when useViewport is true.
 */
export function useIntersectionLoadMore({ rootRef, targetRef, enabled, onLoadMore, useViewport = false }) {
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;

  useEffect(() => {
    if (!enabled) return;
    const root = useViewport ? null : rootRef?.current ?? null;
    const target = targetRef?.current;
    if (!target) return;
    if (!useViewport && !root) return;

    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMoreRef.current?.();
      },
      { root, rootMargin: '64px', threshold: 0 }
    );
    ob.observe(target);
    return () => ob.disconnect();
  }, [enabled, rootRef, targetRef]);
}
