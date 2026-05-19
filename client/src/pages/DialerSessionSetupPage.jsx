import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectTenant, selectUser } from '../features/auth/authSelectors';
import { Select } from '../components/ui/Select';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { dialerSessionsAPI } from '../services/dialerSessionsAPI';
import { dialingSetsAPI, callScriptsAPI, dialingSetDispositionsAPI } from '../services/dispositionAPI';
import { templateVariablesAPI } from '../services/templateVariablesAPI';
import { renderScriptHtml } from '../utils/callScriptHtml';
import { DialerCreditsBar } from '../components/dialer/DialerCreditsBar';
import { DialerFlowLayout } from '../components/dialer/DialerFlowLayout';
import { DialerIcon, outcomeIconName } from '../components/dialer/DialerIcon';
import { getDialerTheme, persistDialerTheme } from '../components/dialer/dialerTheme';
import styles from './DialerSessionSetupPage.module.scss';

function pickDefaultId(list, isDefaultKey = 'is_default') {
  const def = list.find((x) => Number(x?.[isDefaultKey]) === 1) || list[0] || null;
  return def?.id ? String(def.id) : '';
}

function SetupIconStat({ icon, label, value, tone = 'violet' }) {
  return (
    <div className={styles.inlineStat}>
      <span className={styles.inlineStatLead}>
        <span className={styles.iconWell} data-tone={tone} aria-hidden="true">
          <DialerIcon name={icon} />
        </span>
        <span className={styles.inlineStatLabel}>{label}</span>
      </span>
      <span className={styles.inlineStatValue}>{value}</span>
    </div>
  );
}

function SetupSkeleton() {
  return (
    <div className={styles.split} aria-busy="true" aria-label="Loading session settings">
      <div className={styles.configPanel}>
        <Skeleton height={18} width="55%" />
        <Skeleton height={12} width="80%" style={{ marginTop: 8 }} />
        <Skeleton height={52} style={{ marginTop: 14, borderRadius: 10 }} />
        <Skeleton height={56} style={{ marginTop: 12, borderRadius: 8 }} />
        <Skeleton height={56} style={{ marginTop: 10, borderRadius: 8 }} />
        <Skeleton height={40} style={{ marginTop: 'auto', borderRadius: 8 }} />
      </div>
      <div className={styles.previewPanel}>
        <div className={styles.previewGrid}>
          <div className={styles.previewPane}>
            <Skeleton height={36} />
            <Skeleton height="100%" style={{ margin: 12, borderRadius: 8, minHeight: 120 }} />
          </div>
          <div className={styles.previewPane}>
            <Skeleton height={36} />
            <div className={styles.skelOutcomeList}>
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} height={44} style={{ borderRadius: 8 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
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
  const [dialerTheme, setDialerTheme] = useState(() => getDialerTheme());

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
    <DialerFlowLayout
      theme={dialerTheme}
      onThemeChange={(t) => {
        setDialerTheme(t);
        persistDialerTheme(t);
      }}
      subtitle="New session"
      credits={<DialerCreditsBar barOnly refreshIntervalMs={60000} />}
    >
      <div className={styles.workspace} data-dialer-theme={dialerTheme}>
        {error ? (
          <div className={styles.alertRow}>
            <Alert variant="error">{error}</Alert>
          </div>
        ) : null}

        {loading ? (
          <SetupSkeleton />
        ) : (
          <div className={styles.split}>
            <section className={styles.configPanel} aria-labelledby="setup-config-heading">
              <h2 id="setup-config-heading" className={styles.panelTitle}>
                Session settings
              </h2>
              <p className={styles.panelLead}>Dialing set, script, and queue size for this run.</p>

              <SetupIconStat icon="users" label="Leads in queue" value={contactIds?.length || 0} tone="violet" />

              <div className={styles.field}>
                <span className={styles.fieldIcon} aria-hidden="true">
                  <DialerIcon name="flag" />
                </span>
                <Select
                  id="dialingSet"
                  label="Dialing set"
                  value={dialingSetId}
                  onChange={(e) => setDialingSetId(e.target.value)}
                  options={dialingSetSelectOptions}
                  placeholder="Select dialing set…"
                  selectClassName={styles.select}
                  labelClassName={styles.label}
                  wrapperClassName={styles.selectWrap}
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldIcon} aria-hidden="true">
                  <DialerIcon name="fileText" />
                </span>
                <Select
                  id="callScript"
                  label="Call script"
                  value={callScriptId}
                  onChange={(e) => setCallScriptId(e.target.value)}
                  options={callScriptSelectOptions}
                  placeholder="Select call script…"
                  selectClassName={styles.select}
                  labelClassName={styles.label}
                  wrapperClassName={styles.selectWrap}
                />
              </div>

              <div className={styles.configActions}>
                <Button onClick={continueToPreflight} disabled={busy}>
                  {busy ? 'Creating session…' : 'Continue to review'}
                </Button>
              </div>
            </section>

            <section className={styles.previewPanel} aria-label="Workspace preview">
              <div className={styles.previewGrid}>
                <article className={styles.previewPane}>
                  <header className={styles.paneHead}>
                    <span className={styles.paneHeadLead}>
                      <span className={styles.paneIcon} aria-hidden="true">
                        <DialerIcon name="fileText" />
                      </span>
                      <span className={styles.paneTitle}>Call script</span>
                    </span>
                    <span className={styles.paneMeta}>
                      {scriptDetail?.script_name || selectedScriptMeta?.script_name || '—'}
                    </span>
                  </header>
                  <div className={styles.paneBody}>
                    {scriptPreviewLoading ? (
                      <div className={styles.paneLoading}>
                        <Spinner />
                      </div>
                    ) : (
                      <div
                        className={styles.scriptPreview}
                        dangerouslySetInnerHTML={{ __html: scriptPreviewHtml }}
                      />
                    )}
                  </div>
                </article>

                <article className={styles.previewPane}>
                  <header className={styles.paneHead}>
                    <span className={styles.paneHeadLead}>
                      <span className={styles.paneIcon} data-tone="green" aria-hidden="true">
                        <DialerIcon name="check" />
                      </span>
                      <span className={styles.paneTitle}>Outcomes</span>
                    </span>
                    <span className={styles.paneMeta}>{selectedDialingSet?.name || '—'}</span>
                  </header>
                  <div className={styles.paneBody}>
                    {dispoLoading ? (
                      <div className={styles.paneLoading}>
                        <Spinner />
                      </div>
                    ) : dispositions.length === 0 ? (
                      <p className={styles.paneEmpty}>No dispositions linked to this set.</p>
                    ) : (
                      <ul className={styles.outcomeList}>
                        {dispositions.map((row) => (
                          <li
                            key={row.id || `${row.disposition_id}-${row.order_index}`}
                            className={styles.outcomeItem}
                          >
                            <span className={styles.outcomeLead}>
                              <span className={styles.outcomeIcon} aria-hidden="true">
                                <DialerIcon name={outcomeIconName(row.next_action)} />
                              </span>
                              <span>{row.disposition_name || row.name || 'Disposition'}</span>
                            </span>
                            {row.next_action ? (
                              <span className={styles.outcomeHint}>{row.next_action}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              </div>
            </section>
          </div>
        )}
      </div>
    </DialerFlowLayout>
  );
}
