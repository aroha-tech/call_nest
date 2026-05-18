import React, { useState, useCallback, useMemo } from 'react';
import { MasterCRUDPage } from '../disposition/components/MasterCRUDPage.jsx';
import masterCrudStyles from '../disposition/components/MasterCRUDPage.module.scss';
import { Checkbox } from '../../components/ui/Checkbox';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { contactCustomFieldsAPI } from '../../services/contactCustomFieldsAPI';

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Select (dropdown)' },
  { value: 'multiselect', label: 'Multi-select (checkboxes)' },
  { value: 'multiselect_dropdown', label: 'Multi-select (dropdown)' },
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

  const [requiredToggleId, setRequiredToggleId] = useState(null);

  const handleRequiredToggle = useCallback(
    async (item, nextChecked) => {
      const id = item.id ?? item.field_id;
      if (!id) return;
      setRequiredToggleId(id);
      try {
        const result = await updateMutation.mutate(id, { is_required: nextChecked });
        if (result?.success) refetch();
      } finally {
        setRequiredToggleId(null);
      }
    },
    [updateMutation, refetch]
  );

  const columns = useMemo(() => [
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
      align: 'center',
      render: (val, item) => {
        const id = item.id ?? item.field_id;
        const busy = requiredToggleId === id;
        return (
          <Checkbox
            checked={!!val}
            variant="table"
            disabled={busy}
            onChange={(e) => {
              e.stopPropagation();
              handleRequiredToggle(item, e.target.checked);
            }}
            aria-label={val ? 'Required — click to make optional' : 'Not required — click to make required'}
            className={masterCrudStyles.tableCheckboxCell}
          />
        );
      },
    },
    {
      key: 'options_json',
      label: 'Options',
      render: (val, item) => {
        if (item.type !== 'select' && item.type !== 'multiselect' && item.type !== 'multiselect_dropdown')
          return '—';
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
  ], [handleRequiredToggle, requiredToggleId]);

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
      label: 'Options (Select / Multi-select)',
      placeholder: 'Comma-separated values, e.g. Hot,Warm,Cold',
      hint: 'Used when type is Select, Multi-select (checkboxes), or Multi-select (dropdown)',
    },
    {
      name: 'is_required',
      label: 'Required on contact forms',
      type: 'checkbox',
      defaultValue: false,
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
      is_required: !!(item.is_required === 1 || item.is_required === true || item.is_required === '1'),
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

