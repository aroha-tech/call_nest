import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Modal, ModalFooter, ConfirmModal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { meetingsAPI } from '../services/meetingsAPI';
import { emailAccountsAPI } from '../services/emailAPI';
import { usePermissions } from '../hooks/usePermission';
import { PERMISSIONS } from '../utils/permissionUtils';
import styles from './MeetingsPage.module.scss';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MEETING_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rescheduled', label: 'Rescheduled' },
];

const MEETING_TEMPLATE_TABS = [
  { kind: 'created', label: 'New meeting' },
  { kind: 'updated', label: 'Updated' },
  { kind: 'cancelled', label: 'Cancelled' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @param {Date} d */
function toYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function localDatetimeToMysql(s) {
  if (!s) return '';
  const t = String(s).trim();
  if (!t) return '';
  const n = t.replace('T', ' ');
  if (n.length === 16) return `${n}:00`;
  return n.length === 19 ? n : n;
}

function mysqlToDatetimeLocal(mysql) {
  if (!mysql) return '';
  const s = String(mysql).replace(' ', 'T').slice(0, 16);
  return s;
}

function monthRange(year, month0) {
  const from = new Date(year, month0, 1, 0, 0, 0);
  const to = new Date(year, month0 + 1, 0, 23, 59, 59);
  const fmt = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(
      d.getSeconds()
    )}`;
  return { from: fmt(from), to: fmt(to) };
}

function buildMonthCells(year, month0) {
  const first = new Date(year, month0, 1);
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const firstDow = first.getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) {
    const day = new Date(year, month0, -(firstDow - i - 1));
    cells.push({ inMonth: false, date: day });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ inMonth: true, date: new Date(year, month0, d) });
  }
  const rem = cells.length % 7;
  if (rem !== 0) {
    let n = 1;
    for (let k = 0; k < 7 - rem; k++) {
      cells.push({ inMonth: false, date: new Date(year, month0 + 1, n++) });
    }
  }
  return cells;
}

function templateKindForMeetingForm(isEditing, meetingStatus) {
  if (meetingStatus === 'cancelled') return 'cancelled';
  return isEditing ? 'updated' : 'created';
}

function meetingPayloadFromForm(form, accounts) {
  const acc = accounts.find((a) => String(a.id) === String(form.email_account_id));
  return {
    title: form.title?.trim() ?? '',
    start_at: localDatetimeToMysql(form.start_at) || '',
    end_at: localDatetimeToMysql(form.end_at) || '',
    location: form.location?.trim() ?? '',
    description: form.description?.trim() ?? '',
    meeting_status: form.meeting_status || 'scheduled',
    attendee_email: form.attendee_email?.trim() ?? '',
    email_account_id: form.email_account_id ? Number(form.email_account_id) : null,
    ...(acc
      ? { account_label: acc.account_name || acc.email_address, account_email: acc.email_address }
      : {}),
  };
}

function meetingPreviewKindLabel(kind) {
  if (kind === 'created') return 'New meeting';
  if (kind === 'updated') return 'Update';
  return 'Cancelled';
}

export function MeetingsPage() {
  const { canAny } = usePermissions();
  const canManage = canAny([PERMISSIONS.MEETINGS_MANAGE, PERMISSIONS.SETTINGS_MANAGE]);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());
  const [emailFilter, setEmailFilter] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    email_account_id: '',
    title: '',
    attendee_email: '',
    location: '',
    description: '',
    start_at: '',
    end_at: '',
    meeting_status: 'scheduled',
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState('created');
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [placeholderHelp, setPlaceholderHelp] = useState([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [resetTemplateKind, setResetTemplateKind] = useState(null);

  const [meetingPreviewOpen, setMeetingPreviewOpen] = useState(false);
  const [meetingPreviewKind, setMeetingPreviewKind] = useState('created');
  const [meetingPreviewDraft, setMeetingPreviewDraft] = useState({ subject: '', body_html: '', body_text: '' });
  const [meetingPreviewResolved, setMeetingPreviewResolved] = useState({ subject: '', body_html: '', body_text: '' });
  const [meetingPreviewLoading, setMeetingPreviewLoading] = useState(false);
  const [meetingPreviewResolving, setMeetingPreviewResolving] = useState(false);
  const [meetingPreviewSaving, setMeetingPreviewSaving] = useState(false);
  const [meetingPreviewError, setMeetingPreviewError] = useState(null);
  const [previewPlaceholderHelp, setPreviewPlaceholderHelp] = useState([]);

  useEffect(() => {
    let c = false;
    emailAccountsAPI
      .getAll(false)
      .then((res) => {
        if (!c) setAccounts(res?.data?.data ?? []);
      })
      .catch(() => {
        if (!c) setAccounts([]);
      });
    return () => {
      c = true;
    };
  }, []);

  const { from, to } = useMemo(() => monthRange(year, month0), [year, month0]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { from, to };
      if (emailFilter) params.email_account_id = emailFilter;
      const [listRes, metRes] = await Promise.all([
        meetingsAPI.list(params),
        meetingsAPI.metrics({ email_account_id: emailFilter || undefined }),
      ]);
      setMeetings(listRes?.data?.data ?? []);
      setMetrics(metRes?.data?.data ?? null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load meetings');
      setMeetings([]);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, emailFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const m of meetings) {
      const d = new Date(String(m.start_at).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) continue;
      const key = toYmd(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
    }
    return map;
  }, [meetings]);

  const cells = useMemo(() => buildMonthCells(year, month0), [year, month0]);

  const todayYmd = toYmd(new Date());

  const accountOptions = useMemo(
    () => [{ value: '', label: 'All email accounts' }, ...accounts.map((a) => ({ value: String(a.id), label: a.account_name || a.email_address }))],
    [accounts]
  );

  const formAccountOptions = useMemo(
    () => accounts.filter((a) => a.status === 'active' || a.status == null).map((a) => ({ value: String(a.id), label: a.account_name || a.email_address })),
    [accounts]
  );

  function openCreate() {
    if (!formAccountOptions.length) {
      setError('Connect an email account under Email → Accounts before scheduling meetings.');
      return;
    }
    const first = formAccountOptions[0]?.value || '';
    setEditing(null);
    setForm({
      email_account_id: first,
      title: '',
      attendee_email: '',
      location: '',
      description: '',
      start_at: '',
      end_at: '',
      meeting_status: 'scheduled',
    });
    setModalOpen(true);
  }

  function openEdit(m) {
    setEditing(m);
    setForm({
      email_account_id: String(m.email_account_id),
      title: m.title || '',
      attendee_email: m.attendee_email || '',
      location: m.location || '',
      description: m.description || '',
      start_at: mysqlToDatetimeLocal(m.start_at),
      end_at: mysqlToDatetimeLocal(m.end_at),
      meeting_status: m.meeting_status || 'scheduled',
    });
    setModalOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.title?.trim() || !form.email_account_id) return;
    const start_at = localDatetimeToMysql(form.start_at);
    const end_at = localDatetimeToMysql(form.end_at);
    if (!start_at || !end_at) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        email_account_id: Number(form.email_account_id),
        title: form.title.trim(),
        attendee_email: form.attendee_email?.trim() || null,
        location: form.location?.trim() || null,
        description: form.description?.trim() || null,
        start_at,
        end_at,
        meeting_status: form.meeting_status,
      };
      if (editing) {
        await meetingsAPI.update(editing.id, payload);
      } else {
        await meetingsAPI.create(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function openEmailTemplatesModal() {
    setTemplateModalOpen(true);
    setTemplateError(null);
    setTemplateLoading(true);
    try {
      const res = await meetingsAPI.getEmailTemplates();
      setEmailTemplates(res?.data?.data ?? []);
      setPlaceholderHelp(res?.data?.placeholder_help ?? []);
    } catch (e) {
      setTemplateError(e?.response?.data?.error || e?.message || 'Failed to load templates');
      setEmailTemplates([]);
      setPlaceholderHelp([]);
    } finally {
      setTemplateLoading(false);
    }
  }

  function updateEmailTemplateDraft(kind, field, value) {
    setEmailTemplates((prev) =>
      prev.map((t) => (t.template_kind === kind ? { ...t, [field]: value } : t))
    );
  }

  async function saveEmailTemplates() {
    setTemplateSaving(true);
    setTemplateError(null);
    try {
      const templates = emailTemplates.map(({ template_kind, subject, body_html, body_text }) => ({
        template_kind,
        subject,
        body_html: body_html ?? '',
        body_text: body_text ?? '',
      }));
      const res = await meetingsAPI.putEmailTemplates({ templates });
      setEmailTemplates(res?.data?.data ?? []);
      setPlaceholderHelp(res?.data?.placeholder_help ?? []);
      setTemplateModalOpen(false);
    } catch (e) {
      setTemplateError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setTemplateSaving(false);
    }
  }

  async function confirmResetTemplate() {
    if (!resetTemplateKind) return;
    setTemplateSaving(true);
    setTemplateError(null);
    try {
      await meetingsAPI.resetEmailTemplate({ template_kind: resetTemplateKind });
      const res = await meetingsAPI.getEmailTemplates();
      setEmailTemplates(res?.data?.data ?? []);
      setPlaceholderHelp(res?.data?.placeholder_help ?? []);
      setResetTemplateKind(null);
    } catch (e) {
      setTemplateError(e?.response?.data?.error || e?.message || 'Reset failed');
    } finally {
      setTemplateSaving(false);
    }
  }

  const activeTemplate = emailTemplates.find((t) => t.template_kind === templateTab);

  async function refreshMeetingPreviewWithDraft(draft) {
    const kind = templateKindForMeetingForm(!!editing, form.meeting_status);
    setMeetingPreviewKind(kind);
    setMeetingPreviewResolving(true);
    setMeetingPreviewError(null);
    try {
      const meeting = meetingPayloadFromForm(form, accounts);
      const res = await meetingsAPI.previewEmailTemplate({
        template_kind: kind,
        meeting,
        template_override: {
          subject: draft.subject,
          body_html: draft.body_html,
          body_text: draft.body_text,
        },
      });
      const d = res?.data?.data;
      setMeetingPreviewResolved({
        subject: d?.subject ?? '',
        body_html: d?.body_html ?? '',
        body_text: d?.body_text ?? '',
      });
    } catch (e) {
      setMeetingPreviewError(e?.response?.data?.error || e?.message || 'Preview failed');
    } finally {
      setMeetingPreviewResolving(false);
    }
  }

  async function openMeetingEmailPreview() {
    if (!form.email_account_id) {
      setError('Select an email account to preview the attendee email.');
      return;
    }
    const kind = templateKindForMeetingForm(!!editing, form.meeting_status);
    setMeetingPreviewError(null);
    setMeetingPreviewKind(kind);
    setMeetingPreviewOpen(true);
    setMeetingPreviewLoading(true);
    try {
      const res = await meetingsAPI.getEmailTemplates();
      const rows = res?.data?.data ?? [];
      setPreviewPlaceholderHelp(res?.data?.placeholder_help ?? []);
      const row = rows.find((t) => t.template_kind === kind);
      const draft = {
        subject: row?.subject ?? '',
        body_html: row?.body_html ?? '',
        body_text: row?.body_text ?? '',
      };
      setMeetingPreviewDraft(draft);
      await refreshMeetingPreviewWithDraft(draft);
    } catch (e) {
      setMeetingPreviewError(e?.response?.data?.error || e?.message || 'Failed to load template');
    } finally {
      setMeetingPreviewLoading(false);
    }
  }

  async function saveMeetingTemplateFromPreview() {
    const kind = templateKindForMeetingForm(!!editing, form.meeting_status);
    setMeetingPreviewSaving(true);
    setMeetingPreviewError(null);
    try {
      await meetingsAPI.putEmailTemplates({
        templates: [
          {
            template_kind: kind,
            subject: meetingPreviewDraft.subject,
            body_html: meetingPreviewDraft.body_html,
            body_text: meetingPreviewDraft.body_text,
          },
        ],
      });
      setMeetingPreviewOpen(false);
    } catch (e) {
      setMeetingPreviewError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setMeetingPreviewSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await meetingsAPI.delete(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  function shiftMonth(delta) {
    const d = new Date(year, month0 + delta, 1);
    setYear(d.getFullYear());
    setMonth0(d.getMonth());
  }

  const monthTitle = new Date(year, month0, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const metricItems = metrics
    ? [
        { key: 'total', label: 'Total Meetings', value: metrics.total },
        { key: 'scheduled', label: 'Scheduled Meetings', value: metrics.scheduled },
        { key: 'upcoming', label: 'Upcoming Meetings', value: metrics.upcoming },
        { key: 'completed', label: 'Completed Meetings', value: metrics.completed },
        { key: 'cancelled', label: 'Cancelled Meetings', value: metrics.cancelled },
        { key: 'rescheduled', label: 'Rescheduled Meetings', value: metrics.rescheduled },
        { key: 'today', label: "Today's Meetings", value: metrics.today },
      ]
    : [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Meetings"
        description="Calendar across your connected email accounts. Add attendee email and track status."
        actions={
          canManage ? (
            <Button type="button" onClick={openCreate}>
              + Add meeting
            </Button>
          ) : undefined
        }
      />

      {error && (
        <Alert variant="error" style={{ marginBottom: 12 }}>
          {error}
        </Alert>
      )}

      <div className={styles.metricsRow}>
        {loading && !metrics
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={styles.metricCard}>
                <div className={styles.metricValue}>—</div>
                <div className={styles.metricLabel}>…</div>
              </div>
            ))
          : metricItems.map((m) => (
              <div key={m.key} className={styles.metricCard}>
                <div className={styles.metricValue}>{m.value}</div>
                <div className={styles.metricLabel}>{m.label}</div>
              </div>
            ))}
      </div>

      <div className={styles.toolbar}>
        <div className={styles.monthNav}>
          <Button type="button" variant="secondary" size="sm" onClick={() => shiftMonth(-1)}>
            ←
          </Button>
          <span className={styles.monthTitle}>{monthTitle}</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => shiftMonth(1)}>
            →
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const t = new Date();
              setYear(t.getFullYear());
              setMonth0(t.getMonth());
            }}
          >
            Today
          </Button>
        </div>
        <div style={{ minWidth: 220 }}>
          <Select
            label="Email account"
            value={emailFilter}
            onChange={(e) => setEmailFilter(e.target.value)}
            options={accountOptions}
          />
        </div>
      </div>

      <div className={styles.calendarWrap}>
        <div className={styles.calHeader}>
          {WEEKDAYS.map((w) => (
            <div key={w} className={styles.calHeaderCell}>
              {w}
            </div>
          ))}
        </div>
        <div className={styles.calGrid}>
          {cells.map((cell, idx) => {
            const key = toYmd(cell.date);
            const dayMeetings = byDay.get(key) || [];
            const isToday = key === todayYmd;
            return (
              <div
                key={`${idx}-${key}`}
                className={`${styles.calCell} ${cell.inMonth ? '' : styles.calCellMuted} ${isToday ? styles.calCellToday : ''}`}
              >
                <div className={styles.calDayNum}>{cell.date.getDate()}</div>
                {dayMeetings.slice(0, 4).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={styles.meetingChip}
                    title={`${m.title} (${m.meeting_status})`}
                    onClick={() => openEdit(m)}
                  >
                    {String(m.start_at || '').slice(11, 16)} {m.title}
                  </button>
                ))}
                {dayMeetings.length > 4 ? (
                  <div className={styles.listHint}>+{dayMeetings.length - 4} more</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className={styles.listHint}>
        Metrics reflect all meetings{emailFilter ? ' for the selected account' : ''}. Calendar shows the current month in
        your local time.
      </p>

      <Modal
        isOpen={modalOpen}
        onClose={() => !saving && setModalOpen(false)}
        title={editing ? 'Edit meeting' : 'New meeting'}
        size="lg"
        footer={
          <ModalFooter>
            <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div>
                {editing && canManage ? (
                  <Button type="button" variant="danger" onClick={() => setDeleteTarget(editing)} disabled={saving}>
                    Delete
                  </Button>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={openMeetingEmailPreview}
                  disabled={saving || !form.email_account_id}
                >
                  Preview &amp; edit email
                </Button>
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>
                  {canManage ? 'Cancel' : 'Close'}
                </Button>
                {canManage ? (
                  <Button type="submit" form="meeting-form" loading={saving}>
                    Save
                  </Button>
                ) : null}
              </div>
            </div>
          </ModalFooter>
        }
      >
        <form id="meeting-form" onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Select
              label="Email account"
              value={form.email_account_id}
              onChange={(e) => setForm((f) => ({ ...f, email_account_id: e.target.value }))}
              options={formAccountOptions}
              required
              disabled={!canManage}
            />
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
              disabled={!canManage}
            />
            <Input
              label="Attendee email"
              type="email"
              value={form.attendee_email}
              onChange={(e) => setForm((f) => ({ ...f, attendee_email: e.target.value }))}
              placeholder="client@example.com"
              disabled={!canManage}
            />
            <Input
              label="Location"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              disabled={!canManage}
            />
            <Input
              label="Start"
              type="datetime-local"
              value={form.start_at}
              onChange={(e) => setForm((f) => ({ ...f, start_at: e.target.value }))}
              required
              disabled={!canManage}
            />
            <Input
              label="End"
              type="datetime-local"
              value={form.end_at}
              onChange={(e) => setForm((f) => ({ ...f, end_at: e.target.value }))}
              required
              disabled={!canManage}
            />
            <Select
              label="Status"
              value={form.meeting_status}
              onChange={(e) => setForm((f) => ({ ...f, meeting_status: e.target.value }))}
              options={MEETING_STATUS_OPTIONS}
              disabled={!canManage}
            />
          </div>
          <p className={styles.listHint} style={{ marginTop: 4 }}>
            Open <strong>Preview &amp; edit email</strong> to see the outgoing message, edit the template using placeholders
            like <code>{'{{title}}'}</code>, and save it as your tenant default for this notification type (new / update /
            cancelled).
          </p>
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Optional notes"
            style={{ marginTop: 12 }}
            disabled={!canManage}
          />
        </form>
      </Modal>

      <Modal
        isOpen={meetingPreviewOpen}
        onClose={() => !meetingPreviewSaving && !meetingPreviewLoading && setMeetingPreviewOpen(false)}
        title={`Attendee email — ${meetingPreviewKindLabel(meetingPreviewKind)}`}
        size="lg"
        footer={
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMeetingPreviewOpen(false)}
              disabled={meetingPreviewSaving}
            >
              Close
            </Button>
            {canManage ? (
              <Button
                type="button"
                onClick={saveMeetingTemplateFromPreview}
                loading={meetingPreviewSaving}
                disabled={meetingPreviewLoading || meetingPreviewResolving}
              >
                Save as default template
              </Button>
            ) : null}
          </ModalFooter>
        }
      >
        {meetingPreviewError && (
          <Alert variant="error" style={{ marginBottom: 12 }}>
            {meetingPreviewError}
          </Alert>
        )}
        {meetingPreviewLoading ? (
          <p className={styles.listHint}>Loading…</p>
        ) : (
          <>
            <p className={styles.listHint} style={{ marginBottom: 12 }}>
              Edit the template on the left (saved with placeholders). The right column shows how it looks with your current
              form values. Saving replaces your tenant default for <strong>{meetingPreviewKindLabel(meetingPreviewKind)}</strong>{' '}
              emails only.
            </p>
            {previewPlaceholderHelp.length > 0 && (
              <div className={styles.placeholderHelp} style={{ marginBottom: 12 }}>
                Placeholders:{' '}
                {previewPlaceholderHelp.map((name, i) => (
                  <React.Fragment key={name}>
                    {i > 0 ? ', ' : null}
                    <code>{`{{${name}}}`}</code>
                  </React.Fragment>
                ))}
              </div>
            )}
            <div className={styles.previewSplit}>
              <div className={styles.previewPanel}>
                <h4 className={styles.previewPanelTitle}>Template</h4>
                <Input
                  label="Subject"
                  value={meetingPreviewDraft.subject}
                  onChange={(e) => setMeetingPreviewDraft((d) => ({ ...d, subject: e.target.value }))}
                  disabled={!canManage}
                />
                <div>
                  <label className={styles.listHint} style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    HTML body
                  </label>
                  <textarea
                    className={styles.templateTextarea}
                    value={meetingPreviewDraft.body_html}
                    onChange={(e) => setMeetingPreviewDraft((d) => ({ ...d, body_html: e.target.value }))}
                    disabled={!canManage}
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className={styles.listHint} style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    Plain text body
                  </label>
                  <textarea
                    className={styles.templateTextarea}
                    value={meetingPreviewDraft.body_text}
                    onChange={(e) => setMeetingPreviewDraft((d) => ({ ...d, body_text: e.target.value }))}
                    disabled={!canManage}
                    spellCheck={false}
                  />
                </div>
                <div className={styles.templateActions}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => refreshMeetingPreviewWithDraft(meetingPreviewDraft)}
                    loading={meetingPreviewResolving}
                  >
                    Refresh preview
                  </Button>
                </div>
              </div>
              <div className={styles.previewPanel}>
                <h4 className={styles.previewPanelTitle}>Preview with this meeting</h4>
                {meetingPreviewResolving ? (
                  <p className={styles.listHint}>Updating…</p>
                ) : (
                  <>
                    <Input label="Subject" value={meetingPreviewResolved.subject} readOnly />
                    <div>
                      <label className={styles.listHint} style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                        HTML body
                      </label>
                      <div
                        className={styles.previewResolvedHtml}
                        dangerouslySetInnerHTML={{ __html: meetingPreviewResolved.body_html || '<p>—</p>' }}
                      />
                    </div>
                    <div>
                      <label className={styles.listHint} style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                        Plain text
                      </label>
                      <pre className={styles.previewResolvedPre}>{meetingPreviewResolved.body_text || '—'}</pre>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete meeting"
        message={deleteTarget ? `Remove "${deleteTarget.title}"?` : ''}
        confirmText="Delete"
        loading={saving}
      />

      <Modal
        isOpen={templateModalOpen}
        onClose={() => !templateSaving && setTemplateModalOpen(false)}
        title="Meeting notification emails"
        size="lg"
        footer={
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setTemplateModalOpen(false)} disabled={templateSaving}>
              {canManage ? 'Cancel' : 'Close'}
            </Button>
            {canManage ? (
              <Button
                type="button"
                onClick={saveEmailTemplates}
                loading={templateSaving}
                disabled={templateLoading || emailTemplates.length < 1}
              >
                Save templates
              </Button>
            ) : null}
          </ModalFooter>
        }
      >
        {templateError && (
          <Alert variant="error" style={{ marginBottom: 12 }}>
            {templateError}
          </Alert>
        )}
        {templateLoading ? (
          <p className={styles.listHint}>Loading templates…</p>
        ) : (
          <>
            <p className={styles.listHint} style={{ marginBottom: 12 }}>
              These messages are sent to the attendee when a meeting is saved. Use placeholders below; values are filled in
              automatically.
            </p>
            {placeholderHelp.length > 0 && (
              <div className={styles.placeholderHelp}>
                Placeholders:{' '}
                {placeholderHelp.map((name, i) => (
                  <React.Fragment key={name}>
                    {i > 0 ? ', ' : null}
                    <code>{`{{${name}}}`}</code>
                  </React.Fragment>
                ))}
              </div>
            )}
            <div className={styles.templateTabs}>
              {MEETING_TEMPLATE_TABS.map((tab) => (
                <button
                  key={tab.kind}
                  type="button"
                  className={`${styles.templateTab} ${templateTab === tab.kind ? styles.templateTabActive : ''}`}
                  onClick={() => setTemplateTab(tab.kind)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {activeTemplate ? (
              <div className={styles.templateFields}>
                <Input
                  label="Subject"
                  value={activeTemplate.subject ?? ''}
                  onChange={(e) => updateEmailTemplateDraft(templateTab, 'subject', e.target.value)}
                  disabled={!canManage}
                />
                <div>
                  <label className={styles.listHint} style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    HTML body
                  </label>
                  <textarea
                    className={styles.templateTextarea}
                    value={activeTemplate.body_html ?? ''}
                    onChange={(e) => updateEmailTemplateDraft(templateTab, 'body_html', e.target.value)}
                    disabled={!canManage}
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className={styles.listHint} style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                    Plain text body
                  </label>
                  <textarea
                    className={styles.templateTextarea}
                    value={activeTemplate.body_text ?? ''}
                    onChange={(e) => updateEmailTemplateDraft(templateTab, 'body_text', e.target.value)}
                    disabled={!canManage}
                    spellCheck={false}
                  />
                </div>
                {canManage ? (
                  <div className={styles.templateActions}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setResetTemplateKind(templateTab)}>
                      Restore default for this type
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className={styles.listHint}>No template loaded for this tab.</p>
            )}
          </>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!resetTemplateKind}
        onClose={() => setResetTemplateKind(null)}
        onConfirm={confirmResetTemplate}
        title="Restore default template"
        message="Replace the subject and body for this notification type with the built-in default?"
        confirmText="Restore"
        loading={templateSaving}
      />
    </div>
  );
}
