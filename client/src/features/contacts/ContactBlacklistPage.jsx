import React, { useCallback, useMemo, useState } from 'react';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../auth/authSelectors';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { ConfirmModal } from '../../components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '../../components/ui/Table';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { contactBlacklistAPI } from '../../services/contactBlacklistAPI';
import listStyles from '../../components/admin/adminDataList.module.scss';

export function ContactBlacklistPage() {
  const user = useAppSelector(selectUser);
  const role = String(user?.role || '').toLowerCase();
  const canUnblock = role === 'admin' || role === 'manager';
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [unblockItem, setUnblockItem] = useState(null);
  const [scopeFilter, setScopeFilter] = useState('all');

  const fetchRows = useCallback(
    () =>
      contactBlacklistAPI.list({
        search: searchQuery || undefined,
        page,
        limit,
        block_scope: scopeFilter === 'all' ? undefined : scopeFilter,
      }),
    [searchQuery, page, limit, scopeFilter]
  );
  const { data, loading, error, refetch } = useAsyncData(fetchRows, [searchQuery, page, limit, scopeFilter], {
    transform: (res) => res?.data ?? { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
  });
  const unblockMutation = useMutation((id) => contactBlacklistAPI.unblock(id));

  const rows = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit, total: 0, totalPages: 1 };

  const scopeLabel = useMemo(
    () => ({ lead: 'Lead', contact: 'Contact', number: 'Number' }),
    []
  );

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Blacklist"
        description="Tenant blacklist for leads, contacts, and phone numbers."
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button size="sm" variant={scopeFilter === 'all' ? 'primary' : 'secondary'} onClick={() => { setScopeFilter('all'); setPage(1); }}>
              All
            </Button>
            <Button size="sm" variant={scopeFilter === 'lead' ? 'primary' : 'secondary'} onClick={() => { setScopeFilter('lead'); setPage(1); }}>
              Leads
            </Button>
            <Button size="sm" variant={scopeFilter === 'contact' ? 'primary' : 'secondary'} onClick={() => { setScopeFilter('contact'); setPage(1); }}>
              Contacts
            </Button>
            <Button size="sm" variant={scopeFilter === 'number' ? 'primary' : 'secondary'} onClick={() => { setScopeFilter('number'); setPage(1); }}>
              Numbers
            </Button>
          </div>
          <SearchInput
            value={searchQuery}
            onSearch={(v) => {
              setSearchQuery(v || '');
              setPage(1);
            }}
            placeholder="Search... (press Enter)"
          />
        </div>
        <div className={listStyles.tableCardBody}>
          {rows.length === 0 && !loading ? (
            <EmptyState title="No blacklist entries" description="Add blacklist from Contact/Lead actions." />
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Phone</TableHeaderCell>
                  <TableHeaderCell>Reason</TableHeaderCell>
                  <TableHeaderCell>Blocked at</TableHeaderCell>
                  <TableHeaderCell align="center">Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{scopeLabel[r.block_scope] || r.block_scope}</TableCell>
                    <TableCell>{r.display_name || '—'}</TableCell>
                    <TableCell>{r.email || '—'}</TableCell>
                    <TableCell>{r.phone_e164 || '—'}</TableCell>
                    <TableCell>{r.reason || '—'}</TableCell>
                    <TableCell>{r.created_at || '—'}</TableCell>
                    <TableCell align="center">
                      {canUnblock ? (
                        <Button size="sm" variant="secondary" onClick={() => setUnblockItem(r)}>
                          Unblock
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <div className={listStyles.tableCardFooterPagination}>
          <Pagination
            page={pagination.page || page}
            totalPages={pagination.totalPages || 1}
            total={pagination.total || 0}
            limit={pagination.limit || limit}
            onPageChange={setPage}
            onLimitChange={(v) => {
              setLimit(v);
              setPage(1);
            }}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={!!unblockItem}
        onClose={() => setUnblockItem(null)}
        onConfirm={async () => {
          if (!unblockItem) return;
          const result = await unblockMutation.mutate(unblockItem.id);
          if (result?.success) {
            setUnblockItem(null);
            refetch();
          }
        }}
        title="Unblock entry"
        message="Are you sure you want to unblock this blacklist entry?"
        confirmText="Unblock"
        loading={unblockMutation.loading}
      />
    </div>
  );
}

