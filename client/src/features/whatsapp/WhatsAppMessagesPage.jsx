import React, { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination, PaginationPageSize } from '../../components/ui/Pagination';
import { whatsappMessagesAPI, whatsappSendAPI, whatsappTemplatesAPI, whatsappAccountsAPI, whatsappSettingsAPI } from '../../services/whatsappAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import styles from '../../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';
import { FilterBar } from '../../components/admin/FilterBar';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { Spinner } from '../../components/ui/Spinner';
import { usePermissions } from '../../hooks/usePermission';
import { PERMISSIONS } from '../../utils/permissionUtils';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_NATIONAL_MAX_DIGITS,
  buildE164FromParts,
  clampNationalDigits,
  getCallingCodeOptionsForSelect,
  normalizeCallingCode,
  splitE164ToParts,
} from '../../utils/phoneInput';

const STATUS_VARIANTS = {
  pending: 'muted',
  sent: 'success',
  delivered: 'success',
  read: 'success',
  failed: 'danger',
};

/** Extract {{1}}, {{2}}, ... from text in order (unique, by index). */
function parseBodyVariables(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
  const seen = new Set();
  const order = [];
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (!seen.has(n)) {
      seen.add(n);
      order.push(n);
    }
  }
  order.sort((a, b) => a - b);
  return order;
}

/** Get all placeholder indices from HEADER, BODY, FOOTER in order (sorted by index). Returns [{ index, componentType }, ...]. */
function getAllParamIndicesWithComponent(template) {
  if (!template?.components) return [];
  const order = ['HEADER', 'BODY', 'FOOTER'];
  const byIndex = {};
  for (const type of order) {
    const comp = template.components.find((c) => (c.component_type || '').toUpperCase() === type);
    const text = comp?.component_text || '';
    const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
    for (const m of matches) {
      const n = parseInt(m[1], 10);
      if (byIndex[n] == null) byIndex[n] = type;
    }
  }
  const indices = Object.keys(byIndex).map(Number).sort((a, b) => a - b);
  return indices.map((index) => ({ index, componentType: byIndex[index] }));
}

/** Get body component text from template with components. */
function getBodyComponentText(template) {
  if (!template?.components) return '';
  const body = template.components.find((c) => c.component_type === 'BODY');
  return body?.component_text || '';
}

/** Build preview from all components (HEADER + BODY + FOOTER) with param values. */
function buildFullPreviewText(template, paramValues) {
  if (!template?.components) return '';
  const replace = (text) =>
    (text || '').replace(/\{\{(\d+)\}\}/g, (_, n) => paramValues[String(n)] ?? `{{${n}}}`);
  const order = ['HEADER', 'BODY', 'FOOTER'];
  const parts = [];
  for (const type of order) {
    const comp = template.components.find((c) => (c.component_type || '').toUpperCase() === type);
    if (comp?.component_text) parts.push(replace(comp.component_text));
  }
  return parts.join('\n').trim();
}

/** Build preview text by replacing {{1}}, {{2}} with values (single text). */
function buildPreviewText(bodyText, paramValues) {
  if (!bodyText) return '';
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => paramValues[String(n)] ?? `{{${n}}}`);
}

const PAGE_SIZE = 20;

export function WhatsAppMessagesPage() {
  const { can } = usePermissions();
  const canSend = can(PERMISSIONS.WHATSAPP_SEND) || can(PERMISSIONS.SETTINGS_MANAGE);
  const user = useAppSelector(selectUser);
  const showSentByColumn = user?.role === 'manager' || user?.role === 'admin';

  const { formatDateTime } = useDateTimeDisplay();
  const [appliedStatus, setAppliedStatus] = useState('all');
  const [appliedAccount, setAppliedAccount] = useState('__all__');
  const [appliedTemplate, setAppliedTemplate] = useState('all');
  const [draftStatus, setDraftStatus] = useState('all');
  const [draftAccount, setDraftAccount] = useState('__all__');
  const [draftTemplate, setDraftTemplate] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const fetchMessages = useCallback(
    () =>
      whatsappMessagesAPI.getAll({
        status: appliedStatus === 'all' ? undefined : appliedStatus,
        whatsapp_account_id: appliedAccount === '__all__' ? undefined : appliedAccount,
        template_id: appliedTemplate === 'all' ? undefined : appliedTemplate,
        search: searchQuery || undefined,
        limit,
        offset: (page - 1) * limit,
      }),
    [appliedStatus, appliedAccount, appliedTemplate, searchQuery, page, limit]
  );
  const { data: messagesResponse, loading, error, refetch } = useAsyncData(fetchMessages, [appliedStatus, appliedAccount, appliedTemplate, searchQuery, page, limit], {
    transform: (res) => res?.data ?? { data: [], total: 0 },
  });
  const messages = messagesResponse?.data ?? [];
  const total = messagesResponse?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);
  const handleSearch = (value) => {
    setSearchQuery(value || '');
    setPage(1);
  };
  const fetchTemplates = useCallback(() => whatsappTemplatesAPI.getAll(true), []);
  const fetchAccounts = useCallback(() => whatsappAccountsAPI.getAll(true), []);
  const { data: templates } = useAsyncData(fetchTemplates, []);
  const { data: accounts } = useAsyncData(fetchAccounts, []);

  const [deliveryMode, setDeliveryMode] = useState('automatic'); // 'automatic' | 'manual'
  const [automationEnabled, setAutomationEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    whatsappSettingsAPI
      .getSettings()
      .then((res) => {
        if (!cancelled) {
          const settings = res?.data?.data || {};
          const mode = settings.mode || 'manual';
          const enabled =
            settings.automationEnabled !== undefined ? !!settings.automationEnabled : true;
          setDeliveryMode(mode);
          setAutomationEnabled(enabled);
          setSendDeliveryMode(enabled ? 'automatic' : 'manual');
        }
      })
      .catch(() => {
        if (!cancelled) setDeliveryMode('manual');
      });
    return () => { cancelled = true; };
  }, []);

  const [showSendModal, setShowSendModal] = useState(false);
  const [sendMode, setSendMode] = useState('template'); // 'template' | 'text'
  const [sendDeliveryMode, setSendDeliveryMode] = useState('automatic'); // 'automatic' | 'manual'
  const [sendForm, setSendForm] = useState({
    whatsapp_account_id: '',
    phone: '',
    template_id: '',
    bodyParamValues: {}, // { "1": "", "2": "", ... }
    message_text: '',
  });
  const [selectedTemplateDetail, setSelectedTemplateDetail] = useState(null);
  const [loadingTemplateDetail, setLoadingTemplateDetail] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);

  const sendTemplateMutation = useMutation(whatsappSendAPI.sendTemplate);
  const sendTextMutation = useMutation(whatsappSendAPI.sendText);

  const openSend = (initialPhone = '') => {
    setSendMode('template');
    const parts = splitE164ToParts(initialPhone);
    setSendForm({
      whatsapp_account_id: accounts?.[0]?.id ? String(accounts[0].id) : '',
      phone_country_code: normalizeCallingCode(parts.country_code),
      phone_national: parts.national,
      template_id: '',
      bodyParamValues: {},
      message_text: '',
    });
    setSelectedTemplateDetail(null);
    setSendError(null);
    setShowSendModal(true);
  };

  useEffect(() => {
    if (!sendForm.template_id) {
      setSelectedTemplateDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingTemplateDetail(true);
    whatsappTemplatesAPI
      .getById(sendForm.template_id)
      .then((res) => {
        if (!cancelled && res?.data?.data) {
          setSelectedTemplateDetail(res.data.data);
          const paramSpecs = getAllParamIndicesWithComponent(res.data.data);
          const initial = {};
          paramSpecs.forEach(({ index }) => { initial[String(index)] = ''; });
          setSendForm((prev) => ({ ...prev, bodyParamValues: initial }));
        }
      })
      .catch(() => {
        if (!cancelled) setSelectedTemplateDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplateDetail(false);
      });
    return () => { cancelled = true; };
  }, [sendForm.template_id]);

  const setBodyParam = (index, value) => {
    setSendForm((prev) => ({
      ...prev,
      bodyParamValues: { ...prev.bodyParamValues, [String(index)]: value },
    }));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSendError(null);
    const national = clampNationalDigits(sendForm.phone_national);
    if (!national || national.length !== PHONE_NATIONAL_MAX_DIGITS) {
      setSendError(`Phone number must be exactly ${PHONE_NATIONAL_MAX_DIGITS} digits (plus country code)`);
      return;
    }
    const fullPhone = buildE164FromParts(sendForm.phone_country_code, national);
    if (!sendForm.whatsapp_account_id) {
      setSendError('Select a WhatsApp account');
      return;
    }

    const selectedAccount = (accounts || []).find(
      (a) => String(a.id) === sendForm.whatsapp_account_id
    );
    const selectedTemplate = (templates || []).find(
      (t) => String(t.id) === sendForm.template_id
    );
    const isManualAccount = (selectedAccount?.provider || '').toLowerCase() === 'manual';
    const isManualTemplate =
      selectedTemplate?.template_mode === 'manual' ||
      selectedTemplateDetail?.template_mode === 'manual';
    const canAutomatic =
      automationEnabled && !isManualAccount && !isManualTemplate && sendMode === 'template';
    const effectiveMode =
      canAutomatic && sendDeliveryMode === 'automatic' ? 'automatic' : 'manual';

    if (sendMode === 'text') {
      const message_text = sendForm.message_text?.trim();
      if (!message_text) {
        setSendError('Message text is required');
        return;
      }
      const payload = {
        whatsapp_account_id: Number(sendForm.whatsapp_account_id),
        phone: fullPhone,
        message_text,
      };
      const result = await sendTextMutation.mutate(payload);
      if (result?.success) {
        setShowSendModal(false);
        refetch();
      } else {
        setSendError(result?.error || 'Send failed');
      }
      return;
    }

    if (!sendForm.template_id) {
      setSendError('Select a template');
      return;
    }

    const paramSpecs = getAllParamIndicesWithComponent(selectedTemplateDetail);
    const sortedIndices = paramSpecs.map((p) => p.index);
    const body_parameters = sortedIndices.map((n) => String(sendForm.bodyParamValues[String(n)] ?? '').trim());

    const payload = {
      whatsapp_account_id: Number(sendForm.whatsapp_account_id),
      phone: fullPhone,
      template_id: Number(sendForm.template_id),
      body_parameters,
      force_manual: effectiveMode === 'manual',
    };

    const result = await sendTemplateMutation.mutate(payload);
    if (result?.success) {
      const waLink = result?.data?.data?.wa_link;
      if (waLink && typeof window !== 'undefined') {
        window.open(waLink, '_blank');
      }
      setShowSendModal(false);
      refetch();
    } else {
      setSendError(result?.error || 'Send failed');
    }
  };

  const accountOptions = (accounts || []).map((a) => ({ value: String(a.id), label: a.phone_number }));
  const templateOptionsAll = (templates || []).map((t) => ({ value: String(t.id), label: `${t.template_name} (${t.language})`, whatsapp_account_id: t.whatsapp_account_id ? String(t.whatsapp_account_id) : '' }));
  const filteredTemplateOptions = templateOptionsAll.filter(
    (t) =>
      !sendForm.whatsapp_account_id ||
      !t.whatsapp_account_id ||
      t.whatsapp_account_id === sendForm.whatsapp_account_id
  );
  const templateOptions = filteredTemplateOptions.map(({ value, label }) => ({ value, label }));

  const paramSpecs = selectedTemplateDetail ? getAllParamIndicesWithComponent(selectedTemplateDetail) : [];
  const previewText = selectedTemplateDetail
    ? buildFullPreviewText(selectedTemplateDetail, sendForm.bodyParamValues)
    : '';

  return (
    <div className={styles.page}>
      <PageHeader
        title="WhatsApp Messages"
        description={
          showSentByColumn
            ? 'Messages sent by you and your team. Send template or text messages from here.'
            : 'Your sent messages. Send template or text messages from here.'
        }
        actions={
          canSend ? (
            <Button onClick={() => openSend()}>Send template message</Button>
          ) : null
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <FilterBar
        onApply={() => {
          setAppliedStatus(draftStatus);
          setAppliedAccount(draftAccount);
          setAppliedTemplate(draftTemplate);
          setPage(1);
        }}
        onReset={() => {
          setDraftStatus('all');
          setDraftAccount('__all__');
          setDraftTemplate('all');
          setAppliedStatus('all');
          setAppliedAccount('__all__');
          setAppliedTemplate('all');
          setPage(1);
        }}
      >
        <Select
          label="Status"
          value={draftStatus}
          onChange={(e) => setDraftStatus(e.target.value)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'sent', label: 'Sent' },
            { value: 'delivered', label: 'Delivered' },
            { value: 'read', label: 'Read' },
            { value: 'failed', label: 'Failed' },
          ]}
        />
        <Select
          label="Account"
          value={draftAccount}
          onChange={(e) => {
            setDraftAccount(e.target.value);
            setDraftTemplate('all');
          }}
          options={[
            { value: '__all__', label: 'All accounts' },
            ...accountOptions,
          ]}
        />
        <Select
          label="Template"
          value={draftTemplate}
          onChange={(e) => setDraftTemplate(e.target.value)}
          options={[
            { value: 'all', label: 'All templates' },
            ...(templates || [])
              .filter((t) =>
                draftAccount === '__all__'
                  ? true
                  : t.whatsapp_account_id &&
                    String(t.whatsapp_account_id) === draftAccount
              )
              .map((t) => ({
                value: String(t.id),
                label: `${t.template_name} (${t.language})`,
              })),
          ]}
        />
      </FilterBar>

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <PaginationPageSize limit={limit} onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }} />
          <SearchInput
            value={searchQuery}
            onSearch={handleSearch}
            placeholder="Search phone, text, or provider ID (press Enter)"
            className={listStyles.searchInToolbar}
          />
        </div>
        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {!messages?.length ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="💬"
                title="No messages yet"
                description={
                  canSend
                    ? 'Send a template message to get started.'
                    : 'No messages have been sent yet.'
                }
                action={canSend ? () => openSend() : undefined}
                actionLabel={canSend ? 'Send message' : undefined}
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Phone</TableHeaderCell>
                  {showSentByColumn ? <TableHeaderCell>Sent by</TableHeaderCell> : null}
                  <TableHeaderCell>Template</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Sent at</TableHeaderCell>
                  <TableHeaderCell>Created</TableHeaderCell>
                  <TableHeaderCell width="80px" align="center">Details</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {messages.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.phone || '—'}</TableCell>
                    {showSentByColumn ? (
                      <TableCell>
                        {row.sender_name || row.sender_email || (row.created_by ? `User #${row.created_by}` : '—')}
                      </TableCell>
                    ) : null}
                    <TableCell>{row.template_name ? row.template_name : (row.message_text ? '(Text)' : '—')}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[row.status] || 'muted'}>{row.status}</Badge>
                    </TableCell>
                    <TableCell>{row.sent_at ? formatDateTime(row.sent_at) : '—'}</TableCell>
                    <TableCell>{row.created_at ? formatDateTime(row.created_at) : '—'}</TableCell>
                    <TableCell align="center">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedMessage(row)}>Details</Button>
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
            onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
            hidePageSize
          />
        </div>
      </div>

      <Modal
        isOpen={!!selectedMessage}
        onClose={() => setSelectedMessage(null)}
        title="Message details"
        size="md"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setSelectedMessage(null)}>Close</Button>
          </ModalFooter>
        }
      >
        {selectedMessage && (
          <div className={styles.form} style={{ gap: 16 }}>
            <div>
              <strong>Phone:</strong> {selectedMessage.phone || '—'}
            </div>
            <div>
              <strong>Template:</strong> {selectedMessage.template_name || (selectedMessage.message_text ? '(Text message)' : '—')}
            </div>
            {showSentByColumn && (
              <div>
                <strong>Sent by:</strong>{' '}
                {selectedMessage.sender_name ||
                  selectedMessage.sender_email ||
                  (selectedMessage.created_by ? `User #${selectedMessage.created_by}` : '—')}
              </div>
            )}
            <div>
              <strong>Status:</strong>{' '}
              <Badge variant={STATUS_VARIANTS[selectedMessage.status] || 'muted'}>{selectedMessage.status}</Badge>
            </div>
            {selectedMessage.message_text && (
              <div>
                <strong>Message text:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', padding: 8, background: 'var(--color-bg-subtle)', borderRadius: 4, fontSize: '0.875rem' }}>
                  {selectedMessage.message_text}
                </pre>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <strong>Timeline</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, listStyle: 'disc' }}>
                <li><strong>Created:</strong> {selectedMessage.created_at ? formatDateTime(selectedMessage.created_at) : '—'}</li>
                <li><strong>Sent:</strong> {selectedMessage.sent_at ? formatDateTime(selectedMessage.sent_at) : '—'}</li>
                <li><strong>Delivered:</strong> {selectedMessage.delivered_at ? formatDateTime(selectedMessage.delivered_at) : '—'}</li>
                <li><strong>Read:</strong> {selectedMessage.read_at ? formatDateTime(selectedMessage.read_at) : '—'}</li>
              </ul>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        title="Send message"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowSendModal(false)}>Cancel</Button>
            <Button onClick={handleSend} loading={sendTemplateMutation.loading || sendTextMutation.loading}>Send</Button>
          </ModalFooter>
        }
      >
        <form onSubmit={handleSend} className={styles.form}>
          {sendError && <Alert variant="error">{sendError}</Alert>}
          <div style={{ marginBottom: 16 }}>
            <label className={styles.panelTitle} style={{ display: 'block', marginBottom: 8 }}>Message type</label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === 'template'}
                  onChange={() => setSendMode('template')}
                />
                Template message
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="sendMode"
                  checked={sendMode === 'text'}
                  onChange={() => setSendMode('text')}
                />
                Text message (free-form)
              </label>
            </div>
            {sendMode === 'text' && (
              <p style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Only works within 24 hours of the recipient’s last message to you.
              </p>
            )}
          </div>
          {sendMode === 'template' && (
            <div style={{ marginBottom: 16 }}>
              <label className={styles.panelTitle} style={{ display: 'block', marginBottom: 8 }}>Send as</label>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="sendDeliveryMode"
                    checked={sendDeliveryMode === 'automatic'}
                    onChange={() => setSendDeliveryMode('automatic')}
                    disabled={
                      !automationEnabled ||
                      (() => {
                        const account = (accounts || []).find(
                          (a) => String(a.id) === sendForm.whatsapp_account_id
                        );
                        const template = (templates || []).find(
                          (t) => String(t.id) === sendForm.template_id
                        );
                        const isManualAccount =
                          (account?.provider || '').toLowerCase() === 'manual';
                        const isManualTemplate =
                          template?.template_mode === 'manual' ||
                          selectedTemplateDetail?.template_mode === 'manual';
                        return isManualAccount || isManualTemplate;
                      })()
                    }
                  />
                  Automatic (API)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="sendDeliveryMode"
                    checked={sendDeliveryMode === 'manual'}
                    onChange={() => setSendDeliveryMode('manual')}
                  />
                  Manual (WhatsApp Web)
                </label>
              </div>
            </div>
          )}
          <Select
            label="WhatsApp account"
            value={sendForm.whatsapp_account_id}
            onChange={(e) =>
              setSendForm({
                ...sendForm,
                whatsapp_account_id: e.target.value,
                template_id: '',
              })
            }
            options={accountOptions}
            placeholder="Select account"
          />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '0 1 200px', minWidth: 160 }}>
              <Select
                label="Country code"
                value={normalizeCallingCode(sendForm.phone_country_code)}
                onChange={(e) =>
                  setSendForm({ ...sendForm, phone_country_code: e.target.value })
                }
                options={getCallingCodeOptionsForSelect(sendForm.phone_country_code)}
              />
            </div>
            <div style={{ flex: '1 1 200px', minWidth: 160 }}>
              <Input
                label="Phone number"
                value={sendForm.phone_national}
                onChange={(e) =>
                  setSendForm({
                    ...sendForm,
                    phone_national: clampNationalDigits(e.target.value),
                  })
                }
                placeholder={`${PHONE_NATIONAL_MAX_DIGITS}-digit number`}
                inputMode="numeric"
                maxLength={PHONE_NATIONAL_MAX_DIGITS}
              />
            </div>
          </div>

          {sendMode === 'text' ? (
            <div style={{ marginTop: 12 }}>
              <label className={styles.panelTitle}>Message</label>
              <textarea
                value={sendForm.message_text}
                onChange={(e) => setSendForm({ ...sendForm, message_text: e.target.value })}
                placeholder="Type your message…"
                rows={5}
                maxLength={4096}
                style={{
                  width: '100%',
                  marginTop: 6,
                  padding: 10,
                  borderRadius: 6,
                  border: '1px solid var(--color-border)',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {(sendForm.message_text || '').length}/4096
              </span>
            </div>
          ) : (
            <>
          <Select
            label="Template"
            value={sendForm.template_id}
            onChange={(e) => setSendForm({ ...sendForm, template_id: e.target.value })}
            options={templateOptions}
            placeholder="Select template"
          />

          {loadingTemplateDetail && sendForm.template_id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spinner size="sm" /> Loading template…
            </div>
          )}

          {selectedTemplateDetail && paramSpecs.length > 0 && !loadingTemplateDetail && (
            <>
              <div style={{ marginTop: 12 }}>
                <label className={styles.panelTitle}>Template parameters (Header / Body / Footer)</label>
                {paramSpecs.map(({ index, componentType }) => (
                  <div key={index} style={{ marginTop: 8 }}>
                    <Input
                      label={`{{${index}}} (${componentType})`}
                      value={sendForm.bodyParamValues[String(index)] ?? ''}
                      onChange={(e) => setBodyParam(index, e.target.value)}
                      placeholder={`Value for {{${index}}}`}
                    />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <label className={styles.panelTitle}>Message preview</label>
                <div
                  style={{
                    marginTop: 6,
                    padding: 12,
                    background: 'var(--color-bg-subtle)',
                    borderRadius: 6,
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.875rem',
                    minHeight: 60,
                  }}
                >
                  {previewText || '—'}
                </div>
              </div>
            </>
          )}
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}
