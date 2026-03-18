import React, { useState, useCallback } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination, PaginationPageSize } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { emailMessagesAPI, emailAccountsAPI, emailTemplatesAPI, emailSendAPI } from '../../services/emailAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import styles from '../../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';

const PAGE_SIZE = 20;

export function EmailInboxPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const fetchMessages = useCallback(
    () =>
      emailMessagesAPI.getAll({
        folder: 'inbox',
        search: searchQuery || undefined,
        limit,
        offset: (page - 1) * limit,
      }),
    [searchQuery, page, limit]
  );
  const { data: response, loading, error, refetch } = useAsyncData(fetchMessages, [searchQuery, page, limit], {
    transform: (res) => res?.data ?? { data: [], total: 0 },
  });
  const messages = response?.data ?? [];
  const total = response?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({ email_account_id: '', to: '', subject: '', body_html: '', template_id: '' });
  const [sendError, setSendError] = useState(null);

  const fetchAccounts = useCallback(() => emailAccountsAPI.getAll(true), []);
  const fetchTemplates = useCallback(() => emailTemplatesAPI.getAll(true), []);
  const { data: accounts } = useAsyncData(fetchAccounts, []);
  const { data: templates } = useAsyncData(fetchTemplates, []);
  const sendMutation = useMutation(emailSendAPI.send);

  const handleSearch = (value) => {
    setSearchQuery(value || '');
    setPage(1);
  };

  const openCompose = () => {
    setComposeForm({
      email_account_id: accounts?.[0]?.id ? String(accounts[0].id) : '',
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
  const templateOptions = (templates || []).map((t) => ({ value: String(t.id), label: t.name }));

  if (loading && !messages.length && page === 1) {
    return (
      <div className={styles.page}>
        <PageHeader title="Inbox" />
        <div className={styles.loading}><Spinner size="lg" /></div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Inbox"
        description="Received emails"
        actions={<Button onClick={openCompose}>Compose</Button>}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <PaginationPageSize limit={limit} onLimitChange={(l) => { setLimit(l); setPage(1); }} />
          <SearchInput
            value={searchQuery}
            onSearch={handleSearch}
            placeholder="Search from, to, subject (press Enter)"
            className={listStyles.searchInToolbar}
          />
        </div>
        {!messages?.length ? (
          <div className={listStyles.tableCardEmpty}>
            <EmptyState
              icon="📥"
              title="No emails in inbox"
              description="Received emails will appear here. Use Compose to send."
              action={openCompose}
              actionLabel="Compose"
            />
          </div>
        ) : (
          <div className={listStyles.tableCardBody}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>From</TableHeaderCell>
                  <TableHeaderCell>To</TableHeaderCell>
                  <TableHeaderCell>Subject</TableHeaderCell>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell width="80px">Open</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {messages.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.from_email || '—'}</TableCell>
                    <TableCell style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.to_email || '—'}</TableCell>
                    <TableCell style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.subject || '—'}</TableCell>
                    <TableCell>{row.received_at ? new Date(row.received_at).toLocaleString() : (row.created_at ? new Date(row.created_at).toLocaleString() : '—')}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedMessage(row)}>Open</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
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
            <div><strong>Date:</strong> {selectedMessage.received_at ? new Date(selectedMessage.received_at).toLocaleString() : selectedMessage.created_at ? new Date(selectedMessage.created_at).toLocaleString() : '—'}</div>
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
            onChange={(e) => setComposeForm({ ...composeForm, email_account_id: e.target.value })}
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
            onChange={(e) => setComposeForm({ ...composeForm, template_id: e.target.value })}
            options={[{ value: '', label: '— None —' }, ...templateOptions]}
          />
          <Input
            label="Subject"
            value={composeForm.subject}
            onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
            placeholder="Subject"
          />
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Body (HTML)</label>
            <textarea
              value={composeForm.body_html}
              onChange={(e) => setComposeForm({ ...composeForm, body_html: e.target.value })}
              rows={10}
              style={{ width: '100%', padding: 10, borderRadius: 6, border: '1px solid var(--color-border)', fontFamily: 'inherit' }}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
