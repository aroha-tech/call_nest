import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination, PaginationPageSize } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { emailMessagesAPI, emailAccountsAPI, emailTemplatesAPI, emailSendAPI } from '../../services/emailAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { templateVariablesAPI } from '../../services/templateVariablesAPI';

import { useTemplateVariableAutocomplete } from '../../hooks/useTemplateVariables';
import { renderPreview, linkify, linkifyHtml, DEFAULT_PREVIEW_DATA } from '../../utils/templateVariables';
import { ScriptBodyEditor } from '../callScripts/ScriptBodyEditor';
import { VariableSelector } from '../../components/VariableSelector';
import styles from '../../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';
import { FilterBar } from '../../components/admin/FilterBar';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../components/admin/TableDataRegion';

const PAGE_SIZE = 20;

const ACCOUNT_ALL_VALUE = '__all__';
const TEMPLATE_ALL_VALUE = 'all';

export function EmailSentPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedAccountId, setAppliedAccountId] = useState(ACCOUNT_ALL_VALUE);
  const [appliedTemplateId, setAppliedTemplateId] = useState(TEMPLATE_ALL_VALUE);
  const [draftAccountId, setDraftAccountId] = useState(ACCOUNT_ALL_VALUE);
  const [draftTemplateId, setDraftTemplateId] = useState(TEMPLATE_ALL_VALUE);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const fetchMessages = useCallback(
    () =>
      
      emailMessagesAPI.getAll({
        folder: 'sent',
        email_account_id: appliedAccountId === ACCOUNT_ALL_VALUE ? undefined : appliedAccountId,
        search: searchQuery || undefined,
        limit,
        offset: (page - 1) * limit,
      }),
    [searchQuery, page, limit, appliedAccountId]
  );
  const { data: response, loading, error, refetch } = useAsyncData(fetchMessages, [searchQuery, page, limit, appliedAccountId], {
    transform: (res) => res?.data ?? { data: [], total: 0 },
  });
  const messages = response?.data ?? [];
  const total = response?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({ email_account_id: '', to: '', subject: '', body_html: '', template_id: '' });
  const [sendError, setSendError] = useState(null);
  const editorRef = useRef(null);
  const [previewSampleData, setPreviewSampleData] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [editorPlainText, setEditorPlainText] = useState('');
  const [editorCursorIndex, setEditorCursorIndex] = useState(0);

  const { active: autocompleteActive, suggestions, context: autocompleteContext } = useTemplateVariableAutocomplete(
    editorPlainText,
    editorCursorIndex
  );

  const handleInsertVariable = useCallback((text) => {
    editorRef.current?.insertAtCursor(text);
    editorRef.current?.focus();
  }, []);

  const fetchAccounts = useCallback(() => emailAccountsAPI.getAll(true), []);
  const fetchTemplates = useCallback(() => emailTemplatesAPI.getAll(true), []);
  const { data: accounts } = useAsyncData(fetchAccounts, []);
  const { data: templates } = useAsyncData(fetchTemplates, []);
  const sendMutation = useMutation(emailSendAPI.send);

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

  const handleSearch = (value) => {
    setSearchQuery(value || '');
    setPage(1);
  };

  const openCompose = () => {
    const defaultAccountId = accounts?.[0]?.id ? String(accounts[0].id) : '';

    // Start with no template selected: user can type custom email or pick a template manually.
    setComposeForm({
      email_account_id: defaultAccountId,
      to: '',
      subject: '',
      body_html: '',
      template_id: '',
    });
    setSendError(null);
    setShowCompose(true);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSendError(null);
    if (!composeForm.email_account_id || !composeForm.to?.trim()) {
      setSendError('Account and To are required');
      return;
    }
    const hasTemplate = !!composeForm.template_id;
    const hasSubject = !!composeForm.subject?.trim();
    const hasBody = !!composeForm.body_html?.trim();
    if (!hasTemplate && (!hasSubject || !hasBody)) {
      setSendError('Subject and body are required when no template is selected');
      return;
    }
    const result = await sendMutation.mutate({
      email_account_id: Number(composeForm.email_account_id),
      to: composeForm.to.trim(),
      subject: composeForm.subject?.trim() || '',
      body_html: composeForm.body_html?.trim() || null,
      template_id: composeForm.template_id ? Number(composeForm.template_id) : undefined,
    });
    if (result?.data?.data) {
      setShowCompose(false);
      refetch();
    } else {
      setSendError(result?.error || 'Send failed');
    }
  };

  const accountOptions = (accounts || []).map((a) => ({ value: String(a.id), label: a.email_address }));
  const templateOptions = useMemo(
    () =>
      (templates || [])
        .filter((t) => t.status === 'active')
        .map((t) => ({
          value: String(t.id),
          label: t.name,
          email_account_id: t.email_account_id,
          subject: t.subject,
          body_html: t.body_html,
        })),
    [templates]
  );

  const templateById = useMemo(() => {
    const map = {};
    (templates || []).forEach((t) => {
      map[String(t.id)] = t;
    });
    return map;
  }, [templates]);

  const templateFilterOptions = useMemo(
    () => {
      const base =
        draftAccountId && draftAccountId !== ACCOUNT_ALL_VALUE
          ? templateOptions.filter((t) => String(t.email_account_id) === draftAccountId)
          : templateOptions;
      return base.map((t) => ({ value: t.value, label: t.label }));
    },
    [templateOptions, draftAccountId]
  );

  const previewSample = previewSampleData || DEFAULT_PREVIEW_DATA;
  const selectedTemplate = composeForm.template_id ? templateById[composeForm.template_id] : null;
  const previewSourceSubject = selectedTemplate ? selectedTemplate.subject || '' : composeForm.subject || '';
  const previewSourceBody = selectedTemplate ? selectedTemplate.body_html || '' : composeForm.body_html || '';
  const renderedBody = renderPreview(previewSourceBody, previewSample);
  const rawBody = previewSourceBody || '';
  const bodyIsHtml = /<[a-z][\s\S]*>/i.test(rawBody);
  const previewBodyHtml = bodyIsHtml ? linkifyHtml(renderedBody) : linkify(renderedBody);
  const previewSubject = renderPreview(previewSourceSubject, previewSample);

  const filteredMessages = useMemo(
    () =>
      messages.filter((m) => {
        if (appliedAccountId !== ACCOUNT_ALL_VALUE && String(m.email_account_id) !== appliedAccountId) {
          return false;
        }
        if (appliedTemplateId !== TEMPLATE_ALL_VALUE && String(m.template_id || '') !== appliedTemplateId) {
          return false;
        }
        return true;
      }),
    [messages, appliedAccountId, appliedTemplateId]
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Sent"
        description="Sent emails"
        actions={<Button onClick={openCompose}>Compose</Button>}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <FilterBar
        onApply={() => {
          setAppliedAccountId(draftAccountId);
          setAppliedTemplateId(draftTemplateId);
          setPage(1);
        }}
        onReset={() => {
          setDraftAccountId(ACCOUNT_ALL_VALUE);
          setDraftTemplateId(TEMPLATE_ALL_VALUE);
          setAppliedAccountId(ACCOUNT_ALL_VALUE);
          setAppliedTemplateId(TEMPLATE_ALL_VALUE);
          setPage(1);
        }}
      >
        <Select
          label="Account"
          value={draftAccountId}
          onChange={(e) => {
            setDraftAccountId(e.target.value);
            setDraftTemplateId(TEMPLATE_ALL_VALUE);
          }}
          options={[{ value: ACCOUNT_ALL_VALUE, label: 'All accounts' }, ...accountOptions]}
        />
        <Select
          label="Template"
          value={draftTemplateId}
          onChange={(e) => setDraftTemplateId(e.target.value)}
          options={[
            { value: TEMPLATE_ALL_VALUE, label: 'All templates' },
            ...templateFilterOptions,
          ]}
        />
      </FilterBar>

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <PaginationPageSize limit={limit} onLimitChange={(l) => { setLimit(l); setPage(1); }} />
          <SearchInput
            value={searchQuery}
            onSearch={handleSearch}
            placeholder="Search to, subject (press Enter)"
            className={listStyles.searchInToolbar}
          />
        </div>
        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {!filteredMessages?.length ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="📤"
                title="No sent emails"
                description="Sent emails will appear here."
                action={openCompose}
                actionLabel="Compose"
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Account</TableHeaderCell>
              <TableHeaderCell>To</TableHeaderCell>
              <TableHeaderCell>Subject</TableHeaderCell>
              <TableHeaderCell>Template</TableHeaderCell>
              <TableHeaderCell>Sent</TableHeaderCell>
              <TableHeaderCell width="80px">Open</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredMessages.map((row) => (
              <TableRow key={row.id}>
                <TableCell style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.account_email || '—'}</TableCell>
                <TableCell style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.to_email || '—'}</TableCell>
                <TableCell style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.subject || '—'}</TableCell>
                <TableCell style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.template_name || '—'}</TableCell>
                <TableCell>{row.sent_at ? new Date(row.sent_at).toLocaleString() : (row.created_at ? new Date(row.created_at).toLocaleString() : '—')}</TableCell>
                <TableCell>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedMessage(row)}>Open</Button>
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
            page={page}
            totalPages={Math.max(1, totalPages)}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(l) => { setLimit(l); setPage(1); }}
            hidePageSize
          />
        </div>
      </div>

      <Modal
        isOpen={!!selectedMessage}
        onClose={() => setSelectedMessage(null)}
        title={selectedMessage?.subject || 'Email'}
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setSelectedMessage(null)}>Close</Button>
          </ModalFooter>
        }
      >
        {selectedMessage && (
          <div className={styles.form} style={{ gap: 12 }}>
            <div><strong>From:</strong> {selectedMessage.from_email}</div>
            <div><strong>To:</strong> {selectedMessage.to_email}</div>
            <div><strong>Subject:</strong> {selectedMessage.subject}</div>
            <div><strong>Sent:</strong> {selectedMessage.sent_at ? new Date(selectedMessage.sent_at).toLocaleString() : '—'}</div>
            <div>
              <strong>Body</strong>
              <div
                style={{ marginTop: 8, padding: 12, background: 'var(--color-bg-subtle)', borderRadius: 6, maxHeight: 400, overflow: 'auto' }}
                dangerouslySetInnerHTML={{ __html: selectedMessage.body_html || selectedMessage.body_text || '—' }}
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showCompose}
        onClose={() => setShowCompose(false)}
        title="Compose"
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button onClick={handleSend} loading={sendMutation.loading}>Send</Button>
          </ModalFooter>
        }
      >
        <form onSubmit={handleSend} className={styles.form}>
          {sendError && <Alert variant="error">{sendError}</Alert>}
          <Select
            label="From (account)"
            value={composeForm.email_account_id}
            onChange={(e) => {
              const newAccountId = e.target.value;
              // When account changes, reset template + subject/body so we don't show mismatched template content
              setComposeForm({
                email_account_id: newAccountId,
                to: composeForm.to,
                subject: '',
                body_html: '',
                template_id: '',
              });
            }}
            options={accountOptions}
            placeholder="Select account"
          />
          <Input
            label="To"
            value={composeForm.to}
            onChange={(e) => setComposeForm({ ...composeForm, to: e.target.value })}
            placeholder="email@example.com"
          />
          <Select
            label="Template (optional)"
            value={composeForm.template_id}
            onChange={(e) => {
              const templateId = e.target.value;
              if (!templateId) {
                // Switching back to "None": clear subject/body so user writes custom content.
                setComposeForm({ ...composeForm, template_id: '', subject: '', body_html: '' });
                return;
              }
              const t = templateById[templateId];
              setComposeForm({
                ...composeForm,
                template_id: templateId,
                subject: t?.subject || '',
                body_html: t?.body_html || '',
              });
            }}
            options={[
              { value: '', label: '— None —' },
              ...templateOptions
                .filter((t) => !composeForm.email_account_id || String(t.email_account_id) === composeForm.email_account_id)
                .map((t) => ({ value: t.value, label: t.label })),
            ]}
          />
          {composeForm.template_id && templateById[composeForm.template_id] ? (
            <>
              <Input
                label="Subject (from template)"
                value={composeForm.subject}
                disabled
              />
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Body (from template)</label>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    maxHeight: 260,
                    overflow: 'auto',
                    background: 'var(--color-bg-subtle)',
                    fontSize: '0.875rem',
                  }}
                  dangerouslySetInnerHTML={{ __html: composeForm.body_html || '<em>No content</em>' }}
                />
                <div style={{ marginTop: 8 }}>
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
            </>
          ) : (
            <>
              <Input
                label="Subject"
                value={composeForm.subject}
                onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
                placeholder="Subject"
              />
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ flex: 1.6 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Body (HTML)</label>
                  <ScriptBodyEditor
                    ref={editorRef}
                    value={composeForm.body_html}
                    onChange={(content) => setComposeForm({ ...composeForm, body_html: content })}
                    onEditorState={(plain, index) => {
                      setEditorPlainText(plain);
                      setEditorCursorIndex(index ?? 0);
                    }}
                    placeholder="Write your email body. Use variables like {{contact_first_name}}."
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
                  <VariableSelector onInsert={handleInsertVariable} />
                </div>
              </div>
            </>
          )}
        </form>
      </Modal>

      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title="Email Preview"
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
              dangerouslySetInnerHTML={{ __html: previewBodyHtml || '<em>No content</em>' }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
