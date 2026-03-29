import React, { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { Modal, ConfirmModal, ModalFooter } from '../../components/ui/Modal';
import { IconButton } from '../../components/ui/IconButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Checkbox } from '../../components/ui/Checkbox';
import { whatsappTemplatesAPI, whatsappAccountsAPI, whatsappSettingsAPI } from '../../services/whatsappAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import styles from '../../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';
import { FilterBar } from '../../components/admin/FilterBar';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { Spinner } from '../../components/ui/Spinner';

const COMPONENT_TYPES = [
  { value: 'HEADER', label: 'HEADER' },
  { value: 'BODY', label: 'BODY' },
  { value: 'FOOTER', label: 'FOOTER' },
];

const TEMPLATE_CATEGORIES = [
  { value: 'MARKETING', label: 'MARKETING' },
  { value: 'UTILITY', label: 'UTILITY' },
  { value: 'AUTHENTICATION', label: 'AUTHENTICATION' },
];

const TEMPLATE_LANGUAGES = [
  { value: 'en', label: 'English (en)' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'hi', label: 'Hindi (hi)' },
  { value: 'gu', label: 'Gujarati (gu)' },
  { value: 'mr', label: 'Marathi (mr)' },
  { value: 'ta', label: 'Tamil (ta)' },
  { value: 'te', label: 'Telugu (te)' },
  { value: 'bn', label: 'Bengali (bn)' },
  { value: 'kn', label: 'Kannada (kn)' },
  { value: 'ml', label: 'Malayalam (ml)' },
  { value: 'pa', label: 'Punjabi (pa)' },
  { value: 'es', label: 'Spanish (es)' },
  { value: 'pt', label: 'Portuguese (pt)' },
  { value: 'pt_BR', label: 'Portuguese (Brazil)' },
  { value: 'fr', label: 'French (fr)' },
  { value: 'de', label: 'German (de)' },
  { value: 'ar', label: 'Arabic (ar)' },
  { value: 'id', label: 'Indonesian (id)' },
  { value: 'th', label: 'Thai (th)' },
  { value: 'vi', label: 'Vietnamese (vi)' },
  { value: 'tr', label: 'Turkish (tr)' },
  { value: 'ru', label: 'Russian (ru)' },
  { value: 'ja', label: 'Japanese (ja)' },
  { value: 'ko', label: 'Korean (ko)' },
  { value: 'zh_CN', label: 'Chinese (Simplified)' },
  { value: 'zh_HK', label: 'Chinese (Hong Kong)' },
];

export function WhatsAppTemplatesPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [appliedAccount, setAppliedAccount] = useState('__all__');
  const [draftAccount, setDraftAccount] = useState('__all__');
  const fetchTemplates = useCallback(
    () =>
      whatsappTemplatesAPI.getAll(
        showInactive,
        appliedAccount === '__all__' ? null : appliedAccount
      ),
    [showInactive, appliedAccount]
  );
  const { data: templates, loading, error, refetch } = useAsyncData(fetchTemplates, [
    showInactive,
    appliedAccount,
  ]);
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);
  const fetchAccounts = useCallback(() => whatsappAccountsAPI.getAll(true), []);
  const { data: accounts } = useAsyncData(fetchAccounts, []);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    template_name: '',
    provider_template_id: '',
    category: 'UTILITY',
    language: 'en',
    whatsapp_account_id: '',
    status: 'active',
    template_mode: 'automatic',
    cooldown_days: '',
    cooldown_hours: '',
    components: [{ component_type: 'BODY', component_text: '', component_order: 1 }],
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editLoadError, setEditLoadError] = useState(null);

  const [showFetchModal, setShowFetchModal] = useState(false);
  const [fetchAccountId, setFetchAccountId] = useState('');
  const [fetchWabaId, setFetchWabaId] = useState('');
  const [fetchList, setFetchList] = useState([]);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [fetchAttempted, setFetchAttempted] = useState(false);
  const [importingId, setImportingId] = useState(null);
  const [moduleEnabled, setModuleEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    whatsappSettingsAPI
      .getSettings()
      .then((res) => {
        if (!cancelled) {
          const enabled = res?.data?.data?.automationEnabled !== undefined ? !!res.data.data.automationEnabled : true;
          setModuleEnabled(enabled);
        }
      })
      .catch(() => {
        if (!cancelled) setModuleEnabled(true);
      });
    return () => { cancelled = true; };
  }, []);

  const createMutation = useMutation(whatsappTemplatesAPI.create);
  const updateMutation = useMutation((id, data) => whatsappTemplatesAPI.update(id, data));
  const deleteMutation = useMutation(whatsappTemplatesAPI.delete);
  const activateMutation = useMutation(whatsappTemplatesAPI.activate);
  const deactivateMutation = useMutation(whatsappTemplatesAPI.deactivate);

  const openCreate = () => {
    setEditLoadError(null);
    setEditingItem(null);
    setFormData({
      template_name: '',
      provider_template_id: '',
      category: 'UTILITY',
      language: 'en',
      whatsapp_account_id: accounts?.[0]?.id ? String(accounts[0].id) : '',
      status: 'active',
      template_mode: 'automatic',
      cooldown_days: '',
      cooldown_hours: '',
      components: [{ component_type: 'BODY', component_text: '', component_order: 1 }],
    });
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditLoadError(null);
    // List API does not include components; fetch full template so Header/Body/Footer load in the form
    setEditLoading(true);
    whatsappTemplatesAPI
      .getById(row.id)
      .then((res) => {
        const template = res?.data?.data;
        if (!template) return;
        setEditingItem(template);
        const comps = (template.components && template.components.length)
          ? template.components.map((c) => ({
              component_type: c.component_type,
              component_text: c.component_text || '',
              component_order: c.component_order ?? 1,
            }))
          : [{ component_type: 'BODY', component_text: '', component_order: 1 }];
        setFormData({
          template_name: template.template_name || '',
          provider_template_id: template.provider_template_id || '',
          category: template.category || '',
          language: template.language || 'en',
          whatsapp_account_id: template.whatsapp_account_id ? String(template.whatsapp_account_id) : '',
          status: template.status || 'active',
          template_mode: template.template_mode || 'automatic',
          cooldown_days:
            template.cooldown_days !== undefined && template.cooldown_days !== null
              ? String(template.cooldown_days)
              : '',
          cooldown_hours:
            template.cooldown_hours !== undefined && template.cooldown_hours !== null
              ? String(template.cooldown_hours)
              : '',
          components: comps,
        });
        setFormErrors({});
        setSubmitError(null);
        setShowModal(true);
      })
      .catch(() => setEditLoadError('Failed to load template for edit'))
      .finally(() => setEditLoading(false));
  };

  const setComponent = (index, field, value) => {
    const next = [...formData.components];
    next[index] = { ...next[index], [field]: value };
    setFormData({ ...formData, components: next });
  };

  const addComponent = () => {
    setFormData({
      ...formData,
      components: [...formData.components, { component_type: 'BODY', component_text: '', component_order: formData.components.length + 1 }],
    });
  };

  const addComponentOfType = (type) => {
    setFormData({
      ...formData,
      components: [...formData.components, { component_type: type, component_text: '', component_order: formData.components.length + 1 }],
    });
  };

  const removeComponent = (index) => {
    if (formData.components.length <= 1) return;
    setFormData({
      ...formData,
      components: formData.components.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!formData.template_name?.trim()) errs.template_name = 'Template name is required';
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = {
      template_name: formData.template_name.trim(),
      provider_template_id: formData.provider_template_id?.trim() || null,
      category: formData.category?.trim() || null,
      language: formData.language || 'en',
      whatsapp_account_id: formData.whatsapp_account_id ? Number(formData.whatsapp_account_id) : null,
      status: formData.status || 'active',
      template_mode: formData.template_mode || 'automatic',
      cooldown_days:
        formData.cooldown_days !== '' && formData.cooldown_days != null
          ? Number(formData.cooldown_days)
          : null,
      cooldown_hours:
        formData.cooldown_hours !== '' && formData.cooldown_hours != null
          ? Number(formData.cooldown_hours)
          : null,
      components: formData.components.map((c, i) => ({
        component_type: c.component_type,
        component_text: c.component_text?.trim() || null,
        component_order: i + 1,
      })),
    };

    const result = editingItem
      ? await updateMutation.mutate(editingItem.id, payload)
      : await createMutation.mutate(payload);

    if (result?.success) {
      setShowModal(false);
      refetch();
    } else {
      setSubmitError(result?.error || 'Save failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleteError(null);
    const result = await deleteMutation.mutate(deleteItem.id);
    if (result?.success) {
      setDeleteItem(null);
      refetch();
    } else {
      setDeleteError(result?.error || 'Delete failed');
    }
  };

  const handleActivateConfirm = async () => {
    if (!confirmAction?.id) return;
    await activateMutation.mutate(confirmAction.id);
    setConfirmAction(null);
    refetch();
  };

  const handleDeactivateConfirm = async () => {
    if (!confirmAction?.id) return;
    await deactivateMutation.mutate(confirmAction.id);
    setConfirmAction(null);
    refetch();
  };

  const openFetchModal = () => {
    setFetchAccountId(accounts?.[0]?.id ? String(accounts[0].id) : '');
    setFetchWabaId('');
    setFetchList([]);
    setFetchError(null);
    setFetchAttempted(false);
    setShowFetchModal(true);
  };

  const handleFetchFromProvider = async () => {
    if (!fetchAccountId) {
      setFetchError('Select a WhatsApp account');
      return;
    }
    setFetchError(null);
    setFetchLoading(true);
    setFetchAttempted(true);
    try {
      const res = await whatsappAccountsAPI.getTemplatesFromProvider(fetchAccountId, {
        waba_id: fetchWabaId?.trim() || undefined,
      });
      setFetchList(res?.data?.data || []);
    } catch (err) {
      setFetchError(err.response?.data?.error || err.message || 'Failed to fetch templates');
      setFetchList([]);
    } finally {
      setFetchLoading(false);
    }
  };

  const handleImportTemplate = async (row) => {
    if (!fetchAccountId) return;
    setFetchError(null);
    setImportingId(row.provider_template_id);
    const payload = {
      whatsapp_account_id: Number(fetchAccountId),
      template_name: row.template_name,
      provider_template_id: row.provider_template_id || null,
      language: row.language || 'en',
      category: row.category || null,
      status: 'active',
      components: (row.components || []).map((c, i) => ({
        component_type: c.component_type || 'BODY',
        component_text: c.component_text || '',
        component_order: c.component_order ?? i + 1,
      })),
    };
    const result = await createMutation.mutate(payload);
    setImportingId(null);
    if (result?.success) {
      refetch();
      setFetchList((prev) => prev.filter((t) => t.provider_template_id !== row.provider_template_id));
    } else {
      setFetchError(result?.error || 'Import failed. This template may already exist (same name and language).');
    }
  };

  const accountOptions = (accounts || []).map((a) => ({ value: String(a.id), label: `${a.phone_number} (${a.provider || 'meta'})` }));
  const selectedAccount = accounts?.find((a) => String(a.id) === fetchAccountId);
  const fetchAccountOptions = (accounts || [])
    .filter((a) => (a.provider || '').toLowerCase() !== 'manual')
    .map((a) => ({ value: String(a.id), label: `${a.phone_number} (${a.provider || 'meta'})` }));
  const isMetaAccount = selectedAccount?.provider?.toLowerCase() === 'meta';

  return (
    <div className={styles.page}>
      <PageHeader
        title="WhatsApp Templates"
        description="Manage Meta-approved templates for template messages"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {moduleEnabled && (
              <Button variant="secondary" onClick={openFetchModal}>Fetch from provider</Button>
            )}
            <Button onClick={openCreate}>+ Add Template</Button>
          </div>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}
      {editLoadError && <Alert variant="error">{editLoadError}</Alert>}

      <FilterBar
        onApply={() => setAppliedAccount(draftAccount)}
        onReset={() => {
          setDraftAccount('__all__');
          setAppliedAccount('__all__');
        }}
      >
        <Select
          label="Account"
          value={draftAccount}
          onChange={(e) => setDraftAccount(e.target.value)}
          options={[
            { value: '__all__', label: 'All accounts' },
            ...(accountOptions || []),
          ]}
        />
      </FilterBar>

      <div className={listStyles.tableToolbarCheckboxOnly}>
        <Checkbox
          id="show-inactive-templates"
          label="Show inactive"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
      </div>

      <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
        {!templates?.length ? (
          <EmptyState
            icon="📄"
            title="No WhatsApp templates"
            description="Add a template to send template messages."
            action={openCreate}
            actionLabel="Add Template"
          />
        ) : (
          <div className={listStyles.tableScrollAreaNatural}>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Account</TableHeaderCell>
              <TableHeaderCell>Provider</TableHeaderCell>
              <TableHeaderCell>Language</TableHeaderCell>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell width="180px" align="center">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.template_name}</TableCell>
                <TableCell>{row.account_phone || '—'}</TableCell>
                <TableCell>{row.account_provider || '—'}</TableCell>
                <TableCell>{row.language || 'en'}</TableCell>
                <TableCell>{row.category || '—'}</TableCell>
                <TableCell>
                  <Badge variant={row.status === 'active' ? 'success' : 'muted'}>{row.status}</Badge>
                </TableCell>
                <TableCell align="center">
                  <div className={styles.actions}>
                    {row.status === 'inactive' ? (
                      <IconButton size="sm" variant="success" title="Activate" onClick={() => setConfirmAction({ id: row.id, action: 'activate', name: row.template_name })}>▶️</IconButton>
                    ) : (
                      <IconButton size="sm" variant="warning" title="Deactivate" onClick={() => setConfirmAction({ id: row.id, action: 'deactivate', name: row.template_name })}>⏸️</IconButton>
                    )}
                    <IconButton size="sm" title="Edit" onClick={() => openEdit(row)} disabled={editLoading}>✏️</IconButton>
                    <IconButton size="sm" variant="danger" title="Delete" onClick={() => { setDeleteItem(row); setDeleteError(null); }}>🗑️</IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
          </div>
        )}
      </TableDataRegion>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? 'Edit Template' : 'Add Template'}
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.loading || updateMutation.loading}>Save</Button>
          </ModalFooter>
        }
      >
        <form onSubmit={handleSubmit} className={styles.form}>
          {submitError && <Alert variant="error">{submitError}</Alert>}
          <Input
            label="Template name"
            value={formData.template_name}
            onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
            error={formErrors.template_name}
            placeholder="As in Meta Business Manager"
          />
          <Input
            label="Provider template ID"
            value={formData.provider_template_id}
            onChange={(e) => setFormData({ ...formData, provider_template_id: e.target.value })}
            placeholder="Optional"
          />
          <Select
            label="Category"
            value={formData.category || 'UTILITY'}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            options={TEMPLATE_CATEGORIES}
          />
          <Select
            label="Language"
            value={formData.language || 'en'}
            onChange={(e) => setFormData({ ...formData, language: e.target.value })}
            options={TEMPLATE_LANGUAGES}
          />
          <Select
            label="WhatsApp account"
            value={formData.whatsapp_account_id || (accountOptions[0]?.value ?? '')}
            onChange={(e) => {
              const nextAccountId = e.target.value;
              const nextAccount = (accounts || []).find((a) => String(a.id) === nextAccountId);
              const isManual = (nextAccount?.provider || '').toLowerCase() === 'manual';
              setFormData({
                ...formData,
                whatsapp_account_id: nextAccountId,
                template_mode: isManual ? 'manual' : formData.template_mode,
              });
            }}
            options={accountOptions.length ? accountOptions : []}
          />
          <Select
            label="Status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
          />
          <Select
            label="Template mode"
            value={formData.template_mode || 'automatic'}
            onChange={(e) =>
              setFormData({
                ...formData,
                template_mode: e.target.value,
              })
            }
            options={(() => {
              const currentAccount = (accounts || []).find(
                (a) => String(a.id) === formData.whatsapp_account_id
              );
              const isManualProvider = (currentAccount?.provider || '').toLowerCase() === 'manual';
              if (isManualProvider) {
                return [{ value: 'manual', label: 'Manual (WhatsApp Web / no API)' }];
              }
              return [
                { value: 'automatic', label: 'Automatic (send via provider API)' },
                { value: 'manual', label: 'Manual (WhatsApp Web / no API)' },
              ];
            })()}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              label="Cooldown days (optional)"
              type="number"
              min={0}
              value={formData.cooldown_days}
              onChange={(e) => setFormData({ ...formData, cooldown_days: e.target.value })}
              placeholder="0"
            />
            <Input
              label="Cooldown hours (optional)"
              type="number"
              min={0}
              max={23}
              value={formData.cooldown_hours}
              onChange={(e) => setFormData({ ...formData, cooldown_hours: e.target.value })}
              placeholder="0"
            />
          </div>
          <div>
            <label className={styles.panelTitle}>Components (Header / Body / Footer)</label>
            {formData.components.map((comp, idx) => (
              <div key={idx} style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Select
                  value={comp.component_type}
                  onChange={(e) => setComponent(idx, 'component_type', e.target.value)}
                  options={COMPONENT_TYPES}
                  style={{ width: 100 }}
                />
                <Input
                  value={comp.component_text}
                  onChange={(e) => setComponent(idx, 'component_text', e.target.value)}
                  placeholder="Text or {{1}} variables"
                  style={{ flex: 1 }}
                />
                <IconButton size="sm" variant="danger" title="Remove" onClick={() => removeComponent(idx)} disabled={formData.components.length <= 1}>✕</IconButton>
              </div>
            ))}
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => addComponentOfType('HEADER')}>+ HEADER</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => addComponentOfType('BODY')}>+ BODY</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => addComponentOfType('FOOTER')}>+ FOOTER</Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showFetchModal}
        onClose={() => setShowFetchModal(false)}
        title="Fetch templates from provider"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowFetchModal(false)}>Close</Button>
            {moduleEnabled && fetchList.length > 0 ? null : moduleEnabled ? (
              <Button
                onClick={handleFetchFromProvider}
                loading={fetchLoading}
                disabled={!fetchAccountId || (isMetaAccount && !fetchWabaId?.trim())}
              >
                Fetch
              </Button>
            ) : null}
          </ModalFooter>
        }
      >
        <div className={styles.form}>
          {!moduleEnabled ? (
            <Alert variant="warning">
              Your WhatsApp module is not enabled. You are not able to fetch templates from the provider. Please contact your administrator to enable the WhatsApp automation module.
            </Alert>
          ) : (
            <>
          {fetchError && <Alert variant="error">{fetchError}</Alert>}
          <Select
            label="WhatsApp account"
            value={fetchAccountId}
            onChange={(e) => { setFetchAccountId(e.target.value); setFetchList([]); setFetchError(null); setFetchAttempted(false); }}
            options={fetchAccountOptions}
          />
          {isMetaAccount && (
            <Input
              label="WABA ID (required for Meta)"
              value={fetchWabaId}
              onChange={(e) => setFetchWabaId(e.target.value)}
              placeholder="WhatsApp Business Account ID from Business Manager"
            />
          )}
          {fetchList.length > 0 ? (
            <div className={styles.fetchListSection}>
              <p className={styles.fetchListHint}>Click <strong>Import</strong> to add a template.</p>
              <Table className={styles.fetchTable}>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell width="160px">Name</TableHeaderCell>
                    <TableHeaderCell width="90px">Language</TableHeaderCell>
                    <TableHeaderCell>Account</TableHeaderCell>
                    <TableHeaderCell>Provider ID</TableHeaderCell>
                    <TableHeaderCell width="100px" align="center">Action</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fetchList.map((row) => (
                    <TableRow key={row.provider_template_id || row.template_name}>
                      <TableCell>{row.template_name}</TableCell>
                      <TableCell>{row.language || '—'}</TableCell>
                      <TableCell>{selectedAccount ? `${selectedAccount.phone_number} (${selectedAccount.provider || '—'})` : '—'}</TableCell>
                      <TableCell style={{ fontSize: '0.8rem', wordBreak: 'break-all' }}>{row.provider_template_id || '—'}</TableCell>
                      <TableCell align="center">
                        <Button
                          size="sm"
                          onClick={() => handleImportTemplate(row)}
                          loading={importingId === row.provider_template_id && createMutation.loading}
                        >
                          Import
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : fetchLoading ? (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spinner size="sm" /> Fetching templates…
            </div>
          ) : fetchAccountId && !fetchLoading && !fetchAttempted ? (
            <p style={{ marginTop: 12, color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              Click Fetch to load templates from the provider (Twilio Content API or Meta).
            </p>
          ) : fetchAttempted && fetchList.length === 0 && !fetchLoading && !fetchError ? (
            <div style={{ marginTop: 16 }}>
              <Alert variant="warning">
                <strong>No templates returned from Twilio.</strong>
                <br /><br />
                The dropdown in Twilio’s “Try it out → Send a WhatsApp message” often shows <strong>sample templates</strong> that are not in your account. They will not appear when you Fetch here.
                <br /><br />
                To get templates to show: In Twilio Console go to <strong>Messaging → Content Template Builder</strong> (or Develop → Messaging → Content Template Builder). Create or add a template there and submit it for WhatsApp. After that, use Fetch again — your template should appear. Use the same Account SID and Auth Token (Live or Test) as in Keys &amp; Credentials.
              </Alert>
            </div>
          ) : null}
            </>
          )}
        </div>
      </Modal>

      <ConfirmModal isOpen={!!confirmAction && confirmAction.action === 'activate'} onClose={() => setConfirmAction(null)} onConfirm={handleActivateConfirm} title="Activate Template" message={`Activate template "${confirmAction?.name}"?`} confirmText="Activate" loading={activateMutation.loading} />
      <ConfirmModal isOpen={!!confirmAction && confirmAction.action === 'deactivate'} onClose={() => setConfirmAction(null)} onConfirm={handleDeactivateConfirm} title="Deactivate Template" message={`Deactivate template "${confirmAction?.name}"?`} confirmText="Deactivate" loading={deactivateMutation.loading} />
      <ConfirmModal isOpen={!!deleteItem} onClose={() => { setDeleteItem(null); setDeleteError(null); }} onConfirm={handleDelete} title="Delete Template" message={deleteError || `Delete template "${deleteItem?.template_name}"?`} confirmText="Delete" loading={deleteMutation.loading} />
    </div>
  );
}
