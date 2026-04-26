import React, { useState, useCallback } from 'react';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { SearchInput } from '../../../../components/ui/SearchInput';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../../../components/ui/Table';
import { ConfirmModal, ModalFooter } from '../../../../components/ui/Modal';
import { SlidePanel } from '../../../../components/ui/SlidePanel';
import { StatusBadge, Badge } from '../../../../components/ui/Badge';
import { IconButton } from '../../../../components/ui/IconButton';
import { EditIcon, PauseIcon, PlayIcon, TrashIcon } from '../../../../components/ui/ActionIcons';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Alert } from '../../../../components/ui/Alert';
import { Pagination, PaginationPageSize } from '../../../../components/ui/Pagination';
import { useDefaultDispositions } from '../../hooks/useDefaultData';
import { 
  useIndustriesOptions, 
  useDispoTypesOptions, 
  useContactStatusesOptions, 
  useContactTemperaturesOptions, 
  useDispoActionsOptions 
} from '../../hooks/useMasterData';
import { NEXT_ACTION_OPTIONS, getNextActionLabel, dispositionCodeFromName } from '../../constants';
import styles from '../../components/MasterCRUDPage.module.scss';
import listStyles from '../../../../components/admin/adminDataList.module.scss';
import { FilterBar } from '../../../../components/admin/FilterBar';
import { useTableLoadingState } from '../../../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../../../components/admin/TableDataRegion';

export function DefaultDispositionsPage() {
  const [appliedIndustry, setAppliedIndustry] = useState('__all__');
  const [draftIndustry, setDraftIndustry] = useState('__all__');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const { data: industries = [] } = useIndustriesOptions();
  const { data: dispoTypes = [] } = useDispoTypesOptions();
  const { data: contactStatuses = [] } = useContactStatusesOptions();
  const { data: contactTemperatures = [] } = useContactTemperaturesOptions();
  const { data: dispoActions = [] } = useDispoActionsOptions();

  const industryIdParam = appliedIndustry === '__all__' ? null : (appliedIndustry || undefined);

  const {
    defaultDispositions,
    pagination,
    loading,
    error,
    refetch,
    create,
    update,
    delete: deleteFn,
  } = useDefaultDispositions(industryIdParam, { search, includeInactive: showInactive, page, limit });

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [toggleItem, setToggleItem] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);

  const handlePageChange = useCallback((newPage) => setPage(newPage), []);
  const handleLimitChange = useCallback((newLimit) => {
    setLimit(newLimit);
    setPage(1);
  }, []);

  const handleToggleActiveConfirm = useCallback(async () => {
    if (!toggleItem) return;
    setToggleLoading(true);
    const result = await update.mutate(toggleItem.id, { is_active: toggleItem.is_active === 1 ? 0 : 1 });
    setToggleLoading(false);
    if (result?.success !== false) {
      setToggleItem(null);
      refetch();
    }
  }, [toggleItem, update, refetch]);

  const industryOptions = [
    { value: '__all__', label: 'All Industries (Global)' },
    ...industries.map((i) => ({ value: i.id, label: i.name }))
  ];
  /** Empty / __global__ → industry_id null (applies to all industries) */
  const GLOBAL_INDUSTRY_VALUE = '__global__';
  const industryFormOptions = [
    { value: GLOBAL_INDUSTRY_VALUE, label: 'All industries (global)' },
    ...industries.map((i) => ({ value: i.id, label: i.name })),
  ];
  const dispoTypeOptions = dispoTypes.map((d) => ({ value: d.id, label: d.name }));
  const statusOptions = contactStatuses.map((c) => ({ value: c.id, label: c.name }));
  const tempOptions = contactTemperatures.map((c) => ({ value: c.id, label: c.name }));
  const actionOptions = dispoActions.map((a) => ({ value: a.id, label: a.name, code: a.code }));

  const getActionById = (actionId) => dispoActions.find(a => a.id === actionId);

  const openCreateModal = () => {
    const initialIndustry =
      appliedIndustry && appliedIndustry !== '__all__'
        ? appliedIndustry
        : GLOBAL_INDUSTRY_VALUE;
    setEditingItem(null);
    setFormData({
      industry_id: initialIndustry,
      dispo_type_id: '',
      contact_status_id: '',
      contact_temperature_id: '',
      name: '',
      code: '',
      next_action: '',
      is_connected: false,
      is_active: true,
      actions: [],
    });
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    let parsedActions = [];
    if (item.actions) {
      try {
        parsedActions = typeof item.actions === 'string' ? JSON.parse(item.actions) : item.actions;
      } catch (e) {
        parsedActions = [];
      }
    }
    setFormData({
      industry_id: item.industry_id || GLOBAL_INDUSTRY_VALUE,
      dispo_type_id: item.dispo_type_id,
      contact_status_id: item.contact_status_id || '',
      contact_temperature_id: item.contact_temperature_id || '',
      name: item.name,
      code: item.code,
      next_action: item.next_action || '',
      is_connected: item.is_connected === 1,
      is_active: item.is_active !== 0,
      actions: parsedActions,
    });
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const handleAddAction = () => {
    if (formData.actions.length >= 3) return;
    setFormData({
      ...formData,
      actions: [...formData.actions, { action_id: '' }],
    });
  };

  const handleRemoveAction = (index) => {
    const newActions = [...formData.actions];
    newActions.splice(index, 1);
    setFormData({ ...formData, actions: newActions });
  };

  const handleActionChange = (index, actionId) => {
    const newActions = [...formData.actions];
    newActions[index] = { action_id: actionId || null };
    setFormData({ ...formData, actions: newActions });
  };

  const getUsedActionIds = () => new Set(formData.actions.map(a => a.action_id).filter(Boolean));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    const errors = {};
    if (!formData.name) errors.name = 'Name is required';
    if (!formData.dispo_type_id) errors.dispo_type_id = 'Type is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const validActions = (formData.actions || []).filter(a => a.action_id);
    const industryId =
      !formData.industry_id || formData.industry_id === GLOBAL_INDUSTRY_VALUE
        ? null
        : formData.industry_id;
    const resolvedCode =
      String(formData.code || '').trim() || dispositionCodeFromName(formData.name);

    const submitData = {
      ...formData,
      code: resolvedCode,
      industry_id: industryId,
      contact_status_id: formData.contact_status_id || null,
      contact_temperature_id: formData.contact_temperature_id || null,
      next_action: formData.next_action || null,
      actions: validActions.length > 0 ? validActions : null,
      is_active: formData.is_active !== false,
    };

    const result = editingItem
      ? await update.mutate(editingItem.id, submitData)
      : await create.mutate(submitData);

    if (result.success) {
      setShowModal(false);
      refetch();
    } else {
      setSubmitError(result.error);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    const result = await deleteFn.mutate(deleteItem.id);
    if (result.success) {
      setDeleteItem(null);
      refetch();
    } else {
      setDeleteError(result.error || 'Delete failed');
    }
  };

  const getActionDisplayName = (actionId) => {
    const action = getActionById(actionId);
    return action ? action.name : '';
  };

  const getActionsDisplay = (item) => {
    if (!item.actions) return '-';
    try {
      const actions = typeof item.actions === 'string' ? JSON.parse(item.actions) : item.actions;
      if (!actions || actions.length === 0) return '-';
      return actions.map(a => getActionDisplayName(a.action_id)).filter(Boolean).join(', ') || '-';
    } catch {
      return '-';
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Default Dispositions"
        description="Disposition templates that can be cloned by tenants"
        actions={
          <Button onClick={openCreateModal}>+ Add Disposition</Button>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <FilterBar
        onApply={() => {
          setAppliedIndustry(draftIndustry);
          setPage(1);
        }}
        onReset={() => {
          setDraftIndustry('__all__');
          setAppliedIndustry('__all__');
          setPage(1);
        }}
      >
        <Select
          value={draftIndustry}
          onChange={(e) => setDraftIndustry(e.target.value)}
          options={industryOptions}
          placeholder="Select Industry"
          className={styles.industrySelect}
        />
      </FilterBar>

      {!appliedIndustry ? (
        <EmptyState
          icon="🏭"
          title="Select an Industry"
          description="Choose an industry to view and manage its default dispositions."
        />
      ) : (
        <div className={listStyles.tableCard}>
          <div className={listStyles.tableCardToolbarTop}>
            <div className={listStyles.tableCardToolbarLeft}>
              <PaginationPageSize limit={limit} onLimitChange={handleLimitChange} />
              <Checkbox
                label="Show inactive"
                checked={showInactive}
                onChange={(e) => {
                  setShowInactive(e.target.checked);
                  setPage(1);
                }}
              />
            </div>
            <SearchInput
              value={search}
              onSearch={(v) => { setSearch(v); setPage(1); }}
              placeholder="Search... (press Enter)"
              className={listStyles.searchInToolbar}
            />
          </div>
          <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
            {defaultDispositions.length === 0 ? (
              <div className={listStyles.tableCardEmpty}>
                <EmptyState
                  icon="📋"
                  title={search ? 'No results found' : 'No dispositions yet'}
                  description={search ? 'Try a different search.' : 'Create default dispositions for this industry.'}
                  action={!search ? openCreateModal : undefined}
                  actionLabel="Add Disposition"
                />
              </div>
            ) : (
              <div className={listStyles.tableCardBody}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell width="140px">Industry</TableHeaderCell>
                    <TableHeaderCell width="100px">Type</TableHeaderCell>
                    <TableHeaderCell width="110px">Next Action</TableHeaderCell>
                    <TableHeaderCell width="90px">Connected</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                    <TableHeaderCell width="80px">Active</TableHeaderCell>
                    <TableHeaderCell width="100px" align="center">Manage</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {defaultDispositions.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        {item.industry_name || (item.industry_id ? '—' : 'Global')}
                      </TableCell>
                      <TableCell><Badge variant="primary">{item.dispo_type_name}</Badge></TableCell>
                      <TableCell>{getNextActionLabel(item.next_action)}</TableCell>
                      <TableCell>
                        <Badge variant={item.is_connected === 1 ? 'success' : 'muted'}>
                          {item.is_connected === 1 ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                          {getActionsDisplay(item)}
                        </span>
                      </TableCell>
                      <TableCell><StatusBadge isActive={item.is_active === 1} /></TableCell>
                      <TableCell align="center">
                        <div className={styles.actions}>
                          <IconButton title="Edit" onClick={() => openEditModal(item)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton
                            title={item.is_active === 1 ? 'Deactivate' : 'Activate'}
                            variant={item.is_active === 1 ? 'warning' : 'success'}
                            onClick={() => setToggleItem(item)}
                            disabled={toggleLoading}
                          >
                            {item.is_active === 1 ? <PauseIcon /> : <PlayIcon />}
                          </IconButton>
                          <IconButton title="Delete" variant="danger" onClick={() => { setDeleteItem(item); setDeleteError(null); }}>
                            <TrashIcon />
                          </IconButton>
                        </div>
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
              page={pagination?.page ?? 1}
              totalPages={pagination?.totalPages ?? 1}
              total={pagination?.total ?? 0}
              limit={limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              hidePageSize
            />
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <SlidePanel
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? 'Edit Disposition' : 'Create Disposition'}
        size="xl"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={create.loading || update.loading}>
              {editingItem ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        }
      >
        <form onSubmit={handleSubmit}>
          {submitError && <Alert variant="error" style={{ marginBottom: '16px' }}>{submitError}</Alert>}
          
          {/* Form Grid - 2 columns on desktop, 1 on mobile */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            <Select
              label="Industry scope"
              value={formData.industry_id || GLOBAL_INDUSTRY_VALUE}
              onChange={(e) => setFormData({ ...formData, industry_id: e.target.value })}
              options={industryFormOptions}
              error={formErrors.industry_id}
            />
            <Input
              label="Name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={formErrors.name}
              placeholder="e.g. Interested - Call Back"
            />
            <Select
              label="Disposition Type"
              value={formData.dispo_type_id || ''}
              onChange={(e) => setFormData({ ...formData, dispo_type_id: e.target.value })}
              options={dispoTypeOptions}
              error={formErrors.dispo_type_id}
            />
            <Select
              label="Contact Status (optional)"
              value={formData.contact_status_id || ''}
              onChange={(e) => setFormData({ ...formData, contact_status_id: e.target.value })}
              options={statusOptions}
              error={formErrors.contact_status_id}
              placeholder="Select..."
            />
            <Select
              label="Contact Temperature (optional)"
              value={formData.contact_temperature_id || ''}
              onChange={(e) => setFormData({ ...formData, contact_temperature_id: e.target.value })}
              options={tempOptions}
              error={formErrors.contact_temperature_id}
              placeholder="Select..."
            />
            <Select
              label="Next Action (optional)"
              value={formData.next_action || ''}
              onChange={(e) => setFormData({ ...formData, next_action: e.target.value })}
              options={NEXT_ACTION_OPTIONS}
              error={formErrors.next_action}
              placeholder="Select next action..."
            />
          </div>
          
          <div style={{ marginTop: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <Checkbox
              label="Connected (Agent talked with customer)"
              checked={formData.is_connected || false}
              onChange={(e) => setFormData({ ...formData, is_connected: e.target.checked })}
            />
            <Checkbox
              label="Active"
              checked={formData.is_active !== false}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            />
          </div>

          {/* Actions Section */}
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <label style={{ fontWeight: 500, fontSize: '14px' }}>Actions (max 3)</label>
              {formData?.actions?.length < 3 && (
                <Button type="button" variant="secondary" size="sm" onClick={handleAddAction}>+ Add Action</Button>
              )}
            </div>
            
            {formData?.actions?.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No actions configured. Click "Add Action" to add one.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {formData?.actions?.map((action, index) => {
                  const usedIds = getUsedActionIds();
                  const availableOptions = actionOptions.filter(opt => !usedIds.has(opt.value) || opt.value === action.action_id);

                  return (
                    <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', background: 'var(--color-surface)', padding: '12px', borderRadius: '6px', flex: '1 1 200px', minWidth: '200px', maxWidth: '100%' }}>
                      <div style={{ flex: 1 }}>
                        <Select
                          label={`Action ${index + 1}`}
                          value={action.action_id || ''}
                          onChange={(e) => handleActionChange(index, e.target.value)}
                          options={availableOptions}
                          placeholder="Select action..."
                        />
                      </div>
                      <IconButton type="button" variant="danger" onClick={() => handleRemoveAction(index)} title="Remove">✕</IconButton>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>
      </SlidePanel>

      <ConfirmModal
        isOpen={!!toggleItem}
        onClose={() => setToggleItem(null)}
        onConfirm={handleToggleActiveConfirm}
        title={toggleItem?.is_active === 1 ? 'Deactivate Disposition' : 'Activate Disposition'}
        message={
          toggleItem
            ? toggleItem.is_active === 1
              ? `Are you sure you want to deactivate "${toggleItem.name}"? It will be hidden from active lists.`
              : `Are you sure you want to activate "${toggleItem.name}"? It will be visible in active lists.`
            : ''
        }
        confirmText={toggleItem?.is_active === 1 ? 'Deactivate' : 'Activate'}
        loading={toggleLoading}
      />

      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => { setDeleteItem(null); setDeleteError(null); }}
        onConfirm={handleDelete}
        title="Delete Disposition"
        message={
          deleteError
            ? deleteError
            : `Delete "${deleteItem?.name}"? This cannot be undone.`
        }
        confirmText="Delete"
        loading={deleteFn.loading}
      />
    </div>
  );
}
