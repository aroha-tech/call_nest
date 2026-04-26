import React, { useCallback, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { ModalFooter } from '../../components/ui/Modal';
import { SlidePanel } from '../../components/ui/SlidePanel';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination, PaginationPageSize } from '../../components/ui/Pagination';
import { Badge } from '../../components/ui/Badge';
import { emailCampaignsAPI, emailAccountsAPI, emailTemplatesAPI } from '../../services/emailAPI';
import { contactsAPI } from '../../services/contactsAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import styles from '../../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';

const STATUS_ALL = 'all';
const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: STATUS_ALL, label: 'All status' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function parseRecipients(raw) {
  return String(raw || '')
    .split(/[\n,;]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function statusVariant(status) {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
    case 'queued':
      return 'info';
    case 'failed':
    case 'cancelled':
      return 'danger';
    case 'scheduled':
      return 'warning';
    default:
      return 'muted';
  }
}

export function EmailCampaignsPage() {
  const { formatDateTime } = useDateTimeDisplay();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState(STATUS_ALL);
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [queueError, setQueueError] = useState(null);

  const [form, setForm] = useState({
    name: '',
    email_account_id: '',
    template_id: '',
    recipient_emails_text: '',
    contact_ids_text: '',
  });

  const fetchCampaigns = useCallback(
    () =>
      emailCampaignsAPI.list({
        page,
        limit,
        status: status === STATUS_ALL ? undefined : status,
        search: searchQuery || undefined,
      }),
    [page, limit, status, searchQuery]
  );

  const { data: campaignResponse, loading, error, refetch } = useAsyncData(
    fetchCampaigns,
    [page, limit, status, searchQuery],
    {
      transform: (res) => res?.data ?? { data: [], total: 0, page: 1, totalPages: 1 },
    }
  );

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);
  const campaigns = campaignResponse?.data ?? [];
  const total = campaignResponse?.total ?? 0;
  const totalPages = Math.max(1, campaignResponse?.totalPages || Math.ceil(total / limit) || 1);

  const fetchAccounts = useCallback(() => emailAccountsAPI.getAll(false), []);
  const fetchTemplates = useCallback(() => emailTemplatesAPI.getAll(false), []);
  const fetchContacts = useCallback(
    () => contactsAPI.getAll({ page: 1, limit: 200, type: 'contact' }),
    []
  );
  const { data: accountsData } = useAsyncData(fetchAccounts, []);
  const { data: templatesData } = useAsyncData(fetchTemplates, []);
  const { data: contactsData } = useAsyncData(fetchContacts, []);
  const createMutation = useMutation(emailCampaignsAPI.create);
  const queueMutation = useMutation(emailCampaignsAPI.queue);

  const accounts = accountsData || [];
  const templates = templatesData || [];
  const contacts = contactsData?.data || [];

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: String(a.id),
        label: a.account_name || a.email_address,
      })),
    [accounts]
  );

  const templateOptions = useMemo(
    () =>
      templates.map((t) => ({
        value: String(t.id),
        label: t.name,
      })),
    [templates]
  );

  const contactOptions = useMemo(
    () =>
      contacts.map((c) => ({
        value: String(c.id),
        label: c.display_name || c.email || `Contact #${c.id}`,
      })),
    [contacts]
  );

  const onCreate = async (e) => {
    e.preventDefault();
    setCreateError(null);
    const recipientEmails = parseRecipients(form.recipient_emails_text);
    const contactIds = parseRecipients(form.contact_ids_text)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0);

    if (!form.name.trim()) {
      setCreateError('Campaign name is required');
      return;
    }
    if (!form.email_account_id) {
      setCreateError('Please select an email account');
      return;
    }
    if (recipientEmails.length === 0 && contactIds.length === 0) {
      setCreateError('Add recipients via emails and/or contact IDs');
      return;
    }

    const result = await createMutation.mutate({
      name: form.name.trim(),
      email_account_id: Number(form.email_account_id),
      template_id: form.template_id ? Number(form.template_id) : undefined,
      recipient_emails: recipientEmails,
      contact_ids: contactIds,
    });
    if (result?.data?.data) {
      setShowCreate(false);
      setForm({
        name: '',
        email_account_id: '',
        template_id: '',
        recipient_emails_text: '',
        contact_ids_text: '',
      });
      refetch();
    } else {
      setCreateError(result?.error || 'Failed to create campaign');
    }
  };

  const onQueue = async (campaignId) => {
    setQueueError(null);
    const result = await queueMutation.mutate(campaignId);
    if (result?.data?.data) {
      refetch();
      return;
    }
    setQueueError(result?.error || 'Failed to queue campaign');
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Email Campaigns"
        description="Create and queue bulk email campaigns from connected accounts."
        actions={<Button onClick={() => setShowCreate(true)}>+ New Campaign</Button>}
      />

      {error && <Alert variant="error">{error}</Alert>}
      {queueError && <Alert variant="error">{queueError}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <PaginationPageSize
            limit={limit}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
          />
          <SearchInput
            value={searchQuery}
            onSearch={(v) => {
              setSearchQuery(v || '');
              setPage(1);
            }}
            placeholder="Search campaigns (press Enter)"
            className={listStyles.searchInToolbar}
          />
        </div>

        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {!campaigns.length ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="📣"
                title="No campaigns found"
                description="Create your first bulk email campaign."
                action={() => setShowCreate(true)}
                actionLabel="New Campaign"
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Name</TableHeaderCell>
                    <TableHeaderCell>Account</TableHeaderCell>
                    <TableHeaderCell>Template</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Recipients</TableHeaderCell>
                    <TableHeaderCell>Sent / Failed</TableHeaderCell>
                    <TableHeaderCell>Created</TableHeaderCell>
                    <TableHeaderCell width="120px">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {campaigns.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>{row.account_name || row.account_email || '—'}</TableCell>
                      <TableCell>{row.template_name || 'Custom'}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                      </TableCell>
                      <TableCell>{row.total_recipients || 0}</TableCell>
                      <TableCell>
                        {row.sent_count || 0} / {row.failed_count || 0}
                      </TableCell>
                      <TableCell>{row.created_at ? formatDateTime(row.created_at) : '—'}</TableCell>
                      <TableCell>
                        {['draft', 'scheduled', 'paused', 'failed'].includes(row.status) ? (
                          <Button
                            size="sm"
                            onClick={() => onQueue(row.id)}
                            loading={queueMutation.loading}
                          >
                            Queue
                          </Button>
                        ) : (
                          <span>—</span>
                        )}
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
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
            hidePageSize
          />
        </div>
      </div>

      <SlidePanel
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Email Campaign"
        size="xl"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={onCreate} loading={createMutation.loading}>
              Create
            </Button>
          </ModalFooter>
        }
      >
        <form className={styles.form} onSubmit={onCreate}>
          {createError && <Alert variant="error">{createError}</Alert>}
          <Input
            label="Campaign name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="April promo - batch 1"
          />
          <Select
            label="From account"
            value={form.email_account_id}
            onChange={(e) => setForm((prev) => ({ ...prev, email_account_id: e.target.value }))}
            options={accountOptions}
            placeholder="Select account"
          />
          <Select
            label="Template (optional)"
            value={form.template_id}
            onChange={(e) => setForm((prev) => ({ ...prev, template_id: e.target.value }))}
            options={[{ value: '', label: '— None (custom content from API) —' }, ...templateOptions]}
          />
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Recipient emails (comma or new line separated)
            </label>
            <textarea
              value={form.recipient_emails_text}
              onChange={(e) => setForm((prev) => ({ ...prev, recipient_emails_text: e.target.value }))}
              rows={5}
              placeholder="a@example.com, b@example.com"
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--color-border)', padding: 10 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>
              Contact IDs (optional, comma/new line)
            </label>
            <textarea
              value={form.contact_ids_text}
              onChange={(e) => setForm((prev) => ({ ...prev, contact_ids_text: e.target.value }))}
              rows={3}
              placeholder="101, 102, 103"
              style={{ width: '100%', borderRadius: 8, border: '1px solid var(--color-border)', padding: 10 }}
            />
            <small style={{ color: 'var(--color-text-muted)' }}>
              Tip: Available contacts in system: {contactOptions.slice(0, 8).map((c) => c.value).join(', ') || 'none'}
              {contactOptions.length > 8 ? ' ...' : ''}
            </small>
          </div>
        </form>
      </SlidePanel>
    </div>
  );
}
