import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { leadImportDistributionAPI } from '../services/leadImportDistributionAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import listStyles from '../components/admin/adminDataList.module.scss';

const ASSIGNMENT_OPTIONS = [
  { value: 'manual', label: 'Manual — importers use default agent on the import screen or column mapping' },
  { value: 'weighted', label: 'Spread by percentages — uses the agent pool below' },
  { value: 'ai', label: 'Smart routing — matches lead text to agents, then weighted selection' },
];

export function LeadImportAssignmentSettingsPage() {
  const user = useAppSelector(selectUser);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [data, setData] = useState(null);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [assignmentMode, setAssignmentMode] = useState('manual');
  const [importManagerId, setImportManagerId] = useState('');
  const [distRows, setDistRows] = useState([]);
  const [addAgentDraft, setAddAgentDraft] = useState('');

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dRes, uRes] = await Promise.all([
        leadImportDistributionAPI.get(),
        tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false }),
      ]);
      setData(dRes?.data?.data ?? null);
      setTenantUsers(uRes?.data?.data ?? []);
    } catch (e) {
      setError(String(e?.response?.data?.error || e?.message || 'Failed to load'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    setAssignmentMode(String(data.default_assignment_mode || 'manual'));
    let pool = [];
    if (isManager) {
      pool = data.by_manager?.[String(user.id)] || [];
    } else if (importManagerId) {
      pool = data.by_manager?.[String(importManagerId)] || [];
    } else {
      pool = data.default_pool || [];
    }
    setDistRows(
      (pool || []).map((r) => ({
        user_id: Number(r.user_id),
        weight: Number(r.weight) > 0 ? Number(r.weight) : 1,
      }))
    );
  }, [data, importManagerId, user?.id, isManager]);

  const managerSelectOptions = useMemo(() => {
    const base = [{ value: '', label: 'Workspace default pool' }];
    const mgrs = tenantUsers.filter((u) => u.role === 'manager');
    return [
      ...base,
      ...mgrs
        .map((u) => ({ value: String(u.id), label: u.name || u.email || '—' }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [tenantUsers]);

  const poolAgentCandidates = useMemo(() => {
    const inPool = new Set(distRows.map((r) => Number(r.user_id)));
    let agents = tenantUsers.filter((u) => u.role === 'agent');
    if (isManager && user?.id) {
      agents = agents.filter((u) => Number(u.manager_id) === Number(user.id));
    } else if (importManagerId && isAdmin) {
      agents = agents.filter((u) => Number(u.manager_id) === Number(importManagerId));
    }
    return agents
      .filter((u) => !inPool.has(Number(u.id)))
      .map((u) => ({ value: String(u.id), label: u.name || u.email || String(u.id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tenantUsers, user, importManagerId, distRows, isAdmin, isManager]);

  if (!user || user.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }
  if (!isAdmin && !isManager) {
    return <Navigate to="/unauthorized" replace />;
  }

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setOk('');
    try {
      const normalized = distRows
        .filter((r) => Number(r.user_id) > 0 && Number(r.weight) > 0)
        .map((r) => ({ user_id: Number(r.user_id), weight: Number(r.weight) }));

      if (isManager) {
        await leadImportDistributionAPI.put({ pool: normalized });
      } else {
        const body = { default_assignment_mode: assignmentMode };
        if (importManagerId) {
          body.by_manager = { [String(importManagerId)]: normalized };
        } else {
          body.default_pool = normalized;
        }
        await leadImportDistributionAPI.put(body);
      }
      setOk('Saved.');
      await load();
    } catch (e) {
      setError(String(e?.response?.data?.error || e?.message || 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const labelForAgent = (uid) => {
    const u = tenantUsers.find((x) => Number(x.id) === Number(uid));
    return u?.name || u?.email || `Agent ${uid}`;
  };

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Lead import assignment"
        description="How new leads are assigned when CSV files are imported."
        actions={
          <Button variant="secondary" type="button" onClick={() => navigate('/leads/import')}>
            Back to import
          </Button>
        }
      />

      {error ? (
        <Alert variant="error" display="inline" className={listStyles.mb}>
          {error}
        </Alert>
      ) : null}
      {ok ? (
        <Alert variant="success" display="inline" className={listStyles.mb}>
          {ok}
        </Alert>
      ) : null}

      <Card>
        {loading ? (
          <Spinner />
        ) : (
          <div style={{ maxWidth: 720 }}>
            {isAdmin ? (
              <Select
                label="Default assignment for lead CSV imports"
                value={assignmentMode}
                onChange={(e) => {
                  setAssignmentMode(e.target.value);
                  setOk('');
                }}
                options={ASSIGNMENT_OPTIONS}
              />
            ) : (
              <p style={{ margin: '0 0 16px', color: 'var(--color-text-muted, #888)' }}>
                Workspace rule:{' '}
                <strong>
                  {assignmentMode === 'weighted'
                    ? 'Spread by percentages'
                    : assignmentMode === 'ai'
                      ? 'Smart routing'
                      : 'Manual'}
                </strong>
                . Only a workspace admin can change this; you can edit your team’s agent pool below.
              </p>
            )}

            {isAdmin ? (
              <div style={{ marginTop: 20 }}>
                <Select
                  label="Pool to edit"
                  value={importManagerId}
                  onChange={(e) => {
                    setImportManagerId(e.target.value);
                    setOk('');
                  }}
                  options={managerSelectOptions}
                />
              </div>
            ) : null}

            <h3 style={{ fontSize: '1rem', margin: '24px 0 8px', fontWeight: 600 }}>Agent pool</h3>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-muted, #888)' }}>
              {isAdmin && !importManagerId
                ? 'Weights apply to the whole workspace when no per-manager pool exists for a team.'
                : 'Relative weights control how often each agent receives new leads.'}
            </p>

            {distRows.map((row) => {
              const uid = Number(row.user_id);
              return (
                <div
                  key={uid}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginBottom: 10,
                  }}
                >
                  <span style={{ minWidth: 160 }}>{labelForAgent(uid)}</span>
                  <Input
                    type="number"
                    min={1}
                    label="Weight"
                    value={String(row.weight)}
                    onChange={(e) => {
                      const n = Math.max(1, Number(e.target.value) || 1);
                      setDistRows((prev) => prev.map((r) => (Number(r.user_id) === uid ? { ...r, weight: n } : r)));
                    }}
                    style={{ maxWidth: 120 }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDistRows((prev) => prev.filter((r) => Number(r.user_id) !== uid))}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
              <Select
                label="Add agent"
                value={addAgentDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setAddAgentDraft('');
                    return;
                  }
                  const n = Number(v);
                  if (!Number.isFinite(n) || n <= 0) return;
                  setDistRows((prev) => {
                    if (prev.some((r) => Number(r.user_id) === n)) return prev;
                    return [...prev, { user_id: n, weight: 1 }];
                  });
                  setAddAgentDraft('');
                }}
                options={[{ value: '', label: '— Select —' }, ...poolAgentCandidates]}
              />
            </div>

            <div style={{ marginTop: 24 }}>
              <Button type="button" onClick={handleSave} loading={saving}>
                Save
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
