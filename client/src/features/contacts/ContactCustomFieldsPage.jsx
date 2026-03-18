import React, { useState, useCallback } from 'react';
import { MasterCRUDPage } from '../disposition/components/MasterCRUDPage.jsx';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { contactCustomFieldsAPI } from '../../services/contactCustomFieldsAPI';

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Select (dropdown)' },
];

export function ContactCustomFieldsPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const fetchFn = useCallback(
    () =>
      contactCustomFieldsAPI.getAll({
        includeInactive: showInactive,
        page,
        limit,
      }),
    [showInactive, page, limit]
  );

  const {
    data: response,
    loading,
    error,
    refetch,
  } = useAsyncData(fetchFn, [fetchFn], {
    transform: (res) => res?.data ?? { data: [], pagination: { page, limit, total: 0, totalPages: 1 } },
  });

  const data = response?.data ?? [];
  const pagination = response?.pagination ?? { page, limit, total: 0, totalPages: 1 };

  const createMutation = useMutation((payload) => contactCustomFieldsAPI.create(payload));
  const updateMutation = useMutation((id, payload) => contactCustomFieldsAPI.update(id, payload));
  const deleteMutation = useMutation((id) => contactCustomFieldsAPI.remove(id));
  const activateMutation = useMutation((id) => contactCustomFieldsAPI.activate(id));
  const deactivateMutation = useMutation((id) => contactCustomFieldsAPI.deactivate(id));

  const columns = [
    { key: 'name', label: 'Key', width: '20%' },
    { key: 'label', label: 'Label', width: '25%' },
    {
      key: 'type',
      label: 'Type',
      width: '15%',
      render: (val) => {
        const opt = FIELD_TYPE_OPTIONS.find((o) => o.value === val);
        return opt ? opt.label : val;
      },
    },
    {
      key: 'is_required',
      label: 'Required',
      width: '10%',
      render: (val) => (val ? 'Yes' : 'No'),
    },
    {
      key: 'options_json',
      label: 'Options',
      render: (val, item) => {
        if (item.type !== 'select') return '—';
        try {
          const arr =
            typeof val === 'string'
              ? JSON.parse(val)
              : Array.isArray(val)
                ? val
                : Array.isArray(val?.values)
                  ? val.values
                  : [];
          if (!arr.length) return '—';
          return arr.join(', ');
        } catch {
          return String(val ?? '—');
        }
      },
    },
  ];

  const formFields = [
    {
      name: 'name',
      label: 'Field key',
      required: true,
      placeholder: 'e.g. property_type',
      readOnlyOnEdit: true,
    },
    {
      name: 'label',
      label: 'Label',
      required: true,
      placeholder: 'Label shown in forms',
    },
    {
      name: 'type',
      label: 'Type',
      required: true,
      type: 'select',
      options: FIELD_TYPE_OPTIONS,
      defaultValue: 'text',
    },
    {
      name: 'options',
      label: 'Options (for Select)',
      placeholder: 'Comma-separated values, e.g. Hot,Warm,Cold',
      hint: 'Only used when type = Select',
    },
    {
      name: 'is_required',
      label: 'Required?',
      placeholder: '0 or 1',
    },
  ];

  const onPageChange = (newPage) => setPage(newPage);
  const onLimitChange = (newLimit) => {
    setLimit(newLimit);
    setPage(1);
  };

  const handleSearch = (value) => {
    setSearch(value || '');
    setPage(1);
  };

  const mappedData = data
    .filter((item) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        String(item.name || '').toLowerCase().includes(q) ||
        String(item.label || '').toLowerCase().includes(q)
      );
    })
    .map((item) => ({
      ...item,
      is_required: item.is_required ? 1 : 0,
    }));

  return (
    <MasterCRUDPage
      title="Contact Custom Fields"
      description="Configure additional fields for leads and contacts."
      data={mappedData}
      loading={loading}
      error={error}
      columns={columns}
      formFields={formFields}
      onCreate={createMutation}
      onUpdate={updateMutation}
      onDelete={deleteMutation}
      onToggleActive={{
        mutate: async (id) => {
          const row = data.find((r) => r.id === id || r.field_id === id);
          if (!row) return { success: false, error: 'Field not found' };
          const fn = row.is_active ? deactivateMutation : activateMutation;
          return fn.mutate(id);
        },
        loading: activateMutation.loading || deactivateMutation.loading,
      }}
      refetch={refetch}
      pagination={{
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: pagination.totalPages,
      }}
      onPageChange={onPageChange}
      onLimitChange={onLimitChange}
      onSearch={handleSearch}
      search={search}
      showInactive={showInactive}
      onShowInactiveChange={setShowInactive}
      emptyIcon="🧩"
      emptyTitle="No custom fields"
      emptyDescription="Add custom fields to capture tenant-specific information on contacts and leads."
      getItemLabel={(item) => (!item ? '' : item.label || item.name || '')}
    />
  );
}

