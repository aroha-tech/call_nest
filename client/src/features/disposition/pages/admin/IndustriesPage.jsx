import React, { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { MasterCRUDPage } from '../../components/MasterCRUDPage';
import { useIndustries } from '../../hooks/useMasterData';
import { StatusBadge } from '../../../../components/ui/Badge';
import { useDateTimeDisplay } from '../../../../hooks/useDateTimeDisplay';

const formFields = [
  { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Real Estate' },
  { name: 'code', label: 'Code', required: true, placeholder: 'e.g. real_estate', readOnlyOnEdit: true },
];

export function IndustriesPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const columns = useMemo(
    () => [
      { key: 'name', label: 'Name', width: '18%' },
      { key: 'code', label: 'Code', width: '16%' },
      {
        key: 'is_active',
        label: 'Status',
        width: '100px',
        render: (value) => <StatusBadge isActive={value === 1} />,
      },
      {
        key: 'created_at',
        label: 'Created',
        width: '128px',
        render: (v) => formatDateTime(v),
      },
      {
        key: 'updated_at',
        label: 'Updated',
        width: '128px',
        render: (v) => formatDateTime(v),
      },
      {
        key: 'fields_nav',
        label: 'Lead fields',
        width: '120px',
        noTruncate: true,
        render: (_, item) => (
          <Link to={`/admin/masters/industries/${item.id}/fields`}>Manage fields</Link>
        ),
      },
    ],
    [formatDateTime]
  );

  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const { 
    industries, 
    pagination,
    loading, 
    error, 
    refetch, 
    create, 
    update, 
    toggleActive,
    delete: deleteFn 
  } = useIndustries({ search, includeInactive: showInactive, page, limit });

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
      title="Industries"
      description="Manage industries for disposition templates"
      data={industries}
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
      emptyIcon="🏭"
      emptyTitle="No industries yet"
      emptyDescription="Create industries to organize your disposition templates."
    />
  );
}
