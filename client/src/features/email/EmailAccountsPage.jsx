import React, { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { Modal, ConfirmModal, ModalFooter } from '../../components/ui/Modal';
import { IconButton } from '../../components/ui/IconButton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Checkbox } from '../../components/ui/Checkbox';
import { emailAccountsAPI } from '../../services/emailAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import styles from '../../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';

const PROVIDER_OPTIONS = [
  { value: 'smtp', label: 'SMTP (Custom)' },
  { value: 'gmail', label: 'Gmail (OAuth)' },
  { value: 'outlook', label: 'Microsoft Outlook (OAuth)' },
];

const defaultFormData = () => ({
  provider: 'smtp',
  account_name: '',
  email_address: '',
  display_name: '',
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: true,
  smtp_user: '',
  smtp_password_encrypted: '',
  status: 'active',
});

export function EmailAccountsPage() {
  const [showInactive, setShowInactive] = useState(false);
  const fetchFn = useCallback(
    () => emailAccountsAPI.getAll(showInactive),
    [showInactive]
  );
  const { data: accounts, loading, error, refetch } = useAsyncData(fetchFn, [showInactive]);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState(defaultFormData());
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [oauthMessage, setOauthMessage] = useState(null);
  const [oauthError, setOauthError] = useState(null);
  const [oauthLoading, setOauthLoading] = useState(null); // 'google' | 'outlook'

  // Handle OAuth callback query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get('oauth');
    const message = params.get('message');
    if (oauth === 'success' && message) {
      setOauthMessage(decodeURIComponent(message));
      refetch();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (oauth === 'error' && message) {
      setOauthError(decodeURIComponent(message));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const createMutation = useMutation(emailAccountsAPI.create);
  const updateMutation = useMutation((id, data) => emailAccountsAPI.update(id, data));
  const deleteMutation = useMutation(emailAccountsAPI.delete);
  const activateMutation = useMutation(emailAccountsAPI.activate);
  const deactivateMutation = useMutation(emailAccountsAPI.deactivate);

  const openCreate = () => {
    setEditingItem(null);
    setFormData(defaultFormData());
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormData({
      provider: item.provider || 'smtp',
      account_name: item.account_name || '',
      email_address: item.email_address || '',
      display_name: item.display_name || '',
      smtp_host: item.smtp_host || '',
      smtp_port: item.smtp_port != null ? String(item.smtp_port) : '587',
      smtp_secure: item.smtp_secure !== 0,
      smtp_user: item.smtp_user || '',
      smtp_password_encrypted: item.smtp_password_encrypted ? '••••••••' : '',
      status: item.status || 'active',
    });
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const errs = {};
    if (!formData.email_address?.trim()) errs.email_address = 'Email address is required';
    if (formData.provider === 'smtp') {
      if (!formData.smtp_host?.trim()) errs.smtp_host = 'SMTP host is required';
      if (!formData.smtp_user?.trim()) errs.smtp_user = 'SMTP user is required';
      if (!editingItem && !formData.smtp_password_encrypted) errs.smtp_password_encrypted = 'Password is required';
    }
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }
    const payload = {
      ...formData,
      smtp_port: formData.smtp_port ? parseInt(formData.smtp_port, 10) : 587,
      smtp_password_encrypted:
        formData.smtp_password_encrypted && formData.smtp_password_encrypted !== '••••••••'
          ? formData.smtp_password_encrypted
          : undefined,
    };
    if (editingItem && payload.smtp_password_encrypted === undefined) delete payload.smtp_password_encrypted;

    const result = editingItem
      ? await updateMutation.mutate(editingItem.id, payload)
      : await createMutation.mutate(payload);
    if (result?.data) {
      setShowModal(false);
      refetch();
    } else {
      setSubmitError(result?.error || 'Save failed');
    }
  };

  const handleDelete = async () => {
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
    if (!confirmAction) return;
    await activateMutation.mutate(confirmAction.id);
    setConfirmAction(null);
    refetch();
  };
  const handleDeactivateConfirm = async () => {
    if (!confirmAction) return;
    await deactivateMutation.mutate(confirmAction.id);
    setConfirmAction(null);
    refetch();
  };

  const isSmtp = formData.provider === 'smtp';

  const handleConnectGoogle = async () => {
    setOauthError(null);
    setOauthLoading('google');
    try {
      const res = await emailAccountsAPI.getOAuthGoogleUrl();
      const url = res.data?.url;
      if (url) window.location.href = url;
      else setOauthError('Could not get Google sign-in URL');
    } catch (err) {
      setOauthError(err.response?.data?.error || err.message || 'Failed to start Google sign-in');
    } finally {
      setOauthLoading(null);
    }
  };
  const handleConnectOutlook = async () => {
    setOauthError(null);
    setOauthLoading('outlook');
    try {
      const res = await emailAccountsAPI.getOAuthOutlookUrl();
      const url = res.data?.url;
      if (url) window.location.href = url;
      else setOauthError('Could not get Microsoft sign-in URL');
    } catch (err) {
      setOauthError(err.response?.data?.error || err.message || 'Failed to start Microsoft sign-in');
    } finally {
      setOauthLoading(null);
    }
  };

  const handleReconnect = async (row) => {
    const provider = (row.provider || '').toLowerCase();
    if (provider !== 'gmail' && provider !== 'outlook') return;
    setOauthError(null);
    setOauthLoading(provider);
    try {
      const res =
        provider === 'gmail'
          ? await emailAccountsAPI.getOAuthGoogleUrl()
          : await emailAccountsAPI.getOAuthOutlookUrl();
      const url = res.data?.url;
      if (url) window.location.href = url;
      else setOauthError('Could not get sign-in URL');
    } catch (err) {
      setOauthError(
        err.response?.data?.error ||
          err.message ||
          'Failed to start sign-in'
      );
    } finally {
      setOauthLoading(null);
    }
  };

  if (loading && !accounts?.length) {
    return (
      <div className={styles.page}>
        <PageHeader title="Email Accounts" />
        <div className={styles.loading}><Spinner size="lg" /></div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Email Accounts"
        description="Connect Gmail, Outlook, or SMTP to send email from your accounts"
        actions={
          <>
            <Button variant="secondary" onClick={handleConnectGoogle} loading={oauthLoading === 'google'} disabled={!!oauthLoading}>
              Connect with Google
            </Button>
            <Button variant="secondary" onClick={handleConnectOutlook} loading={oauthLoading === 'outlook'} disabled={!!oauthLoading}>
              Connect with Microsoft
            </Button>
            <Button onClick={openCreate}>+ Add Account</Button>
          </>
        }
      />

      {oauthMessage && <Alert variant="success">{oauthMessage}</Alert>}
      {oauthError && <Alert variant="error">{oauthError}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableToolbarCheckboxOnly}>
        <Checkbox
          id="show-inactive-email-accounts"
          label="Show inactive"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
      </div>

      {!accounts?.length ? (
        <EmptyState
          icon="✉️"
          title="No email accounts"
          description="Add an account to send and receive email."
          action={openCreate}
          actionLabel="Add Account"
        />
      ) : (
        <div className={listStyles.tableScrollAreaNatural}>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Account</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Provider</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell width="180px" align="center">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {accounts.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.account_name || row.email_address || '—'}</TableCell>
                <TableCell>{row.email_address || '—'}</TableCell>
                <TableCell>
                  <Badge variant="muted">
                    {PROVIDER_OPTIONS.find((o) => o.value === row.provider)?.label || row.provider}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={row.status === 'active' ? 'success' : 'muted'}>{row.status}</Badge>
                </TableCell>
                <TableCell align="center">
                  <div className={styles.actions}>
                    {(row.provider === 'gmail' || row.provider === 'outlook') && (
                      <IconButton
                        size="sm"
                        title="Reconnect / Re-authorize"
                        onClick={() => handleReconnect(row)}
                        disabled={!!oauthLoading}
                      >
                        🔄
                      </IconButton>
                    )}
                    {row.status === 'inactive' ? (
                      <IconButton size="sm" variant="success" title="Activate" onClick={() => setConfirmAction({ id: row.id, action: 'activate', name: row.account_name || row.email_address })}>▶️</IconButton>
                    ) : (
                      <IconButton size="sm" variant="warning" title="Deactivate" onClick={() => setConfirmAction({ id: row.id, action: 'deactivate', name: row.account_name || row.email_address })}>⏸️</IconButton>
                    )}
                    <IconButton size="sm" title="Edit" onClick={() => openEdit(row)}>✏️</IconButton>
                    <IconButton size="sm" variant="danger" title="Delete" onClick={() => { setDeleteItem(row); setDeleteError(null); }}>🗑️</IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? 'Edit Email Account' : 'Add Email Account'}
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
            value={formData.provider}
            onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
            options={PROVIDER_OPTIONS}
          />
          <Input
            label="Account name (optional)"
            value={formData.account_name}
            onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
            placeholder="Friendly name"
          />
          <Input
            label="Email address"
            value={formData.email_address}
            onChange={(e) => setFormData({ ...formData, email_address: e.target.value })}
            error={formErrors.email_address}
            placeholder="you@example.com"
          />
          <Input
            label="Display name (optional)"
            value={formData.display_name}
            onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
            placeholder="Name shown as sender"
          />
          {isSmtp && (
            <>
              <Input
                label="SMTP host"
                value={formData.smtp_host}
                onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                error={formErrors.smtp_host}
                placeholder="smtp.example.com"
              />
              <Input
                label="SMTP port"
                value={formData.smtp_port}
                onChange={(e) => setFormData({ ...formData, smtp_port: e.target.value })}
                placeholder="587"
              />
              <Checkbox
                id="smtp_secure"
                label="Use TLS (secure)"
                checked={formData.smtp_secure}
                onChange={(e) => setFormData({ ...formData, smtp_secure: e.target.checked })}
              />
              <Input
                label="SMTP user"
                value={formData.smtp_user}
                onChange={(e) => setFormData({ ...formData, smtp_user: e.target.value })}
                error={formErrors.smtp_user}
                placeholder="Usually your email"
              />
              <Input
                label="SMTP password"
                type="password"
                value={formData.smtp_password_encrypted}
                onChange={(e) => setFormData({ ...formData, smtp_password_encrypted: e.target.value })}
                error={formErrors.smtp_password_encrypted}
                placeholder={editingItem ? 'Leave blank to keep current' : 'Password'}
              />
            </>
          )}
          {!isSmtp && (
            <Alert variant="info">
              Use “Connect with Google” or “Connect with Microsoft” above to add an account with OAuth. Or add an SMTP account with host/password.
            </Alert>
          )}
          <Select
            label="Status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
          />
        </form>
      </Modal>

      <ConfirmModal isOpen={!!confirmAction && confirmAction.action === 'activate'} onClose={() => setConfirmAction(null)} onConfirm={handleActivateConfirm} title="Activate Email Account" message={`Activate account ${confirmAction?.name}?`} confirmText="Activate" loading={activateMutation.loading} />
      <ConfirmModal isOpen={!!confirmAction && confirmAction.action === 'deactivate'} onClose={() => setConfirmAction(null)} onConfirm={handleDeactivateConfirm} title="Deactivate Email Account" message={`Deactivate account ${confirmAction?.name}?`} confirmText="Deactivate" loading={deactivateMutation.loading} />
      <ConfirmModal isOpen={!!deleteItem} onClose={() => { setDeleteItem(null); setDeleteError(null); }} onConfirm={handleDelete} title="Delete Email Account" message={deleteError || `Delete account "${deleteItem?.account_name || deleteItem?.email_address}"?`} confirmText="Delete" loading={deleteMutation.loading} />
    </div>
  );
}
