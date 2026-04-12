import React, { useState, useCallback, useMemo } from 'react';
import { MasterCRUDPage } from '../../components/MasterCRUDPage';
import { useCampaignStatuses } from '../../hooks/useMasterData';
import { StatusBadge } from '../../../../components/ui/Badge';
import { useDateTimeDisplay } from '../../../../hooks/useDateTimeDisplay';

const formFields = [
  { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Planning' },
  { name: 'code', label: 'Code', required: true, placeholder: 'e.g. planning', readOnlyOnEdit: true },
];

export function CampaignStatusesPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const columns = useMemo(
    () => [
      { key: 'name', label: 'Name', width: '20%' },
      { key: 'code', label: 'Code', width: '18%' },
      {
        key: 'is_active',
        label: 'Status',
        width: '100px',
        render: (value) => <StatusBadge isActive={value === 1} />,
      },
      {
        key: 'created_at',
        label: 'Created',
        width: '130px',
        render: (v) => formatDateTime(v),
      },
      {
        key: 'updated_at',
        label: 'Updated',
        width: '130px',
        render: (v) => formatDateTime(v),
      },
    ],
    [formatDateTime]
  );

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const {
    campaignStatuses,
    pagination,
    loading,
    error,
    refetch,
    create,
    update,
    toggleActive,
    delete: deleteFn,
  } = useCampaignStatuses({ search, includeInactive: showInactive, page, limit });

  const handleSearch = useCallback((value) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleShowInactiveChange = useCallback((checked) => {
    setShowInactive(checked);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage) => {
    setPage(newPage);
  }, []);

  const handleLimitChange = useCallback((newLimit) => {
    setLimit(newLimit);
    setPage(1);
  }, []);

  return (
    <MasterCRUDPage
      title="Campaign statuses"
      description="Lifecycle labels (e.g. Planning, Active, Complete). Separate from dialer Active/Paused."
      data={campaignStatuses}
      loading={loading}
      error={error}
      columns={columns}
      formFields={formFields}
      onCreate={create}
      onUpdate={update}
      onToggleActive={toggleActive}
      onDelete={deleteFn}
      refetch={refetch}
      pagination={pagination}
      onPageChange={handlePageChange}
      onLimitChange={handleLimitChange}
      onSearch={handleSearch}
      search={search}
      showInactive={showInactive}
      onShowInactiveChange={handleShowInactiveChange}
      emptyIcon="📋"
      emptyTitle="No campaign statuses yet"
      emptyDescription="Create statuses for CRM-style campaign lifecycle."
    />
  );
}
