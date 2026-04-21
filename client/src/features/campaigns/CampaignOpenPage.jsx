import React, { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { usePermission } from '../../hooks/usePermission';
import { useAsyncData } from '../../hooks/useAsyncData';
import { campaignsAPI } from '../../services/campaignsAPI';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { ViewIcon, RowActionGroup } from '../../components/ui/ActionIcons';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../../components/ui/Table';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import listStyles from '../../components/admin/adminDataList.module.scss';

export function CampaignOpenPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const role = user?.role ?? 'agent';
  const canUpdateLead = usePermission('leads.update');
  const canUpdateContact = usePermission('contacts.update');

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const fetchOpen = useCallback(
    () =>
      campaignsAPI.open(id, {
        page,
        limit,
        search: searchQuery || undefined,
      }),
    [id, page, limit, searchQuery]
  );

  const {
    data: openPayload,
    loading,
    error,
  } = useAsyncData(fetchOpen, [fetchOpen], {
    transform: (res) => ({
      rows: res.data?.data ?? [],
      pagination: res.data?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 },
    }),
  });

  const rows = openPayload?.rows ?? [];
  const pagination = openPayload?.pagination ?? { page: 1, limit: 20, total: 0, totalPages: 1 };

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  if (role !== 'agent') {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Campaign workspace" />
        <Alert variant="info">
          Opening a campaign list with assignment filtering is for agents. Use Leads / Contacts to manage records, or
          return to <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')}>Campaigns</Button>.
        </Alert>
      </div>
    );
  }

  const totalPages = Math.max(1, pagination.totalPages || 1);

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Campaign workspace"
        description="Your assigned records (static = membership; filter = rules)."
        actions={
          <Button variant="secondary" onClick={() => navigate('/campaigns')}>
            ← All campaigns
          </Button>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div className={listStyles.tableCardToolbarLeft} />
          <SearchInput
            value={searchQuery}
            onSearch={(v) => {
              setSearchQuery(v || '');
              setPage(1);
            }}
            className={listStyles.searchInToolbar}
            placeholder="Search name or email…"
          />
        </div>

        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {rows.length === 0 ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="📋"
                title={searchQuery ? 'No matching records' : 'No assigned records in this campaign'}
                description={
                  searchQuery
                    ? 'Try another search.'
                    : 'Ask your admin or manager to assign leads/contacts to you, or add this campaign on static records.'
                }
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
            <Table variant="adminList">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Phone</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Tag</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell width="120px" align="center">
                    Actions
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || '—'}</TableCell>
                    <TableCell>{c.primary_phone || '—'}</TableCell>
                    <TableCell>{c.email || '—'}</TableCell>
                    <TableCell>{c.tag_names || '—'}</TableCell>
                    <TableCell>{c.type}</TableCell>
                    <TableCell align="center">
                      <RowActionGroup>
                        <IconButton
                          size="sm"
                          title={
                            (c.type === 'lead' ? canUpdateLead : canUpdateContact)
                              ? 'Open record'
                              : 'View record'
                          }
                          onClick={() =>
                            navigate(c.type === 'lead' ? `/leads/${c.id}` : `/contacts/${c.id}`)
                          }
                        >
                          <ViewIcon />
                        </IconButton>
                      </RowActionGroup>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </TableDataRegion>

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
