import { useState, useEffect } from 'react';

/**
 * After the first time `loading` becomes false, further loads should use an in-table overlay
 * instead of replacing the whole page (search, filters, pagination).
 */
export function useTableLoadingState(loading) {
  const [hasCompletedInitialFetch, setHasCompletedInitialFetch] = useState(false);
  useEffect(() => {
    if (!loading) setHasCompletedInitialFetch(true);
  }, [loading]);
  return {
    hasCompletedInitialFetch,
    showTableRegionOverlay: loading && hasCompletedInitialFetch,
    showFirstLoadSpinner: !hasCompletedInitialFetch && loading,
  };
}
