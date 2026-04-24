import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationAPI } from '../../services/notificationAPI';

/**
 * Paginated notification list with append-on-scroll semantics (page/limit from API).
 */
export function useNotificationList({ limit = 20, moduleKey = '', status = '' } = {}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageRef = useRef(1);
  const inFlightRef = useRef(false);
  const listSnapshotRef = useRef({ len: 0, total: 0 });
  listSnapshotRef.current = { len: items.length, total };

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    pageRef.current = 1;
    inFlightRef.current = false;
    try {
      const res = await notificationAPI.list({
        page: 1,
        limit,
        module_key: moduleKey || undefined,
        status: status || undefined,
      });
      setItems(res?.data?.data || []);
      setTotal(Number(res?.data?.total || 0));
    } finally {
      setLoading(false);
    }
  }, [limit, moduleKey, status]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (loading || inFlightRef.current) return;
    const { len, total: t } = listSnapshotRef.current;
    if (len >= t) return;
    inFlightRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const res = await notificationAPI.list({
        page: nextPage,
        limit,
        module_key: moduleKey || undefined,
        status: status || undefined,
      });
      const raw = res?.data?.data || [];
      pageRef.current = nextPage;
      setItems((prev) => {
        const seen = new Set(prev.map((x) => Number(x.id)));
        const add = raw.filter((x) => !seen.has(Number(x.id)));
        return [...prev, ...add];
      });
    } finally {
      inFlightRef.current = false;
      setLoadingMore(false);
    }
  }, [loading, limit, moduleKey, status]);

  const hasMore = items.length < total;

  return {
    items,
    setItems,
    total,
    setTotal,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload: loadFirstPage,
  };
}
