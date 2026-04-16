import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Pagination } from '../components/ui/Pagination';
import { Alert } from '../components/ui/Alert';
import { Spinner } from '../components/ui/Spinner';
import { SearchInput } from '../components/ui/SearchInput';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import listStyles from '../components/admin/adminDataList.module.scss';
import { dialerSessionsAPI } from '../services/dialerSessionsAPI';
import { usePermissions } from '../hooks/usePermission';
import styles from './DialSessionsPage.module.scss';

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

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ready', label: 'Ready' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function DialSessionsPage() {
  const navigate = useNavigate();
  const { canAny } = usePermissions();
  const canView = canAny(['dial.execute', 'dial.monitor']);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [createdBefore, setCreatedBefore] = useState('');

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const res = await dialerSessionsAPI.list({
        page,
        limit,
        q: searchQuery?.trim() ? searchQuery.trim() : undefined,
        status: statusFilter || undefined,
        provider: providerFilter?.trim() ? providerFilter.trim() : undefined,
        created_after: createdAfter || undefined,
        created_before: createdBefore || undefined,
      });
      setPayload(res?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load dial sessions');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [canView, page, limit, searchQuery, statusFilter, providerFilter, createdAfter, createdBefore]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = payload?.data ?? [];
  const pagination = payload?.pagination ?? { page, limit, total: 0, totalPages: 1 };
  const totalPages = Math.max(1, pagination.totalPages || 1);

  if (!canView) {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Dial sessions" description="Power dialer queues" />
        <Alert variant="error">You don’t have access to dial sessions.</Alert>
      </div>
    );
  }

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Dial sessions"
        description="Power-dial queues: session # is per user; open a row to run or review the queue. Related calls appear on Call history."
        actions={
          <div className={styles.headerActions}>
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/calls/history')}>
              Call history
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/dialer')}>
              Dialer home
            </Button>
          </div>
        }
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className={listStyles.tableCard}>
        <div className={`${listStyles.tableCardToolbarTop} ${listStyles.tableCardToolbarTopLead}`}>
          <div className={styles.toolbarFilters}>
            <SearchInput
              value={searchQuery}
              onSearch={(v) => {
                setSearchQuery(String(v ?? '').trim());
                setPage(1);
              }}
              placeholder="Search session # or id… (Enter)"
              className={styles.toolbarSearch}
            />
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
            />
            <Input
              label="Provider"
              value={providerFilter}
              onChange={(e) => {
                setProviderFilter(e.target.value);
                setPage(1);
              }}
              placeholder="e.g. dummy"
            />
            <Input
              label="Created after"
              type="datetime-local"
              value={createdAfter}
              onChange={(e) => {
                setCreatedAfter(e.target.value);
                setPage(1);
              }}
            />
            <Input
              label="Created before"
              type="datetime-local"
              value={createdBefore}
              onChange={(e) => {
                setCreatedBefore(e.target.value);
                setPage(1);
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('');
                setProviderFilter('');
                setCreatedAfter('');
                setCreatedBefore('');
                setPage(1);
              }}
            >
              Reset filters
            </Button>
          </div>
        </div>

        {loading && !payload ? (
          <div className={listStyles.tableCardEmpty}>
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className={listStyles.tableCardEmpty}>No dial sessions match your filters.</div>
        ) : (
          <div className={listStyles.tableCardBody}>
            <Table variant="adminList">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Session #</TableHeaderCell>
                  <TableHeaderCell>ID</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Provider</TableHeaderCell>
                  <TableHeaderCell>Leads</TableHeaderCell>
                  <TableHeaderCell>Created</TableHeaderCell>
                  <TableHeaderCell>Started</TableHeaderCell>
                  <TableHeaderCell>Ended</TableHeaderCell>
                  <TableHeaderCell>Created by</TableHeaderCell>
                  <TableHeaderCell align="right"> </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <strong>#{r.user_session_no ?? '—'}</strong>
                    </TableCell>
                    <TableCell>{r.id}</TableCell>
                    <TableCell>
                      <Badge variant="muted" size="sm">
                        {r.status || '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.provider || '—'}</TableCell>
                    <TableCell>{r.items_count ?? '—'}</TableCell>
                    <TableCell>{safeDateTime(r.created_at)}</TableCell>
                    <TableCell>{safeDateTime(r.started_at)}</TableCell>
                    <TableCell>{safeDateTime(r.ended_at)}</TableCell>
                    <TableCell>{r.creator_name || '—'}</TableCell>
                    <TableCell align="right">
                      <Button type="button" size="sm" variant="primary" onClick={() => navigate(`/dialer/session/${r.id}`)}>
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className={listStyles.tableCardFooterPagination}>
          <Pagination
            page={pagination.page || page}
            totalPages={totalPages}
            total={pagination.total || 0}
            limit={pagination.limit || limit}
            onPageChange={(p) => setPage(p)}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        </div>
      </div>
    </div>
  );
}
