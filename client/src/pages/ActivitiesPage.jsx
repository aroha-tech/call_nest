import React, { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { usePermissions } from '../hooks/usePermission';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { callsAPI } from '../services/callsAPI';
import { dispositionsAPI } from '../services/dispositionAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import { savedListFiltersAPI } from '../services/savedListFiltersAPI';
import listStyles from '../components/admin/adminDataList.module.scss';
import styles from './ActivitiesPage.module.scss';

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

export function ActivitiesPage() {
  const user = useAppSelector(selectUser);
  const { canAny } = usePermissions();
  const canView = canAny(['dial.execute', 'dial.monitor']);

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  const [provider, setProvider] = useState('dummy');
  const [contactIdDraft, setContactIdDraft] = useState('');
  const [starting, setStarting] = useState(false);

  const [dispositions, setDispositions] = useState([]);
  const [dispositionFilter, setDispositionFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [startedAfter, setStartedAfter] = useState('');
  const [startedBefore, setStartedBefore] = useState('');
  const [tenantAgents, setTenantAgents] = useState([]);
  const [savedFilters, setSavedFilters] = useState([]);
  const [savedPick, setSavedPick] = useState('');

  const dispoOptions = useMemo(
    () => [{ value: '', label: '— No disposition —' }, ...dispositions.map((d) => ({ value: String(d.id), label: d.name || d.code || d.id }))],
    [dispositions]
  );

  const dispoFilterOptions = useMemo(
    () => [{ value: '', label: 'All dispositions' }, ...dispositions.map((d) => ({ value: String(d.id), label: d.name || d.code || d.id }))],
    [dispositions]
  );

  const agentFilterOptions = useMemo(() => {
    const opts = tenantAgents
      .map((u) => ({ value: String(u.id), label: u.name || u.email || `#${u.id}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: '', label: 'All agents' }, ...opts];
  }, [tenantAgents]);

  const savedFilterOptions = useMemo(
    () => [{ value: '', label: 'Saved filters…' }, ...savedFilters.map((f) => ({ value: String(f.id), label: f.name }))],
    [savedFilters]
  );

  async function load() {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const res = await callsAPI.list({
        page,
        limit,
        disposition_id: dispositionFilter || undefined,
        agent_user_id: agentFilter || undefined,
        started_after: startedAfter || undefined,
        started_before: startedBefore || undefined,
      });
      setPayload(res?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load activities');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, canView, dispositionFilter, agentFilter, startedAfter, startedBefore]);

  useEffect(() => {
    if (!canView) return;
    dispositionsAPI
      .getAll({ includeInactive: true, page: 1, limit: 500 })
      .then((res) => setDispositions(res?.data?.data?.data ?? []))
      .catch(() => setDispositions([]));
  }, [canView]);

  useEffect(() => {
    if (!canView || !user) return;
    if (user.role !== 'admin' && user.role !== 'manager') return;
    let cancelled = false;
    tenantUsersAPI
      .getAll({ page: 1, limit: 500, includeDisabled: false })
      .then((res) => {
        const list = res?.data?.data ?? [];
        if (!cancelled) setTenantAgents(list.filter((u) => u.role === 'agent'));
      })
      .catch(() => {
        if (!cancelled) setTenantAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canView, user]);

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    savedListFiltersAPI
      .list({ entity_type: 'call_history' })
      .then((res) => {
        if (!cancelled) setSavedFilters(res?.data?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSavedFilters([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canView]);

  const applyCallHistorySnapshot = (snap) => {
    if (!snap || snap.version !== 1) return;
    setDispositionFilter(snap.dispositionFilter ?? '');
    setAgentFilter(snap.agentFilter ?? '');
    setStartedAfter(snap.startedAfter ?? '');
    setStartedBefore(snap.startedBefore ?? '');
    setPage(1);
  };

  const handleSavedCallFilterPick = (e) => {
    const id = e.target.value;
    setSavedPick(id);
    if (!id) return;
    const row = savedFilters.find((f) => String(f.id) === id);
    let snap = row?.filter_json;
    if (snap == null) return;
    if (typeof snap === 'string') {
      try {
        snap = JSON.parse(snap);
      } catch {
        return;
      }
    }
    applyCallHistorySnapshot(snap);
  };

  const saveCurrentCallFilter = async () => {
    const name = window.prompt('Name for this filter');
    if (!name || !String(name).trim()) return;
    const filter_json = {
      version: 1,
      dispositionFilter,
      agentFilter,
      startedAfter,
      startedBefore,
    };
    try {
      await savedListFiltersAPI.create({ entity_type: 'call_history', name: String(name).trim(), filter_json });
      const res = await savedListFiltersAPI.list({ entity_type: 'call_history' });
      setSavedFilters(res?.data?.data ?? []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Could not save filter');
    }
  };

  const rows = payload?.data ?? [];
  const pagination = payload?.pagination ?? { page, limit, total: 0, totalPages: 1 };

  const startSingle = async () => {
    setStarting(true);
    setError('');
    try {
      const cid = Number(contactIdDraft);
      if (!cid) {
        setError('Enter a valid contact/lead id to start a dummy call.');
        return;
      }
      await callsAPI.start({ contact_id: cid, provider });
      setContactIdDraft('');
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to start call');
    } finally {
      setStarting(false);
    }
  };

  if (!canView) {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Activities" description="Calls & follow-ups" />
        <Alert variant="error">You don’t have access to the call module.</Alert>
      </div>
    );
  }

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Activities"
        description={`Call attempts and dispositions (${user?.role || 'user'} scope).`}
        actions={
          <div className={styles.headerActions}>
            <Select
              label="Provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              options={[{ value: 'dummy', label: 'Dummy (dev)' }]}
            />
            <Input
              label="Contact/Lead ID"
              value={contactIdDraft}
              onChange={(e) => setContactIdDraft(e.target.value)}
              placeholder="e.g. 123"
              inputMode="numeric"
            />
            <Button onClick={startSingle} disabled={starting || loading}>
              {starting ? 'Calling…' : 'Start call'}
            </Button>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className={styles.filterCard}>
        <div className={styles.filterRow}>
          <Select
            label="Disposition"
            value={dispositionFilter}
            onChange={(e) => {
              setDispositionFilter(e.target.value);
              setPage(1);
            }}
            options={dispoFilterOptions}
          />
          {(user?.role === 'admin' || user?.role === 'manager') && (
            <Select
              label="Agent"
              value={agentFilter}
              onChange={(e) => {
                setAgentFilter(e.target.value);
                setPage(1);
              }}
              options={agentFilterOptions}
            />
          )}
          <Input
            label="Started after"
            type="datetime-local"
            value={startedAfter}
            onChange={(e) => {
              setStartedAfter(e.target.value);
              setPage(1);
            }}
          />
          <Input
            label="Started before"
            type="datetime-local"
            value={startedBefore}
            onChange={(e) => {
              setStartedBefore(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className={styles.filterRow}>
          <Select
            label="Saved filter"
            value={savedPick}
            onChange={handleSavedCallFilterPick}
            options={savedFilterOptions}
          />
          <Button type="button" variant="secondary" onClick={saveCurrentCallFilter}>
            Save current filter
          </Button>
        </div>
      </div>

      <div className={listStyles.tableCard}>
        <div className={styles.cardBody}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Spinner size="sm" /> Loading…
            </div>
          ) : null}

          {!loading && rows.length === 0 ? (
            <div className={styles.empty}>No call attempts yet. Start a dummy call to test.</div>
          ) : null}

          {!loading && rows.length > 0 ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Attempt</th>
                      <th>Contact</th>
                      <th>Phone</th>
                      <th>Agent</th>
                      <th>Provider</th>
                      <th>Status</th>
                      <th>Disposition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <ActivityRow key={r.id} row={r} dispoOptions={dispoOptions} onSaved={load} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16 }}>
                <Pagination
                  page={pagination.page || page}
                  totalPages={pagination.totalPages || 1}
                  total={pagination.total || 0}
                  limit={pagination.limit || limit}
                  onPageChange={setPage}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ row, dispoOptions, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [dispositionId, setDispositionId] = useState(row.disposition_id ? String(row.disposition_id) : '');
  const [notes, setNotes] = useState(row.notes || '');

  async function save() {
    setSaving(true);
    try {
      await callsAPI.setDisposition(row.id, {
        disposition_id: dispositionId || null,
        notes: notes || null,
      });
      await onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>{safeDateTime(row.created_at)}</td>
      <td>#{row.id}</td>
      <td>
        {row.display_name ? (
          <>
            {row.display_name} <span style={{ opacity: 0.6 }}>({row.contact_id})</span>
          </>
        ) : (
          row.contact_id
        )}
      </td>
      <td>{row.phone_e164 || '—'}</td>
      <td>{row.agent_name || (row.agent_user_id ? `#${row.agent_user_id}` : '—')}</td>
      <td>{row.provider}</td>
      <td>{row.status}</td>
      <td>
        <div className={styles.dispoCell}>
          <Select value={dispositionId} onChange={(e) => setDispositionId(e.target.value)} options={dispoOptions} />
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
          <Button size="sm" variant="secondary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

