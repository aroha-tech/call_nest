import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { contactsAPI } from '../services/contactsAPI';
import { ContactActivityPanel } from './ContactActivityPanel';
import { CallHistoryAttemptDetailModal } from './CallHistoryAttemptDetailModal';
import listStyles from '../components/admin/adminDataList.module.scss';

const TIMELINE_PAGE_SIZE = 10;

function safeDateTime(v) {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

/**
 * CRM activity only — full timeline for one lead or contact (not call history / dial sessions).
 * Routes: /leads/:id/activity, /contacts/:id/activity
 *
 * Loads overview first (fast); timeline is loaded on demand in pages of TIMELINE_PAGE_SIZE with infinite scroll.
 */
export function ContactLeadActivityPage({ recordType }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const [timelineItems, setTimelineItems] = useState([]);
  const [timelineCursor, setTimelineCursor] = useState(null);
  const [timelineMeta, setTimelineMeta] = useState({
    loaded: false,
    loading: false,
    loadingMore: false,
    hasMore: false,
    total: null,
  });
  const [timelineError, setTimelineError] = useState('');
  const [callsExtras, setCallsExtras] = useState(null);

  const [attemptDetailRow, setAttemptDetailRow] = useState(null);
  const appendInFlightRef = useRef(false);

  const recordPath = recordType === 'lead' ? `/leads/${id}` : `/contacts/${id}`;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoadingSummary(true);
    setSummaryError('');
    setSummary(null);
    setTimelineItems([]);
    setTimelineCursor(null);
    setCallsExtras(null);
    setTimelineError('');
    setTimelineMeta({
      loaded: false,
      loading: false,
      loadingMore: false,
      hasMore: false,
      total: null,
    });
    appendInFlightRef.current = false;

    contactsAPI
      .getActivity(id, { mode: 'summary' })
      .then((res) => {
        if (!cancelled) setSummary(res?.data?.data ?? null);
      })
      .catch((e) => {
        if (!cancelled) {
          setSummary(null);
          setSummaryError(e?.response?.data?.error || e?.message || 'Failed to load activity');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSummary(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const fetchTimelinePage = useCallback(
    async (cursorForRequest, { append }) => {
      if (!id) return;
      if (append) {
        if (appendInFlightRef.current) return;
        appendInFlightRef.current = true;
      }
      setTimelineError('');
      if (append) {
        setTimelineMeta((m) => ({ ...m, loadingMore: true }));
      } else {
        setTimelineMeta((m) => ({ ...m, loading: true }));
      }
      try {
        const res = await contactsAPI.getActivity(id, {
          mode: 'timeline',
          timeline_limit: TIMELINE_PAGE_SIZE,
          timeline_cursor: cursorForRequest,
        });
        const d = res?.data?.data;
        if (!d) return;
        const chunk = d.timeline || [];
        setTimelineItems((prev) => (append ? [...prev, ...chunk] : chunk));
        setTimelineCursor(d.timelineNextCursor ?? null);
        setTimelineMeta({
          loaded: true,
          loading: false,
          loadingMore: false,
          hasMore: Boolean(d.timelineHasMore),
          total: null,
        });
        setCallsExtras({
          calls: d.calls,
          callsPagination: d.callsPagination,
          callsTruncated: d.callsTruncated,
        });
      } catch (e) {
        setTimelineError(e?.response?.data?.error || e?.message || 'Failed to load timeline');
        setTimelineMeta((m) => ({
          ...m,
          loading: false,
          loadingMore: false,
        }));
      } finally {
        if (append) appendInFlightRef.current = false;
      }
    },
    [id]
  );

  const handleLoadTimeline = useCallback(() => {
    fetchTimelinePage(null, { append: false });
  }, [fetchTimelinePage]);

  const handleLoadMoreTimeline = useCallback(() => {
    if (!timelineMeta.hasMore || timelineMeta.loadingMore || timelineMeta.loading || !timelineCursor) return;
    fetchTimelinePage(timelineCursor, { append: true });
  }, [
    fetchTimelinePage,
    timelineMeta.hasMore,
    timelineMeta.loadingMore,
    timelineMeta.loading,
    timelineCursor,
  ]);

  const bundle = useMemo(() => {
    if (!summary) return null;
    return {
      ...summary,
      ...(callsExtras || {}),
      timeline: timelineItems,
    };
  }, [summary, timelineItems, callsExtras]);

  const panelError = summaryError || null;

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Activity"
        description="Overview loads first. Open the timeline when you need the full story — it loads in pages as you scroll."
        actions={
          <Button type="button" variant="secondary" size="sm" onClick={() => navigate(recordPath)}>
            Back to record
          </Button>
        }
      />
      <ContactActivityPanel
        bundle={bundle}
        loading={loadingSummary}
        error={panelError}
        onViewCallAttempt={(row) => setAttemptDetailRow(row)}
        timelineMeta={{
          ...timelineMeta,
          pageSize: TIMELINE_PAGE_SIZE,
          error: timelineError,
          nextCursor: timelineCursor,
        }}
        onLoadTimeline={handleLoadTimeline}
        onLoadMoreTimeline={handleLoadMoreTimeline}
      />
      <CallHistoryAttemptDetailModal
        isOpen={Boolean(attemptDetailRow)}
        onClose={() => setAttemptDetailRow(null)}
        row={attemptDetailRow}
        formatWhen={safeDateTime}
        onFilterByParty={(cid) => {
          setAttemptDetailRow(null);
          navigate(`/calls/history?contact_id=${encodeURIComponent(cid)}`);
        }}
      />
    </div>
  );
}
