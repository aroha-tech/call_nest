import React, { useState, useCallback } from 'react';
import { MasterCRUDPage } from '../../components/MasterCRUDPage';
import { useTemplateVariablesAdmin } from '../../hooks/useMasterData';
import { StatusBadge } from '../../../../components/ui/Badge';

const MODULE_OPTIONS = [
  { value: 'contact', label: 'Contact' },
  { value: 'agent', label: 'Agent' },
  { value: 'company', label: 'Company' },
  { value: 'system', label: 'System' },
  { value: 'link', label: 'Link' },
];

const columns = [
  { key: 'variable_key', label: 'Variable Key' },
  { key: 'variable_label', label: 'Label' },
  { key: 'module', label: 'Module', width: '100px' },
  {
    key: 'is_active',
    label: 'Status',
    width: '100px',
    render: (value) => <StatusBadge isActive={value === 1} />,
  },
];

const formFields = [
  { name: 'variable_key', label: 'Variable Key', required: true, placeholder: 'e.g. contact_first_name', readOnlyOnEdit: true },
  { name: 'variable_label', label: 'Variable Label', required: true, placeholder: 'e.g. Contact First Name' },
  { name: 'module', label: 'Module', required: true, type: 'select', options: MODULE_OPTIONS },
  { name: 'source_table', label: 'Source Table', placeholder: 'e.g. contacts' },
  { name: 'source_column', label: 'Source Column', placeholder: 'e.g. first_name' },
  { name: 'fallback_value', label: 'Fallback Value', placeholder: 'Optional default' },
  { name: 'sample_value', label: 'Sample / Preview value', placeholder: 'e.g. Rahul or https://... (used in script preview)' },
  { name: 'description', label: 'Description', placeholder: 'Optional description' },
];

export function TemplateVariablesPage() {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const {
    templateVariables,
    pagination,
    loading,
    error,
    refetch,
    create,
    update,
    toggleActive,
    delete: deleteFn,
  } = useTemplateVariablesAdmin({ search, includeInactive: showInactive, page, limit });

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

  const getItemLabel = useCallback((item) => item?.variable_label || item?.variable_key || '', []);

  return (
    <MasterCRUDPage
      title="Template Variables"
      description="System-level variables for call scripts, WhatsApp, email and SMS templates (e.g. {{contact_first_name}})"
      data={templateVariables}
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
      getItemLabel={getItemLabel}
      emptyIcon="📝"
      emptyTitle="No template variables yet"
      emptyDescription="Add variables for use in templates (e.g. {{contact_first_name}})."
    />
  );
}
