import React, { useState, useCallback, useMemo } from 'react';
import { PageHeader } from '../../../../components/ui/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { SearchInput } from '../../../../components/ui/SearchInput';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../../../components/ui/Table';
import { Modal, ConfirmModal, ModalFooter } from '../../../../components/ui/Modal';
import { StatusBadge, Badge } from '../../../../components/ui/Badge';
import { IconButton } from '../../../../components/ui/IconButton';
import { ViewIcon, EditIcon, PauseIcon, PlayIcon, TrashIcon } from '../../../../components/ui/ActionIcons';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Alert } from '../../../../components/ui/Alert';
import { Pagination, PaginationPageSize } from '../../../../components/ui/Pagination';
import { useDispositions } from '../../hooks/useTenantData';
import { useEmailTemplatesOptions, useWhatsappTemplatesOptions } from '../../hooks/useTenantData';
import { 
  useDispoTypesOptions, 
  useContactStatusesOptions, 
  useContactTemperaturesOptions,
  useDispoActionsOptions,
  useIndustriesOptions 
} from '../../hooks/useMasterData';
import { NEXT_ACTION_OPTIONS, getNextActionLabel, dispositionCodeFromName } from '../../constants';
import styles from '../../components/MasterCRUDPage.module.scss';
import listStyles from '../../../../components/admin/adminDataList.module.scss';
import { useTableLoadingState } from '../../../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../../../components/admin/TableDataRegion';

const ACTION_CODES_REQUIRING_EMAIL_TEMPLATE = ['send_email'];
const ACTION_CODES_REQUIRING_WHATSAPP_TEMPLATE = ['send_whatsapp'];

function dispositionItemToFormData(item) {
  if (!item) return null;
  let parsedActions = [];
  if (item.actions) {
    try {
      parsedActions = typeof item.actions === 'string' ? JSON.parse(item.actions) : item.actions;
    } catch {
      parsedActions = [];
    }
  }
  return {
    dispo_type_id: item.dispo_type_id,
    contact_status_id: item.contact_status_id ?? '',
    contact_temperature_id: item.contact_temperature_id ?? '',
    name: item.name,
    code: item.code,
    next_action: item.next_action || '',
    is_connected: item.is_connected === 1,
    is_active: item.is_active !== 0,
    actions: Array.isArray(parsedActions) ? parsedActions : [],
  };
}

export function DispositionsPage({ readOnly = false }) {
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const {
    dispositions,
    pagination,
    loading,
    error,
    refetch,
    create,
    update,
    delete: deleteFn,
    cloneFromIndustry,
  } = useDispositions({ search, includeInactive: showInactive, page, limit });

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const { data: dispoTypes = [] } = useDispoTypesOptions();
  const { data: contactStatuses = [] } = useContactStatusesOptions();
  const { data: contactTemperatures = [] } = useContactTemperaturesOptions();
  const { data: dispoActions = [] } = useDispoActionsOptions();
  const { data: industries = [] } = useIndustriesOptions();
  const { data: emailTemplates = [] } = useEmailTemplatesOptions();
  const { data: whatsappTemplates = [] } = useWhatsappTemplatesOptions();

  const [showModal, setShowModal] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [toggleItem, setToggleItem] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [formData, setFormData] = useState({
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
  const [cloneIndustryId, setCloneIndustryId] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [viewItem, setViewItem] = useState(null);

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

  const hasNoDispositions = pagination?.total === 0;

  const dispoTypeOptions = dispoTypes.map((d) => ({ value: d.id, label: d.name }));
  const statusOptions = contactStatuses.map((c) => ({ value: c.id, label: c.name }));
  const tempOptions = contactTemperatures.map((c) => ({ value: c.id, label: c.name }));
  const industryOptions = industries.map((i) => ({ value: i.id, label: i.name }));
  const actionOptions = dispoActions.map((a) => ({ value: a.id, label: a.name, code: a.code }));
  const emailTemplateOptions = emailTemplates.map((t) => ({ value: t.id, label: t.name }));
  const whatsappTemplateOptions = whatsappTemplates.map((t) => ({ value: t.id, label: t.name }));

  const openCreateModal = () => {
    setEditingItem(null);
    setFormData({
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
    setFormData(dispositionItemToFormData(item));
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const viewFormData = useMemo(() => dispositionItemToFormData(viewItem), [viewItem]);

  const getActionById = (actionId) => dispoActions.find(a => a.id === actionId);

  const handleAddAction = () => {
    const actions = formData.actions || [];
    if (actions.length >= 3) return;
    setFormData({
      ...formData,
      actions: [...actions, { action_id: '', email_template_id: null, whatsapp_template_id: null }],
    });
  };

  const handleRemoveAction = (index) => {
    const actions = formData.actions || [];
    const newActions = [...actions];
    newActions.splice(index, 1);
    setFormData({ ...formData, actions: newActions });
  };

  const handleActionChange = (index, field, value) => {
    const actions = formData.actions || [];
    const newActions = [...actions];
    newActions[index] = { ...newActions[index], [field]: value || null };
    if (field === 'action_id') {
      newActions[index].email_template_id = null;
      newActions[index].whatsapp_template_id = null;
    }
    setFormData({ ...formData, actions: newActions });
  };

  const validateActions = () => {
    const actions = formData.actions || [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (!action.action_id) continue;
      
      const actionDef = getActionById(action.action_id);
      if (!actionDef) continue;

      if (ACTION_CODES_REQUIRING_EMAIL_TEMPLATE.includes(actionDef.code) && !action.email_template_id) {
        return `Action "${actionDef.name}" requires an email template`;
      }
      if (ACTION_CODES_REQUIRING_WHATSAPP_TEMPLATE.includes(actionDef.code) && !action.whatsapp_template_id) {
        return `Action "${actionDef.name}" requires a WhatsApp template`;
      }
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    const errors = {};
    if (!formData.name) errors.name = 'Name is required';
    if (!formData.code) errors.code = 'Code is required';
    if (!formData.dispo_type_id) errors.dispo_type_id = 'Type is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const actionError = validateActions();
    if (actionError) {
      setSubmitError(actionError);
      return;
    }

    const validActions = (formData.actions || []).filter(a => a.action_id);

    const resolvedCode =
      String(formData.code || '').trim() || dispositionCodeFromName(formData.name);

    const submitData = {
      ...formData,
      code: resolvedCode,
      contact_status_id: formData.contact_status_id || null,
      contact_temperature_id: formData.contact_temperature_id || null,
      next_action: formData.next_action || null,
      actions: validActions.length > 0 ? validActions : null,
      is_active: formData.is_active ? 1 : 0,
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

  const handleClone = async () => {
    if (!cloneIndustryId) return;
    const result = await cloneFromIndustry.mutate(cloneIndustryId, true);
    if (result.success) {
      setShowCloneModal(false);
      setCloneIndustryId('');
      refetch();
    } else {
      setSubmitError(result.error);
    }
  };

  const getUsedActionIds = () => {
    const actions = formData.actions || [];
    return new Set(actions.map(a => a.action_id).filter(Boolean));
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
        title="Dispositions"
        description={
          readOnly
            ? 'View call outcome dispositions (read-only).'
            : 'Manage call outcome dispositions for your team'
        }
        actions={
          !readOnly ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              {hasNoDispositions && (
                <Button variant="secondary" onClick={() => setShowCloneModal(true)}>
                  Import from Template
                </Button>
              )}
              <Button onClick={openCreateModal}>+ Add Disposition</Button>
            </div>
          ) : undefined
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <div className={listStyles.tableCardToolbarLeft}>
            <PaginationPageSize limit={pagination.limit} onLimitChange={handleLimitChange} />
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
          {dispositions.length === 0 ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="📋"
                title={search || showInactive ? 'No results found' : 'No dispositions yet'}
                description={search || showInactive ? 'Try another search or clear filters.' : 'Create dispositions or import from industry templates when you have none.'}
                action={!readOnly && hasNoDispositions ? () => setShowCloneModal(true) : undefined}
                actionLabel="Import from Template"
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell width="100px">Type</TableHeaderCell>
              <TableHeaderCell width="110px">Next Action</TableHeaderCell>
              <TableHeaderCell width="90px">Connected</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
              <TableHeaderCell width="80px">Active</TableHeaderCell>
              {readOnly && <TableHeaderCell width="72px" align="center">Actions</TableHeaderCell>}
              {!readOnly && <TableHeaderCell width="100px" align="center">Manage</TableHeaderCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {dispositions.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div>
                    <span>{item.name}</span>
                    {item.created_from_default_id && (
                      <Badge variant="muted" size="sm" style={{ marginLeft: '8px' }}>Cloned</Badge>
                    )}
                  </div>
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
                {readOnly && (
                  <TableCell align="center">
                    <IconButton title="View disposition details" onClick={() => setViewItem(item)}>
                      <ViewIcon />
                    </IconButton>
                  </TableCell>
                )}
                {!readOnly && (
                  <TableCell align="center">
                    <div className={styles.actions}>
                      <IconButton title="View" onClick={() => setViewItem(item)}>
                        <ViewIcon />
                      </IconButton>
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
                      <IconButton title="Delete" variant="danger" onClick={() => setDeleteItem(item)}>
                        <TrashIcon />
                      </IconButton>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
            </div>
          )}
        </TableDataRegion>
        {pagination && (
          <div className={listStyles.tableCardFooterPagination}>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              hidePageSize
            />
          </div>
        )}
      </div>

      {/* Read-only: same layout as edit/add, all fields disabled, Close only */}
      <Modal
        isOpen={!!viewItem}
        onClose={() => setViewItem(null)}
        title="View disposition"
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setViewItem(null)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        {viewFormData && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <Input
                label="Name"
                value={viewFormData.name || ''}
                disabled
                readOnly
                placeholder="e.g. Interested - Call Back"
              />
              <Select
                label="Disposition Type"
                value={viewFormData.dispo_type_id || ''}
                onChange={() => {}}
                options={dispoTypeOptions}
                disabled
                placeholder="Select..."
              />
              <Select
                label="Contact Status (optional)"
                value={viewFormData.contact_status_id || ''}
                onChange={() => {}}
                options={statusOptions}
                disabled
                placeholder="Select..."
              />
              <Select
                label="Contact Temperature (optional)"
                value={viewFormData.contact_temperature_id || ''}
                onChange={() => {}}
                options={tempOptions}
                disabled
                placeholder="Select..."
              />
              <Select
                label="Next Action (optional)"
                value={viewFormData.next_action || ''}
                onChange={() => {}}
                options={NEXT_ACTION_OPTIONS}
                disabled
                placeholder="Select next action..."
              />
            </div>

            <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
              <Checkbox
                label="Connected (Agent talked with customer)"
                checked={viewFormData.is_connected || false}
                onChange={() => {}}
                disabled
              />
              <Checkbox label="Active" checked={viewFormData.is_active !== false} onChange={() => {}} disabled />
            </div>

            <div style={{ marginTop: '24px', borderTop: '1px solid var(--color-border)', paddingTop: '16px' }}>
              <label style={{ fontWeight: 500, fontSize: '14px', display: 'block', marginBottom: '12px' }}>
                Actions (max 3)
              </label>
              {(viewFormData.actions || []).length === 0 ? (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No actions configured.</p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {viewFormData.actions.map((action, index) => {
                    const actionDef = getActionById(action.action_id);
                    const requiresEmail =
                      actionDef && ACTION_CODES_REQUIRING_EMAIL_TEMPLATE.includes(actionDef.code);
                    const requiresWhatsapp =
                      actionDef && ACTION_CODES_REQUIRING_WHATSAPP_TEMPLATE.includes(actionDef.code);
                    return (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          gap: '8px',
                          alignItems: 'flex-end',
                          background: 'var(--color-surface)',
                          padding: '12px',
                          borderRadius: '6px',
                          flex: '1 1 280px',
                          minWidth: '280px',
                          maxWidth: '100%',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '100px' }}>
                          <Select
                            label={`Action ${index + 1}`}
                            value={action.action_id || ''}
                            onChange={() => {}}
                            options={actionOptions}
                            disabled
                            placeholder="Select action..."
                          />
                        </div>
                        {requiresEmail && (
                          <div style={{ flex: 1, minWidth: '100px' }}>
                            <Select
                              label="Email Template *"
                              value={action.email_template_id || ''}
                              onChange={() => {}}
                              options={emailTemplateOptions}
                              disabled
                              placeholder="Select template..."
                            />
                          </div>
                        )}
                        {requiresWhatsapp && (
                          <div style={{ flex: 1, minWidth: '100px' }}>
                            <Select
                              label="WhatsApp Template *"
                              value={action.whatsapp_template_id || ''}
                              onChange={() => {}}
                              options={whatsappTemplateOptions}
                              disabled
                              placeholder="Select template..."
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? 'Edit Disposition' : 'Create Disposition'}
        size="lg"
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
            <Input label="Name" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} error={formErrors.name} placeholder="e.g. Interested - Call Back" />
            <Select label="Disposition Type" value={formData.dispo_type_id || ''} onChange={(e) => setFormData({ ...formData, dispo_type_id: e.target.value })} options={dispoTypeOptions} error={formErrors.dispo_type_id} />
            <Select label="Contact Status (optional)" value={formData.contact_status_id || ''} onChange={(e) => setFormData({ ...formData, contact_status_id: e.target.value })} options={statusOptions} error={formErrors.contact_status_id} placeholder="Select..." />
            <Select label="Contact Temperature (optional)" value={formData.contact_temperature_id || ''} onChange={(e) => setFormData({ ...formData, contact_temperature_id: e.target.value })} options={tempOptions} error={formErrors.contact_temperature_id} placeholder="Select..." />
            <Select label="Next Action (optional)" value={formData.next_action || ''} onChange={(e) => setFormData({ ...formData, next_action: e.target.value })} options={NEXT_ACTION_OPTIONS} error={formErrors.next_action} placeholder="Select next action..." />
          </div>
          
          <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
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
              {(formData.actions || []).length < 3 && (
                <Button type="button" variant="secondary" size="sm" onClick={handleAddAction}>+ Add Action</Button>
              )}
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '12px', lineHeight: 1.45 }}>
              Add <strong>Apply pipeline / deal</strong> so agents pick the pipeline and stage on the dialer when they use this outcome.
              To attach a deal from the record screen, use <strong>Deals / opportunities</strong> on the contact or lead.
            </p>
            {(formData.actions || []).length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>No actions configured. Click "Add Action" to add one.</p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                {formData.actions.map((action, index) => {
                  const actionDef = getActionById(action.action_id);
                  const requiresEmail = actionDef && ACTION_CODES_REQUIRING_EMAIL_TEMPLATE.includes(actionDef.code);
                  const requiresWhatsapp = actionDef && ACTION_CODES_REQUIRING_WHATSAPP_TEMPLATE.includes(actionDef.code);
                  const usedIds = getUsedActionIds();
                  const availableOptions = actionOptions.filter(opt => !usedIds.has(opt.value) || opt.value === action.action_id);

                  return (
                    <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', background: 'var(--color-surface)', padding: '12px', borderRadius: '6px', flex: '1 1 280px', minWidth: '280px', maxWidth: '100%' }}>
                      <div style={{ flex: 1, minWidth: '100px' }}>
                        <Select
                          label={`Action ${index + 1}`}
                          value={action.action_id || ''}
                          onChange={(e) => handleActionChange(index, 'action_id', e.target.value)}
                          options={availableOptions}
                          placeholder="Select action..."
                        />
                      </div>
                      {requiresEmail && (
                        <div style={{ flex: 1, minWidth: '100px' }}>
                          <Select
                            label="Email Template *"
                            value={action.email_template_id || ''}
                            onChange={(e) => handleActionChange(index, 'email_template_id', e.target.value)}
                            options={emailTemplateOptions}
                            placeholder="Select template..."
                          />
                        </div>
                      )}
                      {requiresWhatsapp && (
                        <div style={{ flex: 1, minWidth: '100px' }}>
                          <Select
                            label="WhatsApp Template *"
                            value={action.whatsapp_template_id || ''}
                            onChange={(e) => handleActionChange(index, 'whatsapp_template_id', e.target.value)}
                            options={whatsappTemplateOptions}
                            placeholder="Select template..."
                          />
                        </div>
                      )}
                      <IconButton type="button" variant="danger" onClick={() => handleRemoveAction(index)} title="Remove">✕</IconButton>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Clone Modal */}
      <Modal
        isOpen={showCloneModal}
        onClose={() => { setShowCloneModal(false); setCloneIndustryId(''); setSubmitError(null); }}
        title="Import from Industry Template"
        size="sm"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowCloneModal(false)}>Cancel</Button>
            <Button onClick={handleClone} loading={cloneFromIndustry.loading} disabled={!cloneIndustryId}>
              Import
            </Button>
          </ModalFooter>
        }
      >
        {submitError && <Alert variant="error">{submitError}</Alert>}
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
          Import all default dispositions and dialing sets from an industry template.
        </p>
        <Select
          label="Select Industry"
          value={cloneIndustryId}
          onChange={(e) => setCloneIndustryId(e.target.value)}
          options={industryOptions}
          placeholder="Choose an industry..."
        />
      </Modal>

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
