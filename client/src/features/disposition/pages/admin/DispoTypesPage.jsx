import React, { useState, useCallback } from 'react';
import { MasterCRUDPage } from '../../components/MasterCRUDPage';
import { useDispoTypes } from '../../hooks/useMasterData';
import { StatusBadge } from '../../../../components/ui/Badge';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'code', label: 'Code', width: '150px' },
  {
    key: 'is_active',
    label: 'Status',
    width: '100px',
    render: (value) => <StatusBadge isActive={value === 1} />,
  },
];

const formFields = [
  { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Connected' },
  { name: 'code', label: 'Code', required: true, placeholder: 'e.g. connected', readOnlyOnEdit: true },
];

export function DispoTypesPage() {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const { 
    dispoTypes, 
    pagination,
    loading, 
    error, 
    refetch, 
    create, 
    update, 
    toggleActive,
    delete: deleteFn 
  } = useDispoTypes({ search, includeInactive: showInactive, page, limit });

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
      title="Disposition Types"
      description="Manage disposition types (e.g. Connected, Callback, Not Interested)"
      data={dispoTypes}
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
      emptyIcon="📊"
      emptyTitle="No disposition types yet"
      emptyDescription="Create disposition types to categorize call outcomes."
    />
  );
}
