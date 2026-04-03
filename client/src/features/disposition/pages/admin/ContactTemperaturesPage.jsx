import React, { useState, useCallback, useMemo } from 'react';
import { MasterCRUDPage } from '../../components/MasterCRUDPage';
import { useContactTemperatures } from '../../hooks/useMasterData';
import { StatusBadge } from '../../../../components/ui/Badge';
import { useDateTimeDisplay } from '../../../../hooks/useDateTimeDisplay';

const formFields = [
  { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Hot' },
  { name: 'code', label: 'Code', required: true, placeholder: 'e.g. hot', readOnlyOnEdit: true },
];

export function ContactTemperaturesPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const columns = useMemo(
    () => [
      { key: 'name', label: 'Name', width: '16%' },
      { key: 'code', label: 'Code', width: '140px' },
      { key: 'priority_order', label: 'Priority', width: '80px' },
      {
        key: 'is_active',
        label: 'Status',
        width: '100px',
        render: (value) => <StatusBadge isActive={value === 1} />,
      },
      {
        key: 'created_at',
        label: 'Created',
        width: '120px',
        render: (v) => formatDateTime(v),
      },
      {
        key: 'updated_at',
        label: 'Updated',
        width: '120px',
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
    contactTemperatures, 
    pagination,
    loading, 
    error, 
    refetch, 
    create, 
    update, 
    toggleActive,
    delete: deleteFn 
  } = useContactTemperatures({ search, includeInactive: showInactive, page, limit });

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
      title="Contact Temperatures"
      description="Manage lead temperature levels (e.g. Hot, Warm, Cold)"
      data={contactTemperatures}
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
      emptyIcon="🌡️"
      emptyTitle="No contact temperatures yet"
      emptyDescription="Create temperature levels to prioritize leads."
    />
  );
}
