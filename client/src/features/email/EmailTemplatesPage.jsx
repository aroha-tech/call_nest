import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { emailTemplatesAPI, emailAccountsAPI } from '../../services/emailAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { templateVariablesAPI } from '../../services/templateVariablesAPI';
import { useTemplateVariableAutocomplete } from '../../hooks/useTemplateVariables';
import { renderPreview, linkify, linkifyHtml, stripHtml, DEFAULT_PREVIEW_DATA } from '../../utils/templateVariables';
import { ScriptBodyEditor } from '../callScripts/ScriptBodyEditor';
import { VariableSelector } from '../../components/VariableSelector';
import styles from '../../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';
import { FilterBar } from '../../components/admin/FilterBar';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../components/admin/TableDataRegion';

export function EmailTemplatesPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [appliedAccountId, setAppliedAccountId] = useState('__all__');
  const [draftAccountId, setDraftAccountId] = useState('__all__');
  const fetchFn = useCallback(
    () =>
      emailTemplatesAPI.getAll(
        showInactive,
        appliedAccountId === '__all__' ? undefined : appliedAccountId
      ),
    [showInactive, appliedAccountId]
  );
  const { data: templates, loading, error, refetch } = useAsyncData(fetchFn, [
    showInactive,
    appliedAccountId,
  ]);
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ email_account_id: '', name: '', subject: '', body_html: '', body_text: '', status: 'active' });
  const [formErrors, setFormErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const editorRef = useRef(null);
  const [previewSampleData, setPreviewSampleData] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fetchAccounts = useCallback(() => emailAccountsAPI.getAll(true), []);
  const { data: accounts } = useAsyncData(fetchAccounts, []);
  const [editorPlainText, setEditorPlainText] = useState('');
  const [editorCursorIndex, setEditorCursorIndex] = useState(0);

  const { active: autocompleteActive, suggestions, context: autocompleteContext } =
    useTemplateVariableAutocomplete(editorPlainText, editorCursorIndex);

  useEffect(() => {
    let mounted = true;
    templateVariablesAPI
      .getPreviewSample()
      .then((res) => {
        if (mounted && res.data) {
          setPreviewSampleData({ ...DEFAULT_PREVIEW_DATA, ...res.data });
        }
      })
      .catch(() => {
        if (mounted) setPreviewSampleData(DEFAULT_PREVIEW_DATA);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const createMutation = useMutation(emailTemplatesAPI.create);
  const updateMutation = useMutation((id, data) => emailTemplatesAPI.update(id, data));
  const deleteMutation = useMutation(emailTemplatesAPI.delete);
  const activateMutation = useMutation(emailTemplatesAPI.activate);
  const deactivateMutation = useMutation(emailTemplatesAPI.deactivate);

  const openCreate = () => {
    setEditingItem(null);
    setFormData({
      email_account_id: accounts?.[0]?.id ? String(accounts[0].id) : '',
      name: '',
      subject: '',
      body_html: '',
      body_text: '',
      status: 'active',
    });
    setFormErrors({});
    setSubmitError(null);
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setFormData({
      email_account_id: item.email_account_id ? String(item.email_account_id) : '',
      name: item.name || '',
      subject: item.subject || '',
      body_html: item.body_html || '',
      body_text: item.body_text || '',
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
    if (!formData.email_account_id) errs.email_account_id = 'Account is required';
    if (!formData.name?.trim()) errs.name = 'Name is required';
    if (!formData.subject?.trim()) errs.subject = 'Subject is required';
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    // Auto-generate plain-text fallback if not provided
    let payload = { ...formData };
    if (!payload.body_text && payload.body_html) {
      const plain = stripHtml
        ? stripHtml(payload.body_html)
        : payload.body_html.replace(/<[^>]*>/g, '');
      payload = { ...payload, body_text: plain };
    }

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

  const previewSample = previewSampleData || DEFAULT_PREVIEW_DATA;
  const rawHtml = formData.body_html || '';
  const renderedBody = renderPreview(rawHtml, previewSample);
  const isHtml = /<[a-z][\s\S]*>/i.test(rawHtml);
  const previewHtml = isHtml ? linkifyHtml(renderedBody) : linkify(renderedBody);
  const previewSubject = renderPreview(formData.subject || '', previewSample);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Email Templates"
        description="Reusable email templates with subject and body"
        actions={<Button onClick={openCreate}>+ Add Template</Button>}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <FilterBar
        onApply={() => setAppliedAccountId(draftAccountId)}
        onReset={() => {
          setDraftAccountId('__all__');
          setAppliedAccountId('__all__');
        }}
      >
        <Select
          label="Account"
          value={draftAccountId}
          onChange={(e) => setDraftAccountId(e.target.value)}
          options={[
            { value: '__all__', label: 'All accounts' },
            ...(accounts || []).map((a) => ({ value: String(a.id), label: a.email_address })),
          ]}
        />
      </FilterBar>

      <div className={listStyles.tableToolbarCheckboxOnly}>
        <Checkbox
          id="show-inactive-email-templates"
          label="Show inactive"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
      </div>

      <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
        {!templates?.length ? (
          <EmptyState
            icon="📄"
            title="No email templates"
            description="Create a template to reuse subject and body."
            action={openCreate}
            actionLabel="Add Template"
          />
        ) : (
          <div className={listStyles.tableScrollAreaNatural}>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Account</TableHeaderCell>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Subject</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell width="180px" align="center">Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {templates.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.account_email || '—'}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.subject}</TableCell>
                <TableCell>
                  <Badge variant={row.status === 'active' ? 'success' : 'muted'}>{row.status}</Badge>
                </TableCell>
                <TableCell align="center">
                  <div className={styles.actions}>
                    {row.status === 'inactive' ? (
                      <IconButton size="sm" variant="success" title="Activate" onClick={() => setConfirmAction({ id: row.id, action: 'activate', name: row.name })}>▶️</IconButton>
                    ) : (
                      <IconButton size="sm" variant="warning" title="Deactivate" onClick={() => setConfirmAction({ id: row.id, action: 'deactivate', name: row.name })}>⏸️</IconButton>
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
      </TableDataRegion>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? 'Edit Template' : 'Add Template'}
        size="lg"
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
            label="Account"
            value={formData.email_account_id}
            onChange={(e) => setFormData({ ...formData, email_account_id: e.target.value })}
            options={(accounts || []).map((a) => ({ value: String(a.id), label: a.email_address }))}
            error={formErrors.email_account_id}
            placeholder="Select account"
          />
          <Input
            label="Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={formErrors.name}
            placeholder="Template name"
          />
          <Input
            label="Subject"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            error={formErrors.subject}
            placeholder="Email subject (use {{variable}} for merge)"
          />
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 1.6 }}>
              <label className={styles.panelTitle}>Body (HTML)</label>
              <ScriptBodyEditor
                ref={editorRef}
                value={formData.body_html}
                onChange={(content) => setFormData({ ...formData, body_html: content })}
                onEditorState={(plain, index) => {
                  setEditorPlainText(plain);
                  setEditorCursorIndex(index ?? 0);
                }}
                placeholder="HTML body. Use variables like {{contact_first_name}}."
              />
              {autocompleteActive && suggestions.length > 0 && (
                <div className={styles.variableAutocomplete}>
                  {suggestions.slice(0, 8).map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className={styles.variableAutocompleteItem}
                      onClick={() => {
                        if (!autocompleteContext) return;
                        const insert = `{{${v.key}}}`;
                        editorRef.current?.replaceRange(
                          autocompleteContext.startIndex,
                          editorCursorIndex,
                          insert
                        );
                        editorRef.current?.focus();
                      }}
                    >
                      <span>{v.label}</span>
                      <code>{v.key}</code>
                    </button>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-start' }}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowPreviewModal(true)}
                >
                  Show Preview
                </Button>
              </div>
            </div>
            <div style={{ width: 220 }}>
              <VariableSelector
                onInsert={(text) => {
                  editorRef.current?.insertAtCursor(text);
                  editorRef.current?.focus();
                }}
              />
            </div>
          </div>
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              style={{
                marginTop: 8,
                padding: 0,
                border: 'none',
                background: 'none',
                color: 'var(--color-primary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
            </button>
            {showAdvanced && (
              <div style={{ marginTop: 8 }}>
                <label className={styles.panelTitle}>Body (plain text, optional)</label>
                <textarea
                  value={formData.body_text}
                  onChange={(e) => setFormData({ ...formData, body_text: e.target.value })}
                  placeholder="Plain text fallback"
                  rows={4}
                  style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'inherit', fontSize: '0.875rem' }}
                />
              </div>
            )}
          </div>
          <Select
            label="Status"
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
          />
        </form>
      </Modal>

      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title="Template Preview"
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowPreviewModal(false)}>Close</Button>
          </ModalFooter>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <strong>Subject</strong>
            <div
              style={{ marginTop: 4, padding: 8, background: 'var(--color-bg-subtle)', borderRadius: 4 }}
            >
              {previewSubject || <em>No subject</em>}
            </div>
          </div>
          <div>
            <strong>Body</strong>
            <div
              style={{ marginTop: 4, padding: 12, background: 'var(--color-bg-subtle)', borderRadius: 4, maxHeight: 400, overflow: 'auto' }}
              dangerouslySetInnerHTML={{ __html: previewHtml || '<em>No content</em>' }}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal isOpen={!!confirmAction && confirmAction.action === 'activate'} onClose={() => setConfirmAction(null)} onConfirm={handleActivateConfirm} title="Activate Template" message={`Activate "${confirmAction?.name}"?`} confirmText="Activate" loading={activateMutation.loading} />
      <ConfirmModal isOpen={!!confirmAction && confirmAction.action === 'deactivate'} onClose={() => setConfirmAction(null)} onConfirm={handleDeactivateConfirm} title="Deactivate Template" message={`Deactivate "${confirmAction?.name}"?`} confirmText="Deactivate" loading={deactivateMutation.loading} />
      <ConfirmModal isOpen={!!deleteItem} onClose={() => { setDeleteItem(null); setDeleteError(null); }} onConfirm={handleDelete} title="Delete Template" message={deleteError || `Delete "${deleteItem?.name}"?`} confirmText="Delete" loading={deleteMutation.loading} />
    </div>
  );
}
