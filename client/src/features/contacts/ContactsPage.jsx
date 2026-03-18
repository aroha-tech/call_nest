import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { usePermission } from '../../hooks/usePermission';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { contactsAPI } from '../../services/contactsAPI';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { ConfirmModal } from '../../components/ui/Modal';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import listStyles from '../../components/admin/adminDataList.module.scss';

export function ContactsPage({ type }) {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const role = user?.role ?? 'agent';

  const canRead = usePermission(type === 'lead' ? 'leads.read' : 'contacts.read');
  const canCreate = usePermission(type === 'lead' ? 'leads.create' : 'contacts.create');
  const canUpdate = usePermission(type === 'lead' ? 'leads.update' : 'contacts.update');
  const canDelete = usePermission(type === 'lead' ? 'leads.delete' : 'contacts.delete');

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [deleteItem, setDeleteItem] = useState(null);

  const fetchContacts = useCallback(
    () =>
      contactsAPI.getAll({
        search: searchQuery || undefined,
        page,
        limit,
        type,
      }),
    [searchQuery, page, limit, type]
  );

  const {
    data: contactsResponse,
    loading: loadingContacts,
    error: contactsError,
    refetch,
  } = useAsyncData(fetchContacts, [fetchContacts], {
    transform: (res) => res?.data ?? { data: [], pagination: { total: 0, totalPages: 1, page, limit } },
  });

  const contacts = contactsResponse?.data ?? [];
  const pagination = contactsResponse?.pagination ?? { total: 0, totalPages: 1, page, limit };

  const createMutation = useMutation((payload) => contactsAPI.create(payload));
  const updateMutation = useMutation((id, payload) => contactsAPI.update(id, payload));
  const deleteMutation = useMutation((id) => contactsAPI.remove(id, { deleted_source: 'manual' }));

  const handleSearch = (value) => {
    setSearchQuery(value || '');
    setPage(1);
  };

  const tableTitle = type === 'lead' ? 'Leads' : 'Contacts';

  const loadingInitial = loadingContacts && contacts.length === 0;

  const totalPages = Math.max(1, pagination.totalPages || 1);

  if (loadingInitial) {
    return (
      <div className={listStyles.page}>
        <PageHeader title={tableTitle} />
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className={listStyles.page}>
      <PageHeader
        title={tableTitle}
        description={role === 'agent' ? 'View and create your assigned leads/contacts' : 'Manage leads/contacts'}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canRead && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const res = await contactsAPI.exportCsv({
                    search: searchQuery || undefined,
                    type,
                  });
                  const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${type === 'lead' ? 'leads' : 'contacts'}_export.csv`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  window.URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </Button>
            )}
            {canCreate && (
              <Button variant="secondary" onClick={() => navigate(type === 'lead' ? '/leads/import' : '/contacts/import')}>
                Import CSV
              </Button>
            )}
            {canCreate ? (
              <Button onClick={() => navigate(type === 'lead' ? '/leads/new' : '/contacts/new')}>
                + Add {type === 'lead' ? 'Lead' : 'Contact'}
              </Button>
            ) : null}
          </div>
        }
      />

      {contactsError && <Alert variant="error">{contactsError}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div className={listStyles.tableCardToolbarLeft} />
          <SearchInput value={searchQuery} onSearch={handleSearch} className={listStyles.searchInToolbar} placeholder="Search... (press Enter)" />
        </div>

        {contacts.length === 0 ? (
          <div className={listStyles.tableCardEmpty}>
            <EmptyState
              icon="📇"
              title={searchQuery ? 'No results found' : `No ${tableTitle} yet`}
              description={searchQuery ? 'Try another search.' : 'Add your first record to get started.'}
              action={
                canCreate && !searchQuery
                  ? () => navigate(type === 'lead' ? '/leads/new' : '/contacts/new')
                  : undefined
              }
              actionLabel={canCreate && !searchQuery ? 'Add New' : undefined}
            />
          </div>
        ) : (
          <div className={listStyles.tableCardBody}>
            <Table variant="adminList">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Display Name</TableHeaderCell>
                  <TableHeaderCell>Primary Phone</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell width="160px" align="center">
                    Actions
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.display_name || c.first_name || c.email || '—'}</TableCell>
                    <TableCell>{c.primary_phone || '—'}</TableCell>
                    <TableCell>{c.email || '—'}</TableCell>
                    <TableCell>{c.type}</TableCell>
                    <TableCell align="center">
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                        {canUpdate && (
                          <Button variant="ghost" size="sm" onClick={() => navigate(type === 'lead' ? `/leads/${c.id}` : `/contacts/${c.id}`)}>
                            Edit
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="danger" size="sm" onClick={() => setDeleteItem(c)}>
                            Delete
                          </Button>
                        )}
                      </div>
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
            onLimitChange={(nextLimit) => {
              setLimit(nextLimit);
              setPage(1);
            }}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => {
          if (!deleteItem) return;
          const result = await deleteMutation.mutate(deleteItem.id);
          if (result?.success) {
            setDeleteItem(null);
            // if we deleted the last item on the page, try stepping back
            if (contacts.length === 1 && page > 1) setPage(page - 1);
            refetch();
          }
        }}
        title={`Delete ${type === 'lead' ? 'Lead' : 'Contact'}`}
        message={`Are you sure you want to delete "${deleteItem?.display_name || deleteItem?.first_name || deleteItem?.email || 'this record'}"?`}
        confirmText="Delete"
        loading={deleteMutation.loading}
      />
    </div>
  );
}

