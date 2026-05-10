import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Alert } from '../components/ui/Alert';
import { ConfirmModal } from '../components/ui/Modal';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../components/ui/Table';
import { StatusBadge } from '../components/ui/Badge';
import { dialerPhoneNumbersAPI } from '../services/dialerPhoneNumbersAPI';
import { tenantUsersAPI } from '../services/tenantUsersAPI';
import styles from './DialerPhoneNumbersPage.module.scss';

export function DialerPhoneNumbersPage() {
  const [rows, setRows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assignBusyId, setAssignBusyId] = useState(null);
  const [toggleRow, setToggleRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, agentsRes] = await Promise.all([
        dialerPhoneNumbersAPI.list(),
        tenantUsersAPI.getAll({ page: 1, limit: 500, role: 'agent', includeDisabled: false }),
      ]);
      setRows(listRes?.data?.data ?? []);
      setAgents(agentsRes?.data?.data ?? []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const agentOptions = useMemo(
    () => [
      { value: '', label: '— Unassigned (pool) —' },
      ...agents.map((a) => ({
        value: String(a.id),
        label: `${a.name || a.email || 'User'} (${a.email})`,
      })),
    ],
    [agents]
  );

  async function saveAssignment(row, userIdRaw) {
    const uid =
      userIdRaw === '' || userIdRaw === undefined || userIdRaw === null ? null : Number(userIdRaw);
    setAssignBusyId(row.id);
    setError(null);
    try {
      await dialerPhoneNumbersAPI.update(row.id, {
        assigned_user_id: uid,
      });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Update failed');
    } finally {
      setAssignBusyId(null);
    }
  }

  async function confirmToggleActive() {
    if (!toggleRow) return;
    const next = !toggleRow.is_active;
    setError(null);
    try {
      await dialerPhoneNumbersAPI.update(toggleRow.id, { is_active: next });
      setToggleRow(null);
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Update failed');
    }
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        title="Phone numbers"
        titleIcon="call"
        description="Lines allocated to your workspace by the platform admin appear here. Assign each line to an agent or leave it in the pool for shared use. Call resolution: user profile override → assigned line → shared pool → server defaults."
      />

      <p className={styles.meta}>
        Per-user overrides: <Link to="/users">Users</Link>
      </p>

      {error ? (
        <Alert variant="error" className={styles.alert}>
          {error}
        </Alert>
      ) : null}

      <Card className={styles.card}>
        {loading ? (
          <p className={styles.muted}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className={styles.muted}>
            No numbers allocated to this workspace yet. Your platform administrator adds inventory and assigns lines
            to your tenant.
          </p>
        ) : (
          <Table variant="adminList">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Label</TableHeaderCell>
                <TableHeaderCell>Caller ID</TableHeaderCell>
                <TableHeaderCell>Agent leg</TableHeaderCell>
                <TableHeaderCell>Assigned agent</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell align="right">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.label || '—'}</TableCell>
                  <TableCell className={styles.mono}>{r.caller_id_e164}</TableCell>
                  <TableCell className={styles.mono}>{r.agent_leg_e164 || '—'}</TableCell>
                  <TableCell>
                    <Select
                      value={r.assigned_user_id != null ? String(r.assigned_user_id) : ''}
                      onChange={(e) => saveAssignment(r, e.target.value)}
                      options={agentOptions}
                      disabled={assignBusyId === r.id}
                      className={styles.assignSelect}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={!!r.is_active} />
                  </TableCell>
                  <TableCell align="right">
                    <div className={styles.rowActions}>
                      <Button
                        type="button"
                        size="sm"
                        variant={r.is_active ? 'secondary' : 'primary'}
                        onClick={() => setToggleRow(r)}
                      >
                        {r.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmModal
        isOpen={Boolean(toggleRow)}
        title={toggleRow?.is_active ? 'Deactivate number' : 'Activate number'}
        message={
          toggleRow?.is_active
            ? 'Inactive numbers are not used for assignments or call resolution until activated again.'
            : 'This number becomes available for assignment and call resolution.'
        }
        confirmText={toggleRow?.is_active ? 'Deactivate' : 'Activate'}
        variant={toggleRow?.is_active ? 'danger' : 'primary'}
        onClose={() => setToggleRow(null)}
        onConfirm={() => void confirmToggleActive()}
      />
    </div>
  );
}
