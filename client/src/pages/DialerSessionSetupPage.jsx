import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectTenant, selectUser } from '../features/auth/authSelectors';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { dialerSessionsAPI } from '../services/dialerSessionsAPI';
import { dialingSetsAPI, callScriptsAPI, dialingSetDispositionsAPI } from '../services/dispositionAPI';
import { templateVariablesAPI } from '../services/templateVariablesAPI';
import { renderScriptHtml } from '../utils/callScriptHtml';
import styles from './DialerSessionSetupPage.module.scss';

function pickDefaultId(list, isDefaultKey = 'is_default') {
  const def = list.find((x) => Number(x?.[isDefaultKey]) === 1) || list[0] || null;
  return def?.id ? String(def.id) : '';
}

export function DialerSessionSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppSelector(selectUser);
  const tenant = useAppSelector(selectTenant);

  const incoming = location.state || {};
  const contactIds = useMemo(() => {
    const ids = Array.isArray(incoming.contactIds) ? incoming.contactIds : null;
    if (ids && ids.length) return ids;
    try {
      const raw = sessionStorage.getItem('dialerSetup:contactIds');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [incoming.contactIds]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [dialingSets, setDialingSets] = useState([]);
  const [callScripts, setCallScripts] = useState([]);

  const dialingSetSelectOptions = useMemo(
    () => dialingSets.map((d) => ({ value: String(d.id), label: d.name || '—' })),
    [dialingSets]
  );
  const callScriptSelectOptions = useMemo(
    () => callScripts.map((s) => ({ value: String(s.id), label: s.script_name || '—' })),
    [callScripts]
  );

  const [dialingSetId, setDialingSetId] = useState(incoming.dialingSetId ? String(incoming.dialingSetId) : '');
  const [callScriptId, setCallScriptId] = useState(incoming.callScriptId ? String(incoming.callScriptId) : '');

  const [templateSample, setTemplateSample] = useState(null);
  const [scriptDetail, setScriptDetail] = useState(null);
  const [scriptPreviewLoading, setScriptPreviewLoading] = useState(false);
  const [dispositions, setDispositions] = useState([]);
  const [dispoLoading, setDispoLoading] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem('dialerSetup:contactIds', JSON.stringify(contactIds || []));
    } catch {
      // ignore
    }
  }, [contactIds]);

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
      setLoading(true);
      setError('');
      try {
        const [dsRes, csRes] = await Promise.all([
          dialingSetsAPI.getAll(false),
          callScriptsAPI.getAll({ page: 1, limit: 100, includeInactive: false, search: '' }),
        ]);
        const ds = dsRes?.data?.data || dsRes?.data || [];
        const cs = csRes?.data?.data || csRes?.data || [];
        if (cancelled) return;
        setDialingSets(Array.isArray(ds) ? ds : []);
        setCallScripts(Array.isArray(cs?.data) ? cs.data : Array.isArray(cs) ? cs : []);
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Failed to load session settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!dialingSetId && dialingSets.length) setDialingSetId(pickDefaultId(dialingSets));
  }, [dialingSetId, dialingSets]);

  useEffect(() => {
    if (!callScriptId && callScripts.length) setCallScriptId(pickDefaultId(callScripts));
  }, [callScriptId, callScripts]);

  useEffect(() => {
    if (!callScriptId) {
      setScriptDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setScriptPreviewLoading(true);
      try {
        const res = await callScriptsAPI.getById(callScriptId);
        const row = res?.data?.data ?? res?.data ?? null;
        if (!cancelled) setScriptDetail(row);
      } catch {
        if (!cancelled) setScriptDetail(null);
      } finally {
        if (!cancelled) setScriptPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callScriptId]);

  useEffect(() => {
    if (!dialingSetId) {
      setDispositions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setDispoLoading(true);
      try {
        const res = await dialingSetDispositionsAPI.getAll(dialingSetId);
        const rows = res?.data?.data ?? res?.data ?? [];
        if (!cancelled) setDispositions(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setDispositions([]);
      } finally {
        if (!cancelled) setDispoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialingSetId]);

  const selectedDialingSet = useMemo(
    () => dialingSets.find((d) => String(d.id) === String(dialingSetId)) || null,
    [dialingSets, dialingSetId]
  );

  const selectedScriptMeta = useMemo(
    () => callScripts.find((s) => String(s.id) === String(callScriptId)) || null,
    [callScripts, callScriptId]
  );

  const scriptPreviewHtml = useMemo(() => {
    const body = scriptDetail?.script_body ?? '';
    return renderScriptHtml(body, null, user, tenant, templateSample);
  }, [scriptDetail?.script_body, user, tenant, templateSample]);

  async function continueToPreflight() {
    setError('');
    if (!contactIds?.length) {
      setError('No leads selected. Please go back and select at least 1 lead.');
      return;
    }
    if (!dialingSetId) {
      setError('Dialing set is required.');
      return;
    }
    if (!callScriptId) {
      setError('Call script is required.');
      return;
    }

    setBusy(true);
    try {
      const res = await dialerSessionsAPI.create({
        contact_ids: contactIds,
        provider: 'dummy',
        dialing_set_id: dialingSetId,
        call_script_id: Number(callScriptId),
      });
      const s = res?.data?.data ?? null;
      if (s?.id) {
        navigate(`/dialer/session/${s.id}?step=preflight`);
      } else {
        setError('Failed to create session.');
      }
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to create dialer session');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <span className={styles.brandMark}>Dialer</span>
          <span className={styles.topDivider} aria-hidden />
          <h1 className={styles.topTitle}>New session</h1>
        </div>
        <Button variant="secondary" onClick={() => navigate('/dialer')}>
          Back to leads
        </Button>
      </header>

      {error ? <Alert variant="error">{error}</Alert> : null}

      {loading ? (
        <div className={styles.loadingCenter}>
          <Spinner size="lg" />
        </div>
      ) : (
        <div className={styles.layout}>
          <section className={styles.leftCol} aria-labelledby="setup-config-heading">
            <div className={styles.stepPill}>Step 1 · Configure</div>
            <h2 id="setup-config-heading" className={styles.heading}>
              Session settings
            </h2>
            <p className={styles.lead}>Choose the dialing set and script for this run. Preview updates on the right.</p>

            <div className={styles.statCard}>
              <div className={styles.statLabel}>Leads in queue</div>
              <div className={styles.statValue}>{contactIds?.length || 0}</div>
            </div>

            <div className={styles.field}>
              <Select
                id="dialingSet"
                label="Dialing set"
                value={dialingSetId}
                onChange={(e) => setDialingSetId(e.target.value)}
                options={dialingSetSelectOptions}
                placeholder="Select dialing set…"
                selectClassName={styles.select}
                labelClassName={styles.label}
              />
            </div>

            <div className={styles.field}>
              <Select
                id="callScript"
                label="Call script"
                value={callScriptId}
                onChange={(e) => setCallScriptId(e.target.value)}
                options={callScriptSelectOptions}
                placeholder="Select call script…"
                selectClassName={styles.select}
                labelClassName={styles.label}
              />
            </div>

            <div className={styles.actions}>
              <Button onClick={continueToPreflight} disabled={busy}>
                {busy ? 'Creating session…' : 'Continue'}
              </Button>
            </div>
          </section>

          <aside className={styles.rightCol} aria-label="Preview">
            <div className={styles.previewHeader}>
              <span className={styles.previewTitle}>Live preview</span>
              <span className={styles.previewHint}>Desktop layout</span>
            </div>

            <div className={styles.previewStack}>
              <div className={styles.previewCard}>
                <div className={styles.previewCardHead}>
                  <span className={styles.previewCardTitle}>Call script</span>
                  <span className={styles.previewCardMeta}>
                    {scriptDetail?.script_name || selectedScriptMeta?.script_name || '—'}
                  </span>
                </div>
                <div className={styles.previewCardBody}>
                  {scriptPreviewLoading ? (
                    <div className={styles.previewLoading}>
                      <Spinner />
                    </div>
                  ) : (
                    <div
                      className={styles.scriptPreview}
                      dangerouslySetInnerHTML={{ __html: scriptPreviewHtml }}
                    />
                  )}
                </div>
              </div>

              <div className={styles.previewCard}>
                <div className={styles.previewCardHead}>
                  <span className={styles.previewCardTitle}>Dialing set</span>
                  <span className={styles.previewCardMeta}>
                    {selectedDialingSet?.name || '—'}
                  </span>
                </div>
                <div className={styles.previewCardBody}>
                  {dispoLoading ? (
                    <div className={styles.previewLoading}>
                      <Spinner />
                    </div>
                  ) : dispositions.length === 0 ? (
                    <p className={styles.previewEmpty}>No disposition buttons linked to this set yet.</p>
                  ) : (
                    <ul className={styles.dispoPreviewList}>
                      {dispositions.map((row) => (
                        <li key={row.id || `${row.disposition_id}-${row.order_index}`} className={styles.dispoPreviewItem}>
                          <span className={styles.dispoPreviewName}>{row.disposition_name || row.name || 'Disposition'}</span>
                          {row.next_action ? (
                            <span className={styles.dispoPreviewHint}>{row.next_action}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
