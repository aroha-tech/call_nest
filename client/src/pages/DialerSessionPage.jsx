import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectTenant, selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { callsAPI } from '../services/callsAPI';
import { dialerSessionsAPI } from '../services/dialerSessionsAPI';
import { contactsAPI } from '../services/contactsAPI';
import { templateVariablesAPI } from '../services/templateVariablesAPI';
import { extractTemplateKeys, renderScriptHtml } from '../utils/callScriptHtml';
import { useToast } from '../context/ToastContext';
import styles from './DialerSessionPage.module.scss';

/** Display-only: maps `contact_phones.label` ENUM (and primary) to a short title. */
function formatPhoneLabel(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s || s === 'primary') return 'Primary';
  const map = {
    mobile: 'Mobile',
    work: 'Work',
    home: 'Home',
    whatsapp: 'WhatsApp',
    other: 'Other',
  };
  return map[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
}

/** Matches `contact_phones.label` ENUM — one row per type per contact. */
const CONTACT_PHONE_LABEL_ENUM = ['mobile', 'home', 'work', 'whatsapp', 'other'];

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

function formatTimerHms(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '00:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function Icon({ name }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' };
  const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'pause') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M8 6v12M16 6v12" />
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
  if (name === 'micOff') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M12 1a3 3 0 0 1 3 3v6a3 3 0 0 1-5.12 2.12" />
        <path {...stroke} d="M19 11a7 7 0 0 1-12 4" />
        <path {...stroke} d="M12 18v4" />
        <path {...stroke} d="M8 22h8" />
        <path {...stroke} d="M3 3l18 18" />
      </svg>

    );
  }
  if (name === 'stop') {
    return (
      <svg {...common} aria-hidden="true">  
        <path {...stroke} d="M7 7h10v10H7z" />
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
  if (name === 'plus') {
    return (
      <svg {...common} aria-hidden="true">
        <path {...stroke} d="M12 5v14M5 12h14" />
      </svg>
    );
  }
  return null;
}

function normItemState(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function resolveCurrentItem(items = []) {
  return items.find((i) => i.state === 'calling') || items.find((i) => i.state === 'queued') || null;
}

function coerceAttemptId(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Dispositions are UUID strings (CHAR(36)); never use Number() — Number(uuid) is NaN. */
function coerceDispositionId(v) {
  const s = String(v ?? '').trim();
  if (!s || s.length > 36) return null;
  return s;
}

function resolveLastAttemptId(items = []) {
  const active = items.find((i) => i.state === 'calling' && coerceAttemptId(i.last_attempt_id));
  const activeId = coerceAttemptId(active?.last_attempt_id);
  if (activeId) return activeId;
  const last = [...items].reverse().find((i) => coerceAttemptId(i.last_attempt_id));
  return coerceAttemptId(last?.last_attempt_id);
}

export function DialerSessionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAppSelector(selectUser);
  const tenant = useAppSelector(selectTenant);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [session, setSession] = useState(null);
  const [contact, setContact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [addPhoneOpen, setAddPhoneOpen] = useState(false);
  const [addPhoneLabel, setAddPhoneLabel] = useState('');
  const [addPhoneValue, setAddPhoneValue] = useState('');
  /** Bumps when POST /next applies session — stale in-flight GET /session must not overwrite. */
  const loadEpochRef = useRef(0);
  const callNextInFlightRef = useRef(false);
  /** If session payload ever lacks last_attempt_id on a calling row, still allow dispo until refetch. */
  const pendingAttemptFromNextRef = useRef(null);
  const [templateSample, setTemplateSample] = useState(null);
  const [activeTemplateKeys, setActiveTemplateKeys] = useState(null);
  const [tick, setTick] = useState(0);
  const [uiTimer, setUiTimer] = useState(() => {
    if (!id) return { startedAtMs: null, pausedAtMs: null, pausedTotalMs: 0 };
    try {
      const raw = sessionStorage.getItem(`dialerTimer:${id}`);
      return raw ? JSON.parse(raw) : { startedAtMs: null, pausedAtMs: null, pausedTotalMs: 0 };
    } catch {
      return { startedAtMs: null, pausedAtMs: null, pausedTotalMs: 0 };
    }
  });

  const requestedStep = String(searchParams.get('step') || '').toLowerCase();
  const [view, setView] = useState(requestedStep === 'preflight' ? 'preflight' : 'active');

  useEffect(() => {
    if (requestedStep === 'preflight') setView('preflight');
  }, [requestedStep]);

  useEffect(() => {
    if (!id) return;
    try {
      sessionStorage.setItem(`dialerTimer:${id}`, JSON.stringify(uiTimer));
    } catch {
      // ignore
    }
  }, [id, uiTimer]);

  const items = useMemo(
    () =>
      (session?.items || []).map((row) => ({
        ...row,
        state: normItemState(row.state),
      })),
    [session?.items]
  );
  const currentItem = useMemo(() => resolveCurrentItem(items), [items]);
  const lastAttemptId = useMemo(() => {
    const fromItems = resolveLastAttemptId(items);
    if (fromItems) {
      pendingAttemptFromNextRef.current = null;
      return fromItems;
    }
    const hasCalling = items.some((i) => i.state === 'calling');
    if (!hasCalling) {
      pendingAttemptFromNextRef.current = null;
      return null;
    }
    return pendingAttemptFromNextRef.current || null;
  }, [items]);
  const queuedCount = useMemo(() => items.filter((i) => i.state === 'queued').length, [items]);
  const calledCount = useMemo(() => items.filter((i) => i.state === 'called').length, [items]);
  const failedCount = useMemo(() => items.filter((i) => i.state === 'failed').length, [items]);
  const callingCount = useMemo(() => items.filter((i) => i.state === 'calling').length, [items]);
  const connectedCount = useMemo(
    () => items.filter((i) => i.state === 'called' && Number(i.attempt_is_connected) === 1).length,
    [items]
  );

  const totalCount = items.length;
  const completedCount = calledCount + failedCount;
  const progressCount = completedCount + callingCount;
  const progressPct = totalCount > 0 ? Math.min(100, Math.round((progressCount / totalCount) * 100)) : 0;

  const currentContactNumber = useMemo(() => {
    if (!currentItem) return 0;
    const oi = Number(currentItem.order_index);
    if (Number.isFinite(oi) && oi >= 0) return oi + 1;
    const idx = items.findIndex((it) => it.id === currentItem.id);
    return idx >= 0 ? idx + 1 : 0;
  }, [items, currentItem]);

  const activeDialPhone = useMemo(() => {
    if (!currentItem) return '';
    if (currentItem.state === 'calling') {
      return (
        currentItem.attempt_phone ||
        currentItem.selected_phone ||
        currentItem.primary_phone ||
        ''
      );
    }
    return currentItem.selected_phone || currentItem.primary_phone || '';
  }, [currentItem]);

  const phonesList = useMemo(() => {
    if (Array.isArray(contact?.phones) && contact.phones.length > 0) {
      return [...contact.phones].sort((a, b) => {
        const pa = Number(a.is_primary) === 1 ? 1 : 0;
        const pb = Number(b.is_primary) === 1 ? 1 : 0;
        if (pb !== pa) return pb - pa;
        return Number(a.id) - Number(b.id);
      });
    }
    if (currentItem?.primary_phone) {
      return [
        {
          id: 'synthetic-primary',
          phone: currentItem.primary_phone,
          label: 'primary',
          is_primary: 1,
        },
      ];
    }
    return [];
  }, [contact?.phones, currentItem?.primary_phone]);

  const usedPhoneLabels = useMemo(() => {
    const phones = contact?.phones;
    if (!Array.isArray(phones)) return new Set();
    const s = new Set();
    for (const p of phones) {
      const k = String(p.label || '').trim().toLowerCase();
      if (k) s.add(k);
    }
    return s;
  }, [contact?.phones]);

  const missingPhoneLabels = useMemo(
    () => CONTACT_PHONE_LABEL_ENUM.filter((l) => !usedPhoneLabels.has(l)),
    [usedPhoneLabels]
  );

  const canAddPhoneNumber = Boolean(currentItem?.contact_id) && missingPhoneLabels.length > 0;

  /** Merge full contact (API) with queue row so name/phone always show even if getById fails. */
  const leadContact = useMemo(() => {
    const row = currentItem;
    const c = contact;
    if (!row && !c) return null;
    const displayName =
      c?.display_name ||
      row?.display_name ||
      c?.first_name ||
      c?.email ||
      (row?.contact_id ? `Contact #${row.contact_id}` : '') ||
      '';
    const firstName =
      c?.first_name ||
      (displayName ? String(displayName).trim().split(/\s+/)[0] : '') ||
      undefined;
    return {
      ...(c || {}),
      display_name: displayName,
      first_name: firstName,
      last_name: c?.last_name,
      primary_phone: activeDialPhone || c?.primary_phone || row?.primary_phone || '',
      email: c?.email,
      company: c?.company,
      job_title: c?.job_title,
      city: c?.city,
      notes: c?.notes,
      id: c?.id ?? row?.contact_id,
    };
  }, [contact, currentItem, activeDialPhone]);

  const contactInitial = useMemo(() => {
    const raw = leadContact?.display_name || leadContact?.email || '';
    const c = String(raw).trim().charAt(0);
    return c ? c.toUpperCase() : '?';
  }, [leadContact]);

  const contactDetailPending = Boolean(!contact && currentItem?.contact_id);

  const leadSubtitle = useMemo(() => {
    const parts = [leadContact?.company, leadContact?.job_title].filter(Boolean);
    return parts.length ? parts.join(' · ') : '';
  }, [leadContact]);

  const sessionEnded = session?.status === 'completed' || session?.status === 'cancelled';

  const sessionDisplayNo = useMemo(() => {
    const n = Number(session?.user_session_no);
    if (Number.isFinite(n) && n >= 1) return n;
    return null;
  }, [session?.user_session_no]);

  const { showToast } = useToast();

  /** Live dial workspace: no inline alert bar — surface messages as fixed toasts (ToastContext). */
  useEffect(() => {
    if (!error || !session || sessionEnded) return;
    const m = String(error).toLowerCase();
    const variant = m.includes('paused') || m.includes('not active') ? 'warning' : 'error';
    showToast(error, variant);
    setError('');
  }, [error, session, sessionEnded, showToast]);

  const errorAlertVariant = useMemo(() => {
    const m = String(error || '').toLowerCase();
    if (m.includes('paused') || m.includes('not active')) return 'warning';
    return 'error';
  }, [error]);

  const showErrorOutside = Boolean(error && (!session || sessionEnded));

  useEffect(() => {
    if (!uiTimer?.startedAtMs) return;
    if (uiTimer?.pausedAtMs) return;
    if (session?.ended_at) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [uiTimer?.startedAtMs, uiTimer?.pausedAtMs, session?.ended_at]);

  const durationMs = useMemo(() => {
    const startedAtMs = Number(uiTimer?.startedAtMs || 0);
    if (!startedAtMs) return 0;
    const endMs = session?.ended_at ? new Date(session.ended_at).getTime() : Date.now();
    const pausedTotalMs = Number(uiTimer?.pausedTotalMs || 0);
    const extraPausedMs = uiTimer?.pausedAtMs ? Math.max(0, Date.now() - Number(uiTimer.pausedAtMs)) : 0;
    return Math.max(0, endMs - startedAtMs - pausedTotalMs - extraPausedMs);
  }, [uiTimer?.startedAtMs, uiTimer?.pausedTotalMs, uiTimer?.pausedAtMs, session?.ended_at, tick]);

  const load = useCallback(async () => {
    if (!id) return;
    const rid = ++loadEpochRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.getById(id);
      if (rid !== loadEpochRef.current) return;
      const s = res?.data?.data ?? null;
      setSession(s);
    } catch (e) {
      if (rid !== loadEpochRef.current) return;
      setError(e?.response?.data?.error || e?.message || 'Failed to load session');
      setSession(null);
    } finally {
      if (rid === loadEpochRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setAddPhoneOpen(false);
    setAddPhoneValue('');
  }, [currentItem?.contact_id]);

  useEffect(() => {
    if (!addPhoneOpen || missingPhoneLabels.length === 0) return;
    setAddPhoneLabel((prev) => (missingPhoneLabels.includes(prev) ? prev : missingPhoneLabels[0]));
  }, [addPhoneOpen, missingPhoneLabels]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await templateVariablesAPI.getPreviewSample();
        if (!cancelled) setTemplateSample(res?.data ?? {});
      } catch {
        if (!cancelled) setTemplateSample({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await templateVariablesAPI.getGrouped();
        const grouped = res?.data ?? {};
        const keys = [];
        Object.keys(grouped).forEach((mod) => {
          (grouped[mod] || []).forEach((v) => {
            if (v?.key) keys.push(String(v.key));
          });
        });
        if (!cancelled) setActiveTemplateKeys(new Set(keys));
      } catch {
        if (!cancelled) setActiveTemplateKeys(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const missingTemplateKeys = useMemo(() => {
    const scriptText = session?.script?.script_body || '';
    if (!scriptText) return [];
    if (!activeTemplateKeys) return [];
    const used = extractTemplateKeys(scriptText);
    return used.filter((k) => !activeTemplateKeys.has(k));
  }, [session?.script?.script_body, activeTemplateKeys]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cid = currentItem?.contact_id;
        if (!cid) {
          if (!cancelled) setContact(null);
          return;
        }
        const res = await contactsAPI.getById(cid);
        if (!cancelled) setContact(res?.data?.data ?? null);
      } catch {
        if (!cancelled) setContact(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentItem?.contact_id]);

  async function callNext() {
    if (!id || callNextInFlightRef.current) return;
    callNextInFlightRef.current = true;
    setUiTimer((prev) => {
      if (prev?.startedAtMs) return prev;
      return { startedAtMs: Date.now(), pausedAtMs: null, pausedTotalMs: 0 };
    });
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.next(id);
      const payload = res?.data?.data;
      let nextSession =
        payload?.session && Array.isArray(payload.session.items) ? payload.session : null;
      if (!nextSession && payload && Array.isArray(payload.items)) {
        nextSession = payload;
      }
      if (nextSession) {
        loadEpochRef.current += 1;
        const aid = coerceAttemptId(payload?.attempt?.id);
        if (aid) pendingAttemptFromNextRef.current = aid;
        setSession(nextSession);
      } else {
        await load();
      }
      if (view !== 'active') setView('active');
      if (requestedStep) setSearchParams({}, { replace: true });
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to call next');
    } finally {
      setBusy(false);
      callNextInFlightRef.current = false;
    }
  }

  async function cancelSession() {
    if (!id) return;
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.cancel(id);
      setSession(res?.data?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to cancel session');
    } finally {
      setBusy(false);
    }
  }

  async function pauseSession() {
    if (!id) return;
    setUiTimer((prev) => {
      if (!prev?.startedAtMs) return prev;
      if (prev?.pausedAtMs) return prev;
      return { ...prev, pausedAtMs: Date.now() };
    });
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.pause(id);
      setSession(res?.data?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to pause session');
    } finally {
      setBusy(false);
    }
  }

  async function resumeSession() {
    if (!id) return;
    setUiTimer((prev) => {
      if (!prev?.startedAtMs) return prev;
      if (!prev?.pausedAtMs) return prev;
      const add = Math.max(0, Date.now() - Number(prev.pausedAtMs));
      return { ...prev, pausedAtMs: null, pausedTotalMs: Number(prev.pausedTotalMs || 0) + add };
    });
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.resume(id);
      setSession(res?.data?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to resume session');
    } finally {
      setBusy(false);
    }
  }

  async function submitAddPhone() {
    const cid = currentItem?.contact_id;
    if (!cid || !addPhoneLabel) return;
    const raw = String(addPhoneValue || '').trim();
    if (!raw) {
      setError('Enter a phone number');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await contactsAPI.appendPhone(cid, { phone: raw, label: addPhoneLabel });
      const updated = res?.data?.data ?? null;
      if (updated) setContact(updated);
      const newPhone = updated?.phones?.find(
        (p) => String(p.label || '').trim().toLowerCase() === String(addPhoneLabel).toLowerCase()
      );
      if (
        id &&
        currentItem?.id &&
        currentItem.state === 'queued' &&
        newPhone?.id != null &&
        Number(newPhone.id) > 0
      ) {
        const sres = await dialerSessionsAPI.updateItem(id, currentItem.id, {
          contact_phone_id: Number(newPhone.id),
        });
        const s = sres?.data?.data;
        if (s) {
          loadEpochRef.current += 1;
          setSession(s);
        }
      }
      setAddPhoneOpen(false);
      setAddPhoneValue('');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to add number');
    } finally {
      setBusy(false);
    }
  }

  async function applyTargetPhoneOnItem(contactPhoneId) {
    if (!id || !currentItem?.id) return;
    if (currentItem.state !== 'queued') return;
    setBusy(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.updateItem(id, currentItem.id, {
        contact_phone_id: contactPhoneId,
      });
      const s = res?.data?.data;
      if (s) {
        loadEpochRef.current += 1;
        setSession(s);
      } else {
        await load();
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to update target number');
    } finally {
      setBusy(false);
    }
  }

  function isDialerPhoneRowSelected(p) {
    const t = currentItem?.contact_phone_id;
    if (t != null && Number(t) > 0) return Number(p.id) === Number(t);
    if (p.id === 'synthetic-primary') return true;
    if (Number(p.is_primary) === 1) return true;
    const anyPri = phonesList.some((x) => Number(x.is_primary) === 1);
    if (!anyPri && phonesList[0] && phonesList[0].id === p.id) return true;
    return false;
  }

  function isPhoneHighlightedForDialer(p) {
    if (!currentItem) return false;
    if (currentItem.state === 'calling') {
      const aid = currentItem.attempt_contact_phone_id;
      if (aid != null && String(aid) !== '' && Number(aid) > 0) {
        if (p.id === 'synthetic-primary') return false;
        return Number(p.id) === Number(aid);
      }
      const norm = (s) => String(s || '').replace(/\s/g, '');
      return norm(p.phone) === norm(activeDialPhone);
    }
    return isDialerPhoneRowSelected(p);
  }

  async function setDisposition(dispositionId, nextAction) {
    const callingRow = items.find((i) => i.state === 'calling');
    const attemptId = coerceAttemptId(callingRow?.last_attempt_id) || lastAttemptId;
    if (!attemptId) {
      setError('No active call attempt for this lead. Use Call next or refresh the page.');
      return;
    }
    const dispId = coerceDispositionId(dispositionId);
    if (!dispId) {
      setError('Invalid disposition.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await callsAPI.setDisposition(attemptId, { disposition_id: dispId });
      const body = res?.data ?? {};
      const na = String(nextAction || '').toLowerCase();

      if (body.session && Array.isArray(body.session.items)) {
        loadEpochRef.current += 1;
        pendingAttemptFromNextRef.current = coerceAttemptId(body.dialer?.attempt?.id);
        setSession(body.session);
        return;
      }

      await load();
      if (!na.includes('next_number')) {
        if (na.includes('next_contact') || (na.includes('next') && !na.includes('next_number'))) {
          await callNext();
        }
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to set disposition');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      {!session || sessionEnded ? (
        <PageHeader
          title="Dialer session"
          description={
            sessionDisplayNo != null ? `Dial session #${sessionDisplayNo}` : 'Dial session'
          }
          actions={
            <div className={styles.headerActions}>
              <Button variant="secondary" onClick={() => navigate('/dialer')}>
                Back to leads
              </Button>
              <Button variant="secondary" onClick={() => navigate('/calls/history')}>
                Call history
              </Button>
            </div>
          }
        />
      ) : null}

      {showErrorOutside ? <Alert variant={errorAlertVariant}>{error}</Alert> : null}

      {loading && !session ? (
        <div className={styles.loadingCenter}>
          <Spinner size="lg" />
        </div>
      ) : null}

      {session ? (
        <>
          {sessionEnded ? (
            <div className={styles.summaryWrap}>
              <div className={styles.summaryHero}>
                <div className={styles.summaryHeroText}>
                  <div className={styles.summaryEyebrow}>Dialer session</div>
                  <h2 className={styles.summaryHeadline}>
                    {sessionDisplayNo != null ? `Dial session #${sessionDisplayNo}` : 'Dial session'} ·{' '}
                    <span className={styles.summaryStatus}>{session.status}</span>
                  </h2>
                  <p className={styles.summarySub}>
                    Here is how this run finished. You can return to leads when you are ready.
                  </p>
                </div>
                <div className={styles.summaryHeroAside}>
                  <div className={styles.summaryDurationLabel}>Session time</div>
                  <div className={styles.summaryDurationValue}>{formatTimerHms(durationMs)}</div>
                </div>
              </div>
              <div className={styles.summaryGrid}>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Total contacts</div>
                  <div className={styles.summaryValue}>{totalCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Called</div>
                  <div className={styles.summaryValue}>{calledCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Connected</div>
                  <div className={styles.summaryValue}>{connectedCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Failed</div>
                  <div className={styles.summaryValue}>{failedCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Queued left</div>
                  <div className={styles.summaryValue}>{queuedCount}</div>
                </div>
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLabel}>Script</div>
                  <div className={styles.summaryValueSmall}>{session?.script?.script_name || '—'}</div>
                </div>
              </div>
              <div className={styles.summaryActions}>
                <Button onClick={() => navigate('/dialer')}>Done — back to leads</Button>
              </div>
            </div>
          ) : null}

          {view === 'preflight' && !sessionEnded ? (
            <div className={styles.preflightCard}>
              <div className={styles.preflightTitle}>Before you start</div>
              <div className={styles.preflightBody}>
                <div className={styles.preflightSection}>
                  <div className={styles.preflightHeading}>Session settings</div>
                  <div className={styles.preflightList}>
                    <div>
                      <span className={styles.preflightKey}>Dialing set</span>
                      <span className={styles.preflightVal}>{session?.dialing_set_id ? 'Selected' : '—'}</span>
                    </div>
                    <div>
                      <span className={styles.preflightKey}>Call script</span>
                      <span className={styles.preflightVal}>{session?.script?.script_name || '—'}</span>
                    </div>
                    <div>
                      <span className={styles.preflightKey}>Selected contacts</span>
                      <span className={styles.preflightVal}>{totalCount}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.preflightSection}>
                  <div className={styles.preflightHeading}>Instructions</div>
                  <ul className={styles.preflightBullets}>
                    <li>Review the script and the disposition buttons before starting.</li>
                    <li>Use Pause if you need to temporarily stop dialing.</li>
                    <li>After each call, set the disposition to keep your session accurate.</li>
                  </ul>
                </div>

                <div className={styles.preflightSection}>
                  <div className={styles.preflightHeading}>Legal & compliance</div>
                  <ul className={styles.preflightBullets}>
                    <li>Only call leads you are authorized to contact.</li>
                    <li>Respect local DND/consent rules and your company’s policy.</li>
                    <li>Do not store sensitive info in notes unless policy allows it.</li>
                  </ul>
                </div>

                <div className={styles.preflightActions}>
                  <Button
                    onClick={callNext}
                    disabled={busy || session.status === 'paused' || callingCount > 0}
                    title={
                      callingCount > 0
                        ? 'Finish the current call (set a disposition) before starting another dial.'
                        : undefined
                    }
                  >
                    {busy ? 'Working…' : 'Start session'}
                  </Button>
                  <Button variant="secondary" onClick={() => setView('active')} disabled={busy}>
                    Skip
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {sessionEnded ? null : (
          <div className={styles.dialerShell}>
            <header className={styles.dialerChromeBar}>
              <div className={styles.dialerChromeLeft}>
                <span className={styles.dialerChromeBadge}>Dial workspace</span>
                <span className={styles.dialerChromeSession}>
                  {sessionDisplayNo != null ? `Dial session #${sessionDisplayNo}` : 'Dial session'}
                </span>
                <span className={`${styles.statusPill} ${styles[`status_${session.status}`] || ''}`.trim()}>
                  {session.status || '—'}
                </span>
              </div>
              <div className={styles.dialerChromeRight}>
                <span className={styles.dialerChromeScriptLabel}>Script</span>
                <span className={styles.dialerChromeScriptName} title={session?.script?.script_name || ''}>
                  {session?.script?.script_name || '—'}
                </span>
              </div>
            </header>

            <div className={styles.metricsStrip} role="group" aria-label="Session metrics">
              <div className={styles.metricCell}>
                <div className={styles.metricLabel}>Session time</div>
                <div className={styles.metricValue}>{formatTimerHms(durationMs)}</div>
              </div>
              <div className={styles.metricCell}>
                <div className={styles.metricLabel}>Lead #</div>
                <div className={styles.metricValue}>
                  {totalCount > 0 ? (currentContactNumber ? `${currentContactNumber} / ${totalCount}` : `— / ${totalCount}`) : '—'}
                </div>
              </div>
              <div className={styles.metricCell}>
                <div className={styles.metricLabel}>Completed</div>
                <div className={styles.metricValue}>{completedCount}</div>
              </div>
              <div className={styles.metricCell}>
                <div className={styles.metricLabel}>In queue</div>
                <div className={styles.metricValue}>{queuedCount}</div>
              </div>
              <div className={styles.metricCell}>
                <div className={styles.metricLabel}>Dials</div>
                <div className={styles.metricValue}>{calledCount}</div>
              </div>
              <div className={styles.metricCell}>
                <div className={styles.metricLabel}>Connected</div>
                <div className={styles.metricValue}>{connectedCount}</div>
              </div>
              <div className={styles.metricCell}>
                <div className={styles.metricLabel}>Failed</div>
                <div className={styles.metricValue}>{failedCount}</div>
              </div>
            </div>

            <div className={styles.shellProgress}>
              <div className={styles.shellProgressText}>
                <span>
                  {totalCount > 0 ? (
                    <>
                      {completedCount} done
                      {callingCount ? ` · ${callingCount} live` : ''}
                      {queuedCount ? ` · ${queuedCount} waiting` : ''}
                    </>
                  ) : (
                    'No contacts in this session'
                  )}
                </span>
                <span className={styles.shellProgressPct}>
                  {totalCount > 0 ? `${progressCount} / ${totalCount} · ${progressPct}%` : '—'}
                </span>
              </div>
              <div
                className={styles.shellProgressBar}
                role="progressbar"
                aria-valuenow={progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className={styles.shellProgressFill} style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            <div
              className={`${styles.activeCallStrip} ${
                currentItem?.state === 'calling'
                  ? styles.activeCallStripLive
                  : currentItem?.state === 'queued'
                    ? styles.activeCallStripQueue
                    : styles.activeCallStripIdle
              }`}
            >
              <div className={styles.activeCallStripMain}>
                <div className={styles.activeCallStripLeft}>
                  <span className={styles.activeCallLeadBadge}>
                    {currentContactNumber ? `Lead ${currentContactNumber}` : 'Lead'}
                  </span>
                  {currentItem?.state === 'calling' ? (
                    <span className={styles.activeCallLiveDot} aria-hidden="true" />
                  ) : null}
                </div>
                <div className={styles.activeCallStripCenter}>
                  <div className={styles.activeCallName}>
                    {leadContact?.display_name || (totalCount === 0 ? 'No leads in session' : 'Select a lead from the queue')}
                  </div>
                  {leadSubtitle ? <div className={styles.activeCallSub}>{leadSubtitle}</div> : null}
                </div>
                <div className={styles.activeCallStripRight}>
                  <div className={styles.activeCallNumbersPanel}>
                    <div className={styles.activeCallNumbersTitle}>Numbers</div>
                    {phonesList.length === 0 ? (
                      <div className={styles.activeCallNumbersRow}>
                        <div className={styles.activeCallPhoneRow}>
                          <Icon name="phone" />
                          <span className={styles.activeCallPhone}>
                            {activeDialPhone || leadContact?.primary_phone || '—'}
                          </span>
                        </div>
                        {canAddPhoneNumber ? (
                          <div className={styles.activeCallAddPhoneWrap}>
                            <button
                              type="button"
                              className={styles.activeCallAddPhoneBtn}
                              disabled={busy}
                              title="Add a number (pick a free type: mobile, work, …)"
                              aria-expanded={addPhoneOpen}
                              aria-label="Add phone number"
                              onClick={() => setAddPhoneOpen((o) => !o)}
                            >
                              <Icon name="plus" />
                            </button>
                            {addPhoneOpen ? (
                              <div className={styles.activeCallAddPhonePop}>
                                <Select
                                  className={styles.activeCallAddPhoneSelect}
                                  label="Type"
                                  placeholder="Type"
                                  value={addPhoneLabel}
                                  onChange={(e) => setAddPhoneLabel(e.target.value)}
                                  options={missingPhoneLabels.map((l) => ({
                                    value: l,
                                    label: formatPhoneLabel(l),
                                  }))}
                                  disabled={busy}
                                />
                                <Input
                                  className={styles.activeCallAddPhoneInput}
                                  label="Number"
                                  value={addPhoneValue}
                                  onChange={(e) => setAddPhoneValue(e.target.value)}
                                  placeholder="+1…"
                                  disabled={busy}
                                  autoComplete="tel"
                                />
                                <div className={styles.activeCallAddPhoneActions}>
                                  <Button size="sm" variant="primary" disabled={busy} onClick={submitAddPhone}>
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={busy}
                                    onClick={() => {
                                      setAddPhoneOpen(false);
                                      setAddPhoneValue('');
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className={styles.activeCallNumbersRow}>
                        <ul className={styles.activeCallPhoneListHoriz}>
                          {phonesList.map((p, idx) => {
                            const sid = String(p.id ?? `${idx}-${p.phone}`);
                            const hi = isPhoneHighlightedForDialer(p);
                            const chipClass = `${styles.activeCallPhoneChip} ${hi ? styles.activeCallPhoneChipOn : ''}`;
                            const chipBody = (
                              <>
                                <Icon name="phone" />
                                <span className={styles.activeCallPhoneChipMeta}>
                                  <span className={styles.activeCallPhoneChipKind}>
                                    {formatPhoneLabel(p.label)}
                                  </span>
                                  <span className={styles.activeCallPhoneChipNum}>{p.phone || '—'}</span>
                                </span>
                              </>
                            );
                            const pickQueued = currentItem?.state === 'queued';
                            return (
                              <li key={sid} className={styles.activeCallPhoneListHorizItem}>
                                {pickQueued ? (
                                  <button
                                    type="button"
                                    className={`${chipClass} ${styles.activeCallPhoneChipBtn}`}
                                    disabled={busy}
                                    title="Use this number on Call next"
                                    onClick={() =>
                                      applyTargetPhoneOnItem(
                                        p.id === 'synthetic-primary' ? null : Number(p.id) || null
                                      )
                                    }
                                  >
                                    {chipBody}
                                  </button>
                                ) : (
                                  <span className={chipClass}>{chipBody}</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {canAddPhoneNumber ? (
                          <div className={styles.activeCallAddPhoneWrap}>
                            <button
                              type="button"
                              className={styles.activeCallAddPhoneBtn}
                              disabled={busy}
                              title="Add a number (pick a free type: mobile, work, …)"
                              aria-expanded={addPhoneOpen}
                              aria-label="Add phone number"
                              onClick={() => setAddPhoneOpen((o) => !o)}
                            >
                              <Icon name="plus" />
                            </button>
                            {addPhoneOpen ? (
                              <div className={styles.activeCallAddPhonePop}>
                                <Select
                                  className={styles.activeCallAddPhoneSelect}
                                  label="Type"
                                  placeholder="Type"
                                  value={addPhoneLabel}
                                  onChange={(e) => setAddPhoneLabel(e.target.value)}
                                  options={missingPhoneLabels.map((l) => ({
                                    value: l,
                                    label: formatPhoneLabel(l),
                                  }))}
                                  disabled={busy}
                                />
                                <Input
                                  className={styles.activeCallAddPhoneInput}
                                  label="Number"
                                  value={addPhoneValue}
                                  onChange={(e) => setAddPhoneValue(e.target.value)}
                                  placeholder="+1…"
                                  disabled={busy}
                                  autoComplete="tel"
                                />
                                <div className={styles.activeCallAddPhoneActions}>
                                  <Button size="sm" variant="primary" disabled={busy} onClick={submitAddPhone}>
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={busy}
                                    onClick={() => {
                                      setAddPhoneOpen(false);
                                      setAddPhoneValue('');
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.dialToolbar}>
              <div className={styles.dialToolbarControls}>
                <Button
                  variant="primary"
                  onClick={callNext}
                  disabled={
                    busy ||
                    session.status === 'paused' ||
                    session.status === 'completed' ||
                    session.status === 'cancelled' ||
                    callingCount > 0 ||
                    queuedCount === 0
                  }
                  title={
                    callingCount > 0
                      ? 'Set a disposition on the current call before dialing the next lead.'
                      : queuedCount === 0
                        ? 'No leads left in the queue.'
                        : undefined
                  }
                >
                  {busy ? 'Working…' : 'Call next'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={session.status === 'paused' ? resumeSession : pauseSession}
                  disabled={
                    busy ||
                    session.status === 'ready' ||
                    session.status === 'completed' ||
                    session.status === 'cancelled'
                  }
                  title={session.status === 'paused' ? 'Resume dialing' : 'Pause dialing'}
                >
                  <span className={styles.iconBtnInner}>
                    <Icon name={session.status === 'paused' ? 'play' : 'pause'} />
                    <span className={styles.iconBtnText}>{session.status === 'paused' ? 'Resume' : 'Pause'}</span>
                  </span>
                </Button>
                <Button
                  variant="secondary"
                  disabled
                  title="Mute/unmute requires live call provider support (not available for dummy provider yet)"
                >
                  <span className={styles.iconBtnInner}>
                    <Icon name="micOff" />
                    <span className={styles.iconBtnText}>Mute</span>
                  </span>
                </Button>
                <button
                  type="button"
                  className={styles.endSessionIconBtn}
                  onClick={cancelSession}
                  disabled={busy || session.status === 'completed' || session.status === 'cancelled'}
                  title="End session — no more calls will be placed"
                  aria-label="End session"
                >
                  <Icon name="stop" />
                </button>
              </div>
            </div>

            {view === 'preflight' ? (
              <p className={styles.preflightShellHint}>
                Use <strong>Start session</strong> in the checklist above for the first call, or <strong>Skip</strong> to open
                the workspace. Next steps use your disposition buttons (e.g. next contact).
              </p>
            ) : null}

            {view === 'active' ? (
            <div className={styles.grid}>
            <aside className={styles.left}>
              <div className={`${styles.card} ${styles.cardContact}`}>
                <div className={styles.cardTitle}>Current contact</div>
                <div className={styles.contactHero}>
                  <div className={styles.contactAvatar} aria-hidden="true">
                    {contactInitial}
                  </div>
                  <div className={styles.contactHeroMain}>
                    <div className={styles.contactName}>{leadContact?.display_name || '—'}</div>
                    <div className={styles.contactHeroMeta}>
                      {totalCount > 0 && currentContactNumber ? (
                        <span className={styles.contactPosition}>
                          Lead {currentContactNumber} of {totalCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {contactDetailPending ? (
                  <p className={styles.contactSourceHint}>
                    Name and phone come from the dial queue. Other fields appear when the contact record loads.
                  </p>
                ) : null}
                <dl className={styles.contactMeta}>
                  <div className={styles.contactRow}>
                    <dt className={styles.metaLabel}>Phone numbers</dt>
                    <dd className={`${styles.metaValue} ${styles.phoneBlock}`}>
                      {phonesList.length === 0 ? (
                        <span>—</span>
                      ) : (
                        <div className={styles.phoneDisplayList}>
                          {phonesList.map((p, idx) => {
                            const sid = String(p.id ?? `${idx}-${p.phone}`);
                            return (
                              <div key={sid} className={styles.phoneDisplayItem}>
                                <span className={styles.phoneDisplayType}>{formatPhoneLabel(p.label)}</span>
                                <span className={styles.phoneDisplayValue}>{p.phone || '—'}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </dd>
                  </div>
                  <div className={styles.contactRow}>
                    <dt className={styles.metaLabel}>Email</dt>
                    <dd
                      className={`${styles.metaValue} ${
                        contactDetailPending && !leadContact?.email ? styles.metaPlaceholder : ''
                      }`}
                    >
                      {leadContact?.email || '—'}
                    </dd>
                  </div>
                  <div className={styles.contactRow}>
                    <dt className={styles.metaLabel}>Company</dt>
                    <dd
                      className={`${styles.metaValue} ${
                        contactDetailPending && !leadContact?.company ? styles.metaPlaceholder : ''
                      }`}
                    >
                      {leadContact?.company || '—'}
                    </dd>
                  </div>
                  <div className={styles.contactRow}>
                    <dt className={styles.metaLabel}>Job title</dt>
                    <dd
                      className={`${styles.metaValue} ${
                        contactDetailPending && !leadContact?.job_title ? styles.metaPlaceholder : ''
                      }`}
                    >
                      {leadContact?.job_title || '—'}
                    </dd>
                  </div>
                  <div className={styles.contactRow}>
                    <dt className={styles.metaLabel}>City</dt>
                    <dd
                      className={`${styles.metaValue} ${
                        contactDetailPending && !leadContact?.city ? styles.metaPlaceholder : ''
                      }`}
                    >
                      {leadContact?.city || '—'}
                    </dd>
                  </div>
                  <div className={styles.contactRow}>
                    <dt className={styles.metaLabel}>Notes</dt>
                    <dd
                      className={`${styles.metaValue} ${
                        contactDetailPending && !leadContact?.notes ? styles.metaPlaceholder : ''
                      }`}
                    >
                      {leadContact?.notes || '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            </aside>

            <main className={styles.center}>
              <div className={`${styles.card} ${styles.cardScript}`}>
                <div className={styles.cardTitleRow}>
                  <div className={styles.scriptTitleBlock}>
                    <div className={styles.scriptEyebrow}>Call script</div>
                    <div className={styles.scriptTitle}>{session?.script?.script_name || 'Script'}</div>
                  </div>
                </div>
                {import.meta?.env?.DEV && missingTemplateKeys.length > 0 ? (
                  <div className={styles.devWarn} role="status">
                    <div className={styles.devWarnTitle}>Missing template variables</div>
                    <div className={styles.devWarnBody}>
                      {missingTemplateKeys.map((k) => (
                        <code key={k} className={styles.devWarnCode}>
                          {k}
                        </code>
                      ))}
                    </div>
                    <div className={styles.devWarnHint}>
                      Add these keys in <code>template_variables</code> or replace them in the script editor.
                    </div>
                  </div>
                ) : null}
                <div className={styles.scriptReadingSurface}>
                  {String(session?.script?.script_body || '').trim() ? (
                    <div
                      className={styles.scriptBody}
                      dangerouslySetInnerHTML={{
                        __html: renderScriptHtml(
                          session?.script?.script_body,
                          leadContact,
                          user,
                          tenant,
                          templateSample
                        ),
                      }}
                    />
                  ) : (
                    <div className={styles.scriptEmpty}>
                      No script text is set for this session. Ask an admin to attach a call script to the dialing set.
                    </div>
                  )}
                </div>
              </div>

              <div className={`${styles.card} ${styles.cardQueue}`}>
                <div className={styles.queueHeader}>
                  <div className={styles.queueTitle}>Call queue</div>
                  <div className={styles.queueHint}>{items.length} leads</div>
                </div>
                <div className={styles.queueTableWrap}>
                  <table className={styles.queueTable}>
                    <thead>
                      <tr>
                        <th className={styles.thOrder} style={{ width: 56 }}>
                          #
                        </th>
                        <th>Lead</th>
                        <th className={styles.thState} style={{ width: 112 }}>
                          State
                        </th>
                        <th className={styles.thTime} style={{ width: 132 }}>
                          Called at
                        </th>
                        <th className={styles.thAttempt} style={{ width: 100 }}>
                          Attempt
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} className={currentItem?.id === it.id ? styles.queueRowActive : undefined}>
                          <td>{it.order_index + 1}</td>
                          <td>
                            <div className={styles.queueName}>{it.display_name || `#${it.contact_id}`}</div>
                            <div className={styles.queueSub}>
                              #{it.contact_id} ·{' '}
                              {it.state === 'calling'
                                ? it.attempt_phone || it.selected_phone || it.primary_phone || '—'
                                : it.selected_phone || it.primary_phone || '—'}
                            </div>
                          </td>
                          <td>
                            <span className={`${styles.statePill} ${styles[`state_${it.state}`] || ''}`.trim()}>
                              {it.state}
                            </span>
                          </td>
                          <td>{safeDateTime(it.called_at)}</td>
                          <td>{it.last_attempt_id ? `#${it.last_attempt_id}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </main>

            <aside className={styles.right}>
              <div className={`${styles.card} ${styles.cardDispo}`}>
                <div className={styles.dispoHeader}>
                  <div className={styles.dispoTitle}>Outcomes</div>
                  <p className={styles.dispoSub}>After the call, pick a disposition to log and continue.</p>
                </div>
                <div className={styles.dispoList}>
                  {(session?.dispositions || []).length === 0 ? (
                    <div className={styles.dispoEmpty}>No dispositions configured for this dialing set.</div>
                  ) : (
                    session.dispositions.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={styles.dispoBtn}
                        disabled={busy}
                        aria-disabled={!lastAttemptId}
                        title={!lastAttemptId ? 'Call at least one lead first' : d.next_action || ''}
                        onClick={() => setDisposition(d.id, d.next_action)}
                      >
                        <span className={styles.dispoBtnBody}>
                          <span className={styles.dispoBtnText}>
                            <span className={styles.dispoBtnName}>{d.name}</span>
                            {d.next_action ? (
                              <span className={styles.dispoBtnHint}>{d.next_action}</span>
                            ) : null}
                          </span>
                          <span className={styles.dispoBtnChevron} aria-hidden="true" />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
            ) : null}
          </div>
          )}
        </>
      ) : null}

    </div>
  );
}

