import React, { useState, useCallback } from 'react';
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
import { whatsappAccountsAPI } from '../../services/whatsappAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import styles from '../../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../components/admin/TableDataRegion';

const PROVIDER_OPTIONS = [
  { value: 'meta', label: 'Meta Cloud API' },
  { value: 'twilio', label: 'Twilio' },
  { value: 'gupshup', label: 'Gupshup' },
  { value: 'interakt', label: 'Interakt' },
  { value: 'kaleyra', label: 'Kaleyra' },
];

const PROVIDER_FIELDS = {
  meta: [
    { key: 'phone_number', label: 'Phone number', placeholder: 'e.g. 15551234567', required: true },
    { key: 'external_account_id', label: 'Phone number ID', placeholder: 'From Meta Business Manager', required: true },
    { key: 'api_key', label: 'Access token', type: 'password', required: true },
  ],
  twilio: [
    { key: 'external_account_id', label: 'Account SID', placeholder: 'AC...', required: true },
    { key: 'api_secret', label: 'Auth Token', type: 'password', required: true },
    { key: 'phone_number', label: 'Sandbox number', placeholder: 'whatsapp:+14155238886', required: true },
  ],
  gupshup: [
    { key: 'external_account_id', label: 'App name', placeholder: 'Your Gupshup app name', required: true },
    { key: 'api_key', label: 'API key', type: 'password', required: true },
    { key: 'phone_number', label: 'Source number', placeholder: 'E.164 format', required: false },
  ],
  interakt: [
    { key: 'api_key', label: 'API key', type: 'password', required: true },
    { key: 'phone_number', label: 'Phone number (optional)', placeholder: 'Business number', required: false },
  ],
  kaleyra: [
    { key: 'external_account_id', label: 'SID', placeholder: 'Kaleyra SID', required: true },
    { key: 'api_key', label: 'API key', type: 'password', required: true },
    { key: 'phone_number', label: 'Business number', placeholder: 'WhatsApp business number', required: true },
  ],
};

const defaultFormData = () => ({
  account_name: '',
  provider: 'meta',
  phone_number: '',
  external_account_id: '',
  api_key: '',
  api_secret: '',
  webhook_url: '',
  status: 'active',
});

export function WhatsAppAccountsPage() {
  const [showInactive, setShowInactive] = useState(false);
  const fetchFn = useCallback(
    () => whatsappAccountsAPI.getAll(showInactive),
    [showInactive]
  );
  const { data: accounts, loading, error, refetch } = useAsyncData(fetchFn, [showInactive]);
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(defaultFormData());
  const [showSecrets, setShowSecrets] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [testConnectionStatus, setTestConnectionStatus] = useState(null);
  const [testConnectionMessage, setTestConnectionMessage] = useState('');

  const createMutation = useMutation(whatsappAccountsAPI.create);
  const updateMutation = useMutation((id, data) => whatsappAccountsAPI.update(id, data));
  const deleteMutation = useMutation(whatsappAccountsAPI.delete);
  const activateMutation = useMutation(whatsappAccountsAPI.activate);
  const deactivateMutation = useMutation(whatsappAccountsAPI.deactivate);

  const openCreate = () => {
    setEditingItem(null);
    setFormData(defaultFormData());
    setFormErrors({});
    setSubmitError(null);
    setShowSecrets({});
    setTestConnectionStatus(null);
    setTestConnectionMessage('');
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormData({
      account_name: item.account_name || '',
      provider: item.provider || 'meta',
      phone_number: item.phone_number || '',
      external_account_id: item.external_account_id || '',
      api_key: item.api_key ? '••••••••' : '',
      api_secret: item.api_secret ? '••••••••' : '',
      webhook_url: item.webhook_url || '',
      status: item.status || 'active',
    });
    setFormErrors({});
    setSubmitError(null);
    setShowSecrets({});
    setTestConnectionStatus(null);
    setTestConnectionMessage('');
    setShowModal(true);
  };

  const toggleShowSecret = (key) => {
    setShowSecrets((s) => ({ ...s, [key]: !s[key] }));
  };

  const handleTestConnection = async () => {
    setTestConnectionStatus(null);
    setTestConnectionMessage('');
    const provider = formData.provider || 'meta';
    // Use current form values (in edit, masked •••• means use stored; we send account_id so backend can merge)
    const payload = {
      ...(editingItem?.id && { account_id: editingItem.id }),
      provider,
      api_key: formData.api_key && formData.api_key !== '••••••••' ? formData.api_key : undefined,
      api_secret: formData.api_secret && formData.api_secret !== '••••••••' ? formData.api_secret : undefined,
      external_account_id: formData.external_account_id?.trim() || undefined,
      phone_number: formData.phone_number?.trim() || undefined,
    };
    const needsKey = provider === 'meta' || provider === 'gupshup' || provider === 'kaleyra' || provider === 'interakt';
    const needsSecret = provider === 'twilio';
    // In edit with account_id, backend will use stored api_key/api_secret when not sent
    if (!payload.account_id) {
      if (needsKey && !payload.api_key) {
        setTestConnectionStatus('error');
        setTestConnectionMessage('Enter API key / Access token to test.');
        return;
      }
      if (needsSecret && !payload.api_secret) {
        setTestConnectionStatus('error');
        setTestConnectionMessage('Enter Auth Token (API Secret) to test.');
        return;
      }
    }
    try {
      const res = await whatsappAccountsAPI.testConnection(payload);
      setTestConnectionStatus('success');
      setTestConnectionMessage(res?.data?.message || 'Connection successful');
    } catch (err) {
      setTestConnectionStatus('error');
      setTestConnectionMessage(err.response?.data?.error || err.message || 'Connection failed');
    }
  };

  const buildPayload = () => {
    const payload = {
      account_name: formData.account_name?.trim() || null,
      provider: formData.provider || 'meta',
      phone_number: formData.phone_number?.trim() || '',
      external_account_id: formData.external_account_id?.trim() || null,
      api_secret: formData.api_secret?.trim() || null,
      webhook_url: formData.webhook_url?.trim() || null,
      status: formData.status || 'active',
    };
    if (formData.api_key && formData.api_key !== '••••••••') {
      payload.api_key = formData.api_key;
    } else if (editingItem?.api_key && (formData.api_key === '••••••••' || !formData.api_key)) {
      delete payload.api_key;
    } else {
      payload.api_key = formData.api_key?.trim() || null;
    }
    if (formData.api_secret && formData.api_secret !== '••••••••') {
      payload.api_secret = formData.api_secret;
    } else if (editingItem?.api_secret && (formData.api_secret === '••••••••' || !formData.api_secret)) {
      delete payload.api_secret;
    }
    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    const provider = formData.provider || 'meta';
    if (!formData.phone_number?.trim() && provider !== 'interakt') {
      errs.phone_number = errs.phone_number || 'Phone number is required';
    }
    if (provider !== 'manual') {
      const fields = PROVIDER_FIELDS[provider] || PROVIDER_FIELDS.meta;
      fields.forEach((f) => {
        if (f.required && !(formData[f.key]?.trim?.())) {
          errs[f.key] = `${f.label} is required`;
        }
      });
    }
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = buildPayload();
    if (
      !editingItem &&
      provider !== 'manual' &&
      !payload.api_key &&
      (provider === 'meta' || provider === 'gupshup' || provider === 'kaleyra')
    ) {
      setFormErrors({ api_key: 'API key / Access token is required' });
      return;
    }

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
    const result = await activateMutation.mutate(confirmAction.id);
    if (result?.success) {
      setConfirmAction(null);
      refetch();
    } else setConfirmAction(null);
  };

  const handleDeactivateConfirm = async () => {
    if (!confirmAction?.id) return;
    const result = await deactivateMutation.mutate(confirmAction.id);
    if (result?.success) {
      setConfirmAction(null);
      refetch();
    } else setConfirmAction(null);
  };

  const provider = formData.provider || 'meta';
  const fields =
    provider === 'manual' ? [] : PROVIDER_FIELDS[provider] || PROVIDER_FIELDS.meta;

  return (
    <div className={styles.page}>
      <PageHeader
        title="WhatsApp Accounts"
        description="Connect and manage WhatsApp Business API accounts"
        actions={<Button onClick={openCreate}>+ Add Account</Button>}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableToolbarCheckboxOnly}>
        <Checkbox
          id="show-inactive-accounts"
          label="Show inactive"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
      </div>

      <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
        {!accounts?.length ? (
          <EmptyState
            icon="📱"
            title="No WhatsApp accounts"
            description="Add an account to connect your WhatsApp Business API."
            action={openCreate}
            actionLabel="Add Account"
          />
        ) : (
          <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Account</TableHeaderCell>
              <TableHeaderCell>Phone / ID</TableHeaderCell>
              <TableHeaderCell>Provider</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell width="180px" align="center">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.account_name || row.phone_number || '—'}</TableCell>
                <TableCell>{row.phone_number || row.external_account_id || '—'}</TableCell>
                <TableCell>
                  <Badge variant="muted">
                    {row.provider === 'manual'
                      ? 'Manual (no API)'
                      : PROVIDER_OPTIONS.find((o) => o.value === row.provider)?.label ||
                        row.provider}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={row.status === 'active' ? 'success' : 'muted'}>{row.status}</Badge>
                </TableCell>
                <TableCell align="center">
                  <div className={styles.actions}>
                    {row.status === 'inactive' ? (
                      <IconButton size="sm" variant="success" title="Activate" onClick={() => setConfirmAction({ id: row.id, action: 'activate', name: row.account_name || row.phone_number })}>▶️</IconButton>
                    ) : (
                      <IconButton size="sm" variant="warning" title="Deactivate" onClick={() => setConfirmAction({ id: row.id, action: 'deactivate', name: row.account_name || row.phone_number })}>⏸️</IconButton>
                    )}
                    <IconButton size="sm" title="Edit" onClick={() => openEdit(row)}>✏️</IconButton>
                    <IconButton size="sm" variant="danger" title="Delete" onClick={() => { setDeleteItem(row); setDeleteError(null); }}>🗑️</IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </TableDataRegion>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? 'Edit WhatsApp Account' : 'Add WhatsApp Account'}
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createMutation.loading || updateMutation.loading}>Save</Button>
          </ModalFooter>
        }
      >
        <form onSubmit={handleSubmit} className={styles.form}>
          {submitError && <Alert variant="error">{submitError}</Alert>}
          <Select
            label="Provider"
            value={formData.provider || 'meta'}
            onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
            options={[...PROVIDER_OPTIONS, { value: 'manual', label: 'Manual (no API)' }]}
          />
          <Input
            label="Account name (optional)"
            value={formData.account_name}
            onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
            placeholder="Friendly name for this account"
          />
          <Input
            label="Phone number"
            value={formData.phone_number}
            onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
            error={formErrors.phone_number}
            placeholder="Required for all accounts, including Manual (no API)"
          />
          {fields.map((f) => (
            <div key={f.key} style={{ marginTop: f.key.startsWith('api') ? 0 : 0 }}>
              <Input
                label={f.label}
                type={f.type === 'password' && !showSecrets[f.key] ? 'password' : 'text'}
                value={formData[f.key] ?? ''}
                onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                error={formErrors[f.key]}
                placeholder={editingItem && (f.key === 'api_key' || f.key === 'api_secret') ? 'Leave blank to keep current' : f.placeholder}
                suffix={f.type === 'password' ? (
                  <button
                    type="button"
                    onClick={() => toggleShowSecret(f.key)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}
                    aria-label={showSecrets[f.key] ? 'Hide' : 'Show'}
                  >
                    {showSecrets[f.key] ? 'Hide' : 'Show'}
                  </button>
                ) : undefined}
              />
            </div>
          ))}
          {(formData.provider || 'meta').toLowerCase() !== 'manual' && (
            <>
              <Input
                label="Webhook URL (optional)"
                value={formData.webhook_url}
                onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                placeholder="Callback endpoint"
              />
              {testConnectionStatus && (
                <div style={{ marginTop: 4 }}>
                  {testConnectionStatus === 'success' ? (
                    <Alert variant="success">{testConnectionMessage}</Alert>
                  ) : (
                    <Alert variant="error">{testConnectionMessage}</Alert>
                  )}
                </div>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={handleTestConnection}>
                Test connection
              </Button>
            </>
          )}
          <Select
            label="Status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
          />
        </form>
      </Modal>

      <ConfirmModal isOpen={!!confirmAction && confirmAction.action === 'activate'} onClose={() => setConfirmAction(null)} onConfirm={handleActivateConfirm} title="Activate WhatsApp Account" message={`Activate account ${confirmAction?.name}?`} confirmText="Activate" loading={activateMutation.loading} />
      <ConfirmModal isOpen={!!confirmAction && confirmAction.action === 'deactivate'} onClose={() => setConfirmAction(null)} onConfirm={handleDeactivateConfirm} title="Deactivate WhatsApp Account" message={`Deactivate account ${confirmAction?.name}?`} confirmText="Deactivate" loading={deactivateMutation.loading} />
      <ConfirmModal isOpen={!!deleteItem} onClose={() => { setDeleteItem(null); setDeleteError(null); }} onConfirm={handleDelete} title="Delete WhatsApp Account" message={deleteError || `Delete account "${deleteItem?.account_name || deleteItem?.phone_number}"? This cannot be undone.`} confirmText="Delete" loading={deleteMutation.loading} />
    </div>
  );
}
