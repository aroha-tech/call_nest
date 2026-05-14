import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppSelector } from '../app/hooks';
import { selectUser } from '../features/auth/authSelectors';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { leadImportDistributionAPI } from '../services/leadImportDistributionAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import listStyles from '../components/admin/adminDataList.module.scss';
import styles from './LeadImportAssignmentSettingsPage.module.scss';
import { AI_ASSISTANT_DISPLAY_NAME, AI_INSIGHTS_DISPLAY_NAME } from '../config/productBrand';

/** Equal whole-number % split across n agents, always sums to 100. */
function distributeEqualPercents(n) {
  if (n <= 0) return [];
  if (n === 1) return [100];
  const base = Math.floor(100 / n);
  let rem = 100 - base * n;
  const out = Array(n).fill(base);
  for (let i = 0; i < rem; i++) out[i]++;
  return out;
}

/** Map stored weights (any positive numbers) to whole % that sum to 100 for display/editing. */
function weightsToDisplayPercents(rows) {
  if (!rows?.length) return [];
  const ws = rows.map((r) => Math.max(1, Number(r.weight) || 1));
  const sum = ws.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return rows.map((r) => ({ user_id: Number(r.user_id), weight: 100 }));
  let pcts = ws.map((w) => Math.max(1, Math.round((100 * w) / sum)));
  let diff = 100 - pcts.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (diff !== 0 && guard < 500) {
    if (diff > 0) {
      const idx = pcts.indexOf(Math.min(...pcts));
      pcts[idx]++;
      diff--;
    } else {
      const idx = pcts.indexOf(Math.max(...pcts));
      if (pcts[idx] > 1) {
        pcts[idx]--;
        diff++;
      } else break;
    }
    guard++;
  }
  return rows.map((r, i) => ({ user_id: Number(r.user_id), weight: pcts[i] }));
}

function rebalanceEqualPercents(rows) {
  if (!rows.length) return [];
  const pcts = distributeEqualPercents(rows.length);
  return rows.map((r, i) => ({ user_id: Number(r.user_id), weight: pcts[i] }));
}

function clampPct(v) {
  const n = Math.round(Number(v) || 0);
  return Math.min(100, Math.max(0, n));
}

const MODE_DEFS = [
  {
    value: 'manual',
    icon: 'touch_app',
    title: 'Manual',
    description:
      'The person importing picks a default agent on the import screen, or maps an Assignee column in the file. Nothing is assigned automatically.',
  },
  {
    value: 'weighted',
    icon: 'pie_chart',
    title: 'Spread by share',
    description:
      'Choose exactly which agents get imported leads (you see each agent’s manager). Set percents so they add to 100%. If you do not want this, use Manual instead.',
  },
  {
    value: 'ai',
    icon: 'auto_awesome',
    title: `Smart routing (${AI_ASSISTANT_DISPLAY_NAME})`,
    description: `${AI_ASSISTANT_DISPLAY_NAME} picks the best agent from the lead text on your servers, then uses your percents as a tie-break. Pick agents and percents in step 2 below.`,
    xAi: true,
  },
];

const MODE_LABEL = {
  manual: 'Manual',
  weighted: 'Spread by share',
  ai: `Smart routing (${AI_ASSISTANT_DISPLAY_NAME})`,
};

const MODE_ICON = {
  manual: 'touch_app',
  weighted: 'pie_chart',
  ai: 'auto_awesome',
};

export function LeadImportAssignmentSettingsPage() {
  const user = useAppSelector(selectUser);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState('');
  const [data, setData] = useState(null);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [assignmentMode, setAssignmentMode] = useState('manual');
  const [distRows, setDistRows] = useState([]);

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';

  const managerNameById = useMemo(() => {
    const m = new Map();
    for (const u of tenantUsers) {
      if (u.role === 'manager') {
        m.set(Number(u.id), u.name || u.email || `Manager ${u.id}`);
      }
    }
    return m;
  }, [tenantUsers]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, uRes] = await Promise.all([
        leadImportDistributionAPI.get(),
        tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false }),
      ]);
      setData(dRes?.data?.data ?? null);
      setTenantUsers(uRes?.data?.data ?? []);
    } catch (e) {
      const msg = String(e?.response?.data?.error || e?.message || 'Failed to load');
      showToast(msg, 'error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const managerDisplayForAgent = useCallback(
    (agent) => {
      if (!agent) return '—';
      if (isManager && user?.id && Number(agent.manager_id) === Number(user.id)) {
        return user.name || user.email || 'Your team';
      }
      const mid = agent.manager_id;
      if (mid == null || mid === '' || Number(mid) <= 0) return '— No manager —';
      return managerNameById.get(Number(mid)) || `Manager ${mid}`;
    },
    [isManager, user, managerNameById]
  );

  useEffect(() => {
    if (!data) return;
    setAssignmentMode(String(data.default_assignment_mode || 'manual'));
    let pool = [];
    if (isManager) {
      pool = data.by_manager?.[String(user.id)] || [];
    } else {
      pool = data.default_pool || [];
    }
    const raw = (pool || []).map((r) => ({
      user_id: Number(r.user_id),
      weight: Number(r.weight) > 0 ? Number(r.weight) : 1,
    }));
    setDistRows(raw.length ? weightsToDisplayPercents(raw) : []);
  }, [data, user?.id, isManager]);

  const poolAgentCandidates = useMemo(() => {
    const inPool = new Set(distRows.map((r) => Number(r.user_id)));
    let agents = tenantUsers.filter((u) => u.role === 'agent');
    if (isManager && user?.id) {
      agents = agents.filter((u) => Number(u.manager_id) === Number(user.id));
    }
    return agents
      .filter((u) => !inPool.has(Number(u.id)))
      .sort((a, b) => {
        const ma = managerDisplayForAgent(a);
        const mb = managerDisplayForAgent(b);
        const c = ma.localeCompare(mb);
        if (c !== 0) return c;
        return String(a.name || a.email).localeCompare(String(b.name || b.email));
      });
  }, [tenantUsers, user, distRows, isManager, managerDisplayForAgent]);

  const poolUsesTeam = assignmentMode === 'weighted' || assignmentMode === 'ai';

  const percentTotal = useMemo(
    () => distRows.reduce((s, r) => s + clampPct(r.weight), 0),
    [distRows]
  );
  const percentOk = percentTotal === 100 && distRows.length > 0;

  const validatePool = useCallback(() => {
    if (!poolUsesTeam) return null;
    if (distRows.length === 0) {
      return `Add at least one agent. Spread and ${AI_ASSISTANT_DISPLAY_NAME} need a list of agents.`;
    }
    if (percentTotal !== 100) {
      return `Percents must add up to exactly 100%. Right now they add up to ${percentTotal}%.`;
    }
    for (const row of distRows) {
      const p = clampPct(row.weight);
      if (p < 1) {
        return 'Give each agent at least 1%, or remove them from the list.';
      }
    }
    return null;
  }, [poolUsesTeam, distRows, percentTotal]);

  if (!user || user.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }
  if (!isAdmin && !isManager) {
    return <Navigate to="/unauthorized" replace />;
  }

  const handleSave = async () => {
    setSaving(true);
    setOk('');
    const poolErr = validatePool();
    if (poolErr) {
      showToast(poolErr, 'error');
      setSaving(false);
      return;
    }
    try {
      const normalized = distRows
        .filter((r) => Number(r.user_id) > 0 && clampPct(r.weight) > 0)
        .map((r) => ({ user_id: Number(r.user_id), weight: clampPct(r.weight) }));

      if (isManager) {
        await leadImportDistributionAPI.put({ pool: normalized });
      } else {
        const body = { default_assignment_mode: assignmentMode };
        if (poolUsesTeam) {
          body.default_pool = normalized;
        }
        await leadImportDistributionAPI.put(body);
      }
      setOk('Saved.');
      await load();
    } catch (e) {
      showToast(String(e?.response?.data?.error || e?.message || 'Save failed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const labelForAgent = (uid) => {
    const u = tenantUsers.find((x) => Number(x.id) === Number(uid));
    return u?.name || u?.email || `Agent ${uid}`;
  };

  const updatePct = (uid, rawVal) => {
    const v = clampPct(rawVal);
    setDistRows((prev) => prev.map((r) => (Number(r.user_id) === uid ? { ...r, weight: v } : r)));
  };

  const addAgent = (agentId) => {
    const n = Number(agentId);
    setDistRows((prev) => {
      if (prev.some((r) => Number(r.user_id) === n)) return prev;
      return rebalanceEqualPercents([...prev, { user_id: n, weight: 0 }]);
    });
  };

  const removeAgent = (uid) => {
    setDistRows((prev) => {
      const next = prev.filter((r) => Number(r.user_id) !== uid);
      return next.length ? rebalanceEqualPercents(next) : [];
    });
  };

  const percentMeterClass =
    distRows.length === 0
      ? styles.percentMeterWarn
      : percentOk
        ? styles.percentMeterOk
        : styles.percentMeterBad;

  const barFillClass =
    distRows.length === 0
      ? styles.percentBarFillWarn
      : percentOk
        ? styles.percentBarFillOk
        : styles.percentBarFillBad;

  const renderPercentBar = () => (
    <div className={styles.percentBarWrap}>
      <div className={styles.percentBarLabel}>
        <span>Total of selected agents</span>
        <span className={percentMeterClass} style={{ fontWeight: 700 }}>
          {distRows.length ? `${percentTotal} / 100%` : '—'}
        </span>
      </div>
      <div className={styles.percentBarTrack} aria-hidden>
        <div
          className={`${styles.percentBarFill} ${barFillClass}`}
          style={{ width: `${distRows.length ? Math.min(100, percentTotal) : 0}%` }}
        />
      </div>
    </div>
  );

  const renderTipBand = (isAi) => (
    <div className={styles.tipBand} role="region" aria-label="Setup tips">
      <div className={styles.tipBandHeader}>
        <div className={styles.tipBandHeaderTitle}>
          <MaterialSymbol name={isAi ? 'auto_awesome' : 'pie_chart'} size="sm" aria-hidden />
          <span>
            {isAi ? `${AI_ASSISTANT_DISPLAY_NAME} — before you pick agents` : 'Spread by share — before you pick agents'}
          </span>
        </div>
        <div className={`${styles.tipBandPct} ${percentMeterClass}`} aria-live="polite">
          {distRows.length ? `Selected total ${percentTotal}% / 100%` : 'Selected total —'}
        </div>
      </div>
      <ul className={styles.tipBandList}>
        <li>
          <MaterialSymbol name="groups" size="sm" className={styles.tipBandIcon} aria-hidden />
          <span>
            The <strong>list on the right</strong> shows each agent and <strong>who they report to</strong>, so you
            can pick with full context.
          </span>
        </li>
        <li>
          <MaterialSymbol name="percent" size="sm" className={styles.tipBandIcon} aria-hidden />
          <span>
            Use whole-number <strong>percents</strong>; selected agents must add to <strong>100%</strong> to save.
          </span>
        </li>
        <li>
          <MaterialSymbol name="pie_chart" size="sm" className={styles.tipBandIcon} aria-hidden />
          <span>
            <strong>Share evenly</strong> splits 100% across everyone currently in the left column.
          </span>
        </li>
        {isAi ? (
          <li>
            <MaterialSymbol name="shield_lock" size="sm" className={styles.tipBandIcon} aria-hidden />
            <span>
              {AI_ASSISTANT_DISPLAY_NAME} only considers people you add here; percents break ties. Scoring runs on{' '}
              <strong>your servers</strong>—not outside services.
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );

  const renderAgentPercentBlock = (variant) => {
    const isAi = variant === 'ai';
    const sectionClass = isAi ? styles.aiPanel : styles.weightedPanel;
    const headingId = isAi ? 'lead-ai-agents-heading' : 'lead-weighted-agents-heading';
    const title = isAi
      ? `2. ${AI_ASSISTANT_DISPLAY_NAME} — pick agents (with manager) and tie-break %`
      : isManager
        ? 'Who on your team gets leads? (percents = 100%)'
        : '2. Pick agents (with manager) and set % (must total 100%)';

    return (
      <section className={sectionClass} aria-labelledby={headingId}>
        {isAi ? (
          <div className={styles.aiPanelTop}>
            <MaterialSymbol name="shield_lock" size="md" className={styles.modeIcon} style={{ flexShrink: 0 }} />
            <div>
              <strong>{AI_ASSISTANT_DISPLAY_NAME} routing</strong> — same idea as {AI_INSIGHTS_DISPLAY_NAME}: scoring runs
              on your servers only, not outside AI services. Choose which agents {AI_ASSISTANT_DISPLAY_NAME} may assign
              and how to break ties with percents.
            </div>
          </div>
        ) : null}

        <h2 id={headingId} className={styles.sectionHeading}>
          {title}
        </h2>
        <p className={`${styles.muted} ${styles.panelIntro}`}>
          {isAi ? (
            <>
              Add agents from the list (each row shows their manager). Set percents so they add to 100%.{' '}
              {AI_ASSISTANT_DISPLAY_NAME} reads each lead and picks from this list; ties use your percents.
            </>
          ) : isManager ? (
            <>
              Add agents from your team below. Set each person&apos;s % so the total is <strong>100%</strong>.
            </>
          ) : (
            <>
              Choose who receives automatically assigned leads: use the list on the right (agent + manager). Add them
              to the left, then set each <strong>%</strong> so the total is exactly <strong>100%</strong>.
            </>
          )}
        </p>

        {renderTipBand(isAi)}

        <div className={styles.splitContent}>
          <div className={styles.splitColSurface}>
            <div className={styles.splitColTitle}>Selected for imports</div>
            {renderPercentBar()}

            {distRows.length === 0 ? (
              <div className={styles.emptyState}>
                <MaterialSymbol name="group_add" size="lg" className={styles.emptyStateIcon} aria-hidden />
                <p className={styles.emptyStateTitle}>No agents selected yet</p>
                <p className={styles.muted} style={{ marginBottom: 0 }}>
                  Use the company list on the right. Each row shows who reports to which manager before you add them.
                </p>
              </div>
            ) : (
              <table className={styles.agentTable}>
                <colgroup>
                  <col className={styles.colAgent} />
                  <col className={styles.colManager} />
                  <col className={styles.colPct} />
                  <col className={styles.colActions} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={styles.thAgent}>
                      Agent
                    </th>
                    <th scope="col" className={styles.thManager}>
                      Manager
                    </th>
                    <th scope="col" className={styles.thPct}>
                      Percent
                    </th>
                    <th scope="col" className={styles.thActions}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {distRows.map((row) => {
                    const uid = Number(row.user_id);
                    const agentUser = tenantUsers.find((x) => Number(x.id) === uid);
                    return (
                      <tr key={uid}>
                        <td className={styles.tdAgent}>
                          <span className={styles.agentName} style={{ border: 'none', padding: 0 }}>
                            <MaterialSymbol name="person" size="sm" className={styles.modeIcon} />
                            {labelForAgent(uid)}
                          </span>
                        </td>
                        <td className={styles.tdManager}>{managerDisplayForAgent(agentUser)}</td>
                        <td className={styles.tdPct}>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            id={`lead-import-pct-${uid}`}
                            aria-label="Percent for this agent. All selected agents must total 100%."
                            className={styles.agentPctInput}
                            inputClassName={styles.agentPctInputField}
                            value={String(clampPct(row.weight))}
                            onChange={(e) => updatePct(uid, e.target.value)}
                          />
                        </td>
                        <td className={styles.tdActions}>
                          <Button type="button" variant="secondary" onClick={() => removeAgent(uid)}>
                            <MaterialSymbol name="close" size="sm" aria-hidden />
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div className={styles.rowActions}>
              <Button
                type="button"
                variant="secondary"
                disabled={distRows.length < 2}
                onClick={() => setDistRows((prev) => rebalanceEqualPercents(prev))}
              >
                <MaterialSymbol name="pie_chart" size="sm" aria-hidden style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Share evenly (100%)
              </Button>
            </div>

            {distRows.length > 0 ? (
              <div className={styles.splitColFooter}>
                {!isAi ? (
                  <Alert variant={percentOk ? 'success' : 'error'} display="inline">
                    {percentOk
                      ? 'Percents add up to 100%. You can save.'
                      : `Percents add up to ${percentTotal}%. Adjust until the total is exactly 100%.`}
                  </Alert>
                ) : (
                  <Alert variant={percentOk ? 'success' : 'error'} display="inline">
                    {percentOk
                      ? `Percents add up to 100%. ${AI_ASSISTANT_DISPLAY_NAME} can use this list when you save.`
                      : `Percents add up to ${percentTotal}%. Set the total to 100% so ${AI_ASSISTANT_DISPLAY_NAME} knows how to break ties.`}
                  </Alert>
                )}
              </div>
            ) : null}
          </div>

          <div className={styles.splitColSurface}>
            <div className={styles.splitColTitle}>Company agents — pick who to include</div>
            <p className={styles.muted} style={{ marginTop: 0 }}>
              {isManager
                ? 'Agents on your team who are not in the selected list yet.'
                : 'Everyone in the company with the Agent role. Manager shows who they report to.'}
            </p>
            {poolAgentCandidates.length === 0 ? (
              <div className={styles.emptyPickList}>
                <MaterialSymbol name="task_alt" size="lg" className={styles.emptyPickIcon} aria-hidden />
                <p className={styles.emptyPickTitle}>All set — full list is on the left</p>
                <p className={styles.muted} style={{ marginBottom: 0, maxWidth: '28rem' }}>
                  Every available agent is already in your selected list. To swap someone, remove them on the left,
                  then they will show up here again.
                </p>
              </div>
            ) : (
              <div className={styles.availableTableWrap}>
                <table className={styles.agentTable}>
                  <colgroup>
                    <col className={styles.colAgent} />
                    <col className={styles.colManager} />
                    <col className={styles.colAdd} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={styles.thAgent}>
                        Agent
                      </th>
                      <th scope="col" className={styles.thManager}>
                        Manager
                      </th>
                      <th scope="col" className={styles.thAdd}>
                        Add
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolAgentCandidates.map((u) => (
                      <tr key={u.id}>
                        <td className={styles.tdAgent}>
                          <span className={styles.agentName} style={{ border: 'none', padding: 0 }}>
                            <MaterialSymbol name="person" size="sm" className={styles.modeIcon} />
                            {u.name || u.email || String(u.id)}
                          </span>
                        </td>
                        <td className={styles.tdManager}>{managerDisplayForAgent(u)}</td>
                        <td className={styles.tdAdd}>
                          <Button type="button" variant="secondary" onClick={() => addAgent(u.id)}>
                            <MaterialSymbol name="add" size="sm" aria-hidden style={{ marginRight: 4 }} />
                            Add
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className={`${listStyles.page} ${styles.leadImportPage}`}>
      <PageHeader
        title="Lead import assignment"
        description="Choose what happens to new leads when someone uploads a lead file (CSV)."
        actions={
          <Button variant="secondary" type="button" onClick={() => navigate('/leads/import')}>
            Back to import
          </Button>
        }
      />

      {ok ? (
        <Alert variant="success" display="inline" className={listStyles.mb}>
          {ok}
        </Alert>
      ) : null}

      <Card padding={false} className={styles.leadImportCard}>
        {loading ? (
          <div className={styles.leadImportCardInner}>
            <Spinner />
          </div>
        ) : (
          <div className={`${styles.wrap} ${styles.leadImportCardInner}`}>
            <div className={styles.layoutPrimary}>
                {isAdmin ? (
                  <section className={styles.section} aria-labelledby="lead-mode-heading">
                    <h2 id="lead-mode-heading" className={styles.sectionHeading}>
                      1. How should new leads be given out?
                    </h2>
                    <div className={styles.modeGrid} role="radiogroup" aria-label="How imported leads are assigned">
                      {MODE_DEFS.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          role="radio"
                          aria-checked={assignmentMode === m.value}
                          className={`${styles.modeCard} ${assignmentMode === m.value ? styles.modeCardSelected : ''}`}
                          onClick={() => {
                            setAssignmentMode(m.value);
                            setOk('');
                          }}
                        >
                          <span className={styles.modeCardTitle}>
                            <MaterialSymbol name={m.icon} size="md" className={styles.modeIcon} />
                            {m.title}
                            {m.xAi ? <span className={styles.badgeXAi}>{AI_ASSISTANT_DISPLAY_NAME}</span> : null}
                          </span>
                          <span className={styles.modeDesc}>{m.description}</span>
                          {m.xAi ? (
                            <span className={styles.aiExplainer}>
                              Full {AI_ASSISTANT_DISPLAY_NAME} agent list and percents are in step 2 when this mode is on.
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : (
                  <div className={styles.managerReadonly}>
                    <MaterialSymbol name={MODE_ICON[assignmentMode] || 'tune'} size="md" className={styles.modeIcon} />
                    <span>
                      Company setting: <strong>{MODE_LABEL[assignmentMode] || assignmentMode}</strong>. Only an admin
                      can change this. You can still set your team&apos;s agents and percents (total 100%) below.
                    </span>
                  </div>
                )}

                {assignmentMode === 'weighted' && poolUsesTeam ? renderAgentPercentBlock('weighted') : null}
                {assignmentMode === 'ai' && poolUsesTeam ? renderAgentPercentBlock('ai') : null}

                {!poolUsesTeam ? (
                  <section className={styles.section}>
                    <Alert variant="info" display="inline">
                      <MaterialSymbol name="info" size="sm" style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                      In manual mode there is no automatic split between agents. The person importing picks defaults on
                      the import screen or maps an assignee column in the file.
                    </Alert>
                  </section>
                ) : null}

                <div className={styles.saveRow}>
                  <Button type="button" onClick={handleSave} loading={saving}>
                    <MaterialSymbol
                      name="save"
                      size="sm"
                      aria-hidden
                      style={{ marginRight: 6, verticalAlign: 'middle' }}
                    />
                    Save
                  </Button>
                </div>
              </div>
          </div>
        )}
      </Card>
    </div>
  );
}
