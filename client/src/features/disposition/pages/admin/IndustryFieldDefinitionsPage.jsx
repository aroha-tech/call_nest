import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { Alert } from '../../../../components/ui/Alert';
import { Spinner } from '../../../../components/ui/Spinner';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../../../../components/ui/Table';
import { Modal, ModalFooter } from '../../../../components/ui/Modal';
import { IconButton } from '../../../../components/ui/IconButton';
import { EditIcon, TrashIcon } from '../../../../components/ui/ActionIcons';
import { useAsyncData, useMutation } from '../../../../hooks/useAsyncData';
import { industriesAPI, industryFieldDefinitionsAPI } from '../../../../services/dispositionAPI';
import listStyles from '../../../../components/admin/adminDataList.module.scss';
import { TableDataRegion } from '../../../../components/admin/TableDataRegion';
import { useTableLoadingState } from '../../../../hooks/useTableLoadingState';
import styles from './IndustryFieldDefinitionsPage.module.scss';

const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'select', label: 'Select (dropdown)' },
  { value: 'multiselect', label: 'Multi-select (checkboxes)' },
  { value: 'multiselect_dropdown', label: 'Multi-select (dropdown)' },
];

function parseOptionsFromHint(text) {
  if (!text || !String(text).trim()) return [];
  return String(text)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Table + modals for one industry’s field definitions (used inside {@link IndustryLeadFieldsHubPage}).
 * @param {Object} props
 * @param {string} props.industryId
 */
export function IndustryFieldDefinitionsView({ industryId }) {
  const fetchIndustry = useCallback(() => industriesAPI.getById(industryId), [industryId]);
  const { data: industryRes, loading: loadingIndustry } = useAsyncData(fetchIndustry, [fetchIndustry], {
    transform: (r) => r?.data?.data ?? null,
  });
  const industry = industryRes;

  const fetchFields = useCallback(
    () => industryFieldDefinitionsAPI.list(industryId),
    [industryId]
  );
  const {
    data: fieldsRes,
    loading: loadingFields,
    error: fieldsError,
    refetch,
  } = useAsyncData(fetchFields, [fetchFields], {
    transform: (r) => r?.data?.data ?? [],
  });
  const fields = Array.isArray(fieldsRes) ? fieldsRes : [];

  const createMut = useMutation((payload) => industryFieldDefinitionsAPI.create(industryId, payload));
  const updateMut = useMutation((id, payload) => industryFieldDefinitionsAPI.update(industryId, id, payload));
  const deleteMut = useMutation((id) => industryFieldDefinitionsAPI.remove(industryId, id));

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    field_key: '',
    label: '',
    type: 'text',
    optionsHint: '',
    sort_order: '0',
    is_required: false,
    is_optional: false,
    is_active: true,
  });
  const [submitError, setSubmitError] = useState(null);

  const openCreate = () => {
    setEditing(null);
    const maxSo =
      fields.length === 0 ? -1 : Math.max(...fields.map((f) => Number(f.sort_order) || 0));
    const nextSort = maxSo + 1;
    setForm({
      field_key: '',
      label: '',
      type: 'text',
      optionsHint: '',
      sort_order: String(nextSort),
      is_required: false,
      is_optional: false,
      is_active: true,
    });
    setSubmitError(null);
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    let optHint = '';
    if (row.options_json != null) {
      try {
        const o = typeof row.options_json === 'string' ? JSON.parse(row.options_json) : row.options_json;
        if (Array.isArray(o)) optHint = o.join(', ');
      } catch {
        optHint = '';
      }
    }
    setForm({
      field_key: row.field_key,
      label: row.label || '',
      type: row.type || 'text',
      optionsHint: optHint,
      sort_order: String(row.sort_order ?? 0),
      is_required: !!row.is_required,
      is_optional: !!row.is_optional,
      is_active: row.is_active !== 0,
    });
    setSubmitError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const needsOptions = ['select', 'multiselect', 'multiselect_dropdown'].includes(form.type);
    const options = needsOptions ? parseOptionsFromHint(form.optionsHint) : undefined;
    if (needsOptions && options.length === 0) {
      setSubmitError('Add at least one option for this field type.');
      return;
    }

    const payload = {
      field_key: form.field_key,
      label: form.label.trim(),
      type: form.type,
      sort_order: parseInt(form.sort_order, 10) || 0,
      is_required: form.is_required ? 1 : 0,
      is_optional: form.is_optional ? 1 : 0,
      is_active: form.is_active ? 1 : 0,
    };
    if (needsOptions) payload.options = options;

    let result;
    if (editing) {
      const { field_key, ...rest } = payload;
      result = await updateMut.mutate(editing.id, rest);
    } else {
      result = await createMut.mutate(payload);
    }

    if (result.success) {
      setModalOpen(false);
      refetch();
    } else {
      setSubmitError(result.error || 'Save failed');
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete field “${row.label}”?`)) return;
    const result = await deleteMut.mutate(row.id);
    if (result.success) refetch();
  };

  const title = useMemo(() => industry?.name || 'Industry', [industry?.name]);
  const sortedFields = useMemo(() => {
    return [...fields].sort((a, b) => {
      const sa = Number(a.sort_order) || 0;
      const sb = Number(b.sort_order) || 0;
      if (sa !== sb) return sa - sb;
      return String(a.label || '').localeCompare(String(b.label || ''), undefined, { sensitivity: 'base' });
    });
  }, [fields]);
  const { hasCompletedInitialFetch } = useTableLoadingState(loadingFields);

  if (!industryId) return null;

  const main = (
    <>
      {loadingIndustry ? <Spinner /> : null}
      {!loadingIndustry && !industry ? <Alert variant="error">Industry not found.</Alert> : null}

      {fieldsError ? <Alert variant="error">{String(fieldsError)}</Alert> : null}

      <div className={listStyles.tableCard}>
        <TableDataRegion loading={loadingFields} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {fields.length === 0 && !loadingFields ? (
            <p className={styles.empty}>
              No fields yet. Add fields that apply to this vertical (e.g. policy dates for insurance).
            </p>
          ) : (
            <Table variant="adminList">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Key</TableHeaderCell>
                  <TableHeaderCell>Label</TableHeaderCell>
                  <TableHeaderCell width="88px">Sort</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Required</TableHeaderCell>
                  <TableHeaderCell>Optional pack</TableHeaderCell>
                  <TableHeaderCell>Active</TableHeaderCell>
                  <TableHeaderCell width="100px" align="center">
                    Actions
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedFields.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.field_key}</TableCell>
                    <TableCell>{row.label}</TableCell>
                    <TableCell>{row.sort_order ?? 0}</TableCell>
                    <TableCell>{FIELD_TYPE_OPTIONS.find((o) => o.value === row.type)?.label || row.type}</TableCell>
                    <TableCell>{row.is_required ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{row.is_optional ? 'Yes' : 'No'}</TableCell>
                    <TableCell>{row.is_active ? 'Yes' : 'No'}</TableCell>
                    <TableCell align="center">
                      <IconButton title="Edit" onClick={() => openEdit(row)}>
                        <EditIcon />
                      </IconButton>
                      <IconButton title="Delete" variant="danger" onClick={() => handleDelete(row)}>
                        <TrashIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableDataRegion>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit industry field' : 'Add industry field'}
        footer={
          <ModalFooter>
            <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="industry-field-def-form"
              loading={createMut.loading || updateMut.loading}
            >
              {editing ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        }
      >
        <form id="industry-field-def-form" onSubmit={handleSubmit} className={styles.form}>
          {submitError ? <Alert variant="error">{submitError}</Alert> : null}
          {!editing ? (
            <Input
              label="Field key"
              value={form.field_key}
              onChange={(e) => setForm((p) => ({ ...p, field_key: e.target.value }))}
              placeholder="e.g. policy_start_date"
              required
            />
          ) : (
            <Input label="Field key" value={form.field_key} disabled readOnly />
          )}
          <Input
            label="Label"
            value={form.label}
            onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
            required
          />
          <Select
            label="Type"
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
            options={FIELD_TYPE_OPTIONS}
          />
          {['select', 'multiselect', 'multiselect_dropdown'].includes(form.type) ? (
            <Input
              label="Options (comma-separated)"
              value={form.optionsHint}
              onChange={(e) => setForm((p) => ({ ...p, optionsHint: e.target.value }))}
              placeholder="e.g. Active, Lapsed, Cancelled"
            />
          ) : null}
          <Input
            label="Sort order"
            value={form.sort_order}
            onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
            hint={
              editing
                ? 'Lower numbers appear first on tenant forms and lists.'
                : 'Prefilled with the next value (max + 1). You can change it before saving.'
            }
          />
          <Checkbox
            label="Required when visible"
            checked={form.is_required}
            onChange={(e) => setForm((p) => ({ ...p, is_required: e.target.checked }))}
          />
          <Checkbox
            label="Optional pack (tenant must enable in Company settings)"
            checked={form.is_optional}
            onChange={(e) => setForm((p) => ({ ...p, is_optional: e.target.checked }))}
          />
          <Checkbox
            label="Active"
            checked={form.is_active}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
          />
        </form>
      </Modal>
    </>
  );

  return (
    <div className={styles.embeddedWrap}>
      <div className={styles.embeddedBar}>
        <h2 className={styles.embeddedTitle}>Fields for {title}</h2>
        <Button type="button" onClick={openCreate}>
          + Add field
        </Button>
      </div>
      {main}
    </div>
  );
}
