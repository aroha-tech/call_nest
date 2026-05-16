import React, { useCallback, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Select } from '../components/ui/Select';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { meetingsAPI } from '../services/meetingsAPI';
import { ScriptBodyEditor } from '../features/callScripts/ScriptBodyEditor';
import { formatEmailRecipientListDisplay } from '../utils/emailRecipientList';
import { IconChevronDown } from '../features/contacts/ListActionsMenuIcons';
import styles from './MeetingAttendeeEmailSettingsPage.module.scss';

const EMAIL_TYPE_CARDS = [
  {
    kind: 'created',
    tabLabel: 'Invitation',
    templateSelectLabel: 'Default New Meeting',
    sectionTitle: 'New Meeting Settings',
    sectionSubtitle: 'Customize how invitation emails are sent when you schedule a meeting.',
    sectionIcon: 'calendar_add_on',
    previewSubtitle: 'This is how your invitation email will look to recipients.',
    previewHeroIcon: 'calendar_add_on',
    formInfoLine: 'These settings will be used for all new meetings by default.',
  },
  {
    kind: 'reminder',
    tabLabel: 'Reminder',
    templateSelectLabel: 'Default Meeting Reminder',
    sectionTitle: 'Reminder Email Settings',
    sectionSubtitle: 'Customize reminder timing and content in Automation below.',
    sectionIcon: 'notifications',
    previewSubtitle: 'This is how your reminder email will look to recipients.',
    previewHeroIcon: 'notifications',
    formInfoLine: 'These settings will be used for all meeting reminders by default.',
  },
  {
    kind: 'feedback',
    tabLabel: 'Feedback',
    templateSelectLabel: 'Default Meeting Feedback',
    sectionTitle: 'Feedback Email Settings',
    sectionSubtitle: 'Customize how feedback requests are sent after meetings.',
    sectionIcon: 'star',
    previewSubtitle: 'This is how your feedback email will look to recipients.',
    previewHeroIcon: 'star',
    formInfoLine: 'These settings will be used for all feedback requests by default.',
  },
  {
    kind: 'updated',
    tabLabel: 'Updated',
    templateSelectLabel: 'Default Updated Meeting',
    sectionTitle: 'Updated Meeting Settings',
    sectionSubtitle: 'Customize how update notifications are sent for meetings.',
    sectionIcon: 'sync',
    previewSubtitle: 'This is how your update email will look to recipients.',
    previewHeroIcon: 'sync',
    formInfoLine: 'These settings will be used when you update meeting details.',
  },
  {
    kind: 'cancelled',
    tabLabel: 'Cancelled',
    templateSelectLabel: 'Default Meeting Cancelled',
    sectionTitle: 'Cancelled Meeting Settings',
    sectionSubtitle: 'Customize how cancellation notifications are sent for meetings.',
    sectionIcon: 'highlight_off',
    previewSubtitle: 'This is how your cancellation email will look to recipients.',
    previewHeroIcon: 'event',
    formInfoLine: 'These settings will be used for all cancelled meetings by default.',
  },
];

function cardMeta(kind) {
  return EMAIL_TYPE_CARDS.find((c) => c.kind === kind) || EMAIL_TYPE_CARDS[0];
}

const EMAIL_KINDS = ['created', 'reminder', 'feedback', 'updated', 'cancelled'];
const MAX_CC_BCC_RECIPIENTS = 20;
const DEFAULT_REMINDER_OFFSET = { value: 5, unit: 'minutes' };

/** Sandboxed document so template <style> rules cannot resize page buttons. */
function buildEmailPreviewSrcDoc(bodyHtml) {
  const body = String(bodyHtml ?? '').trim()
    ? String(bodyHtml)
    : '<p style="margin:0;color:#64748b;">No message body yet.</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><style>body{margin:0;padding:2px 0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.55;color:#111827;}a{color:#4f46e5;}p{margin:0 0 .75em;}ul,ol{margin:0 0 .75em;padding-left:1.25em;}</style></head><body>${body}</body></html>`;
}

function EmailPreviewFrame({ html, className, title = 'Email preview' }) {
  return <iframe title={title} className={className} sandbox="" srcDoc={buildEmailPreviewSrcDoc(html)} />;
}

function getReminderOffset(settings) {
  const list = Array.isArray(settings?.reminder_offsets) ? settings.reminder_offsets : [];
  const first = list[0];
  if (first && Number(first.value) > 0) {
    return {
      value: Number(first.value) || DEFAULT_REMINDER_OFFSET.value,
      unit: first.unit || DEFAULT_REMINDER_OFFSET.unit,
    };
  }
  return { ...DEFAULT_REMINDER_OFFSET };
}

function ensureDefaultCcBccByKind(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const by = { ...(settings.default_cc_bcc_by_kind || {}) };
  const legacyCc = String(settings.default_cc_email ?? '').trim();
  const legacyBcc = String(settings.default_bcc_email ?? '').trim();
  for (const k of EMAIL_KINDS) {
    const slot = by[k];
    if (!slot || typeof slot !== 'object') {
      by[k] = { cc: legacyCc, bcc: legacyBcc };
    } else {
      by[k] = { cc: String(slot.cc ?? ''), bcc: String(slot.bcc ?? '') };
    }
  }
  return { ...settings, default_cc_bcc_by_kind: by };
}

const EMAIL_TYPE_TAB_KIND_CLASS = {
  created: styles.emailTypeTab_kind_created,
  reminder: styles.emailTypeTab_kind_reminder,
  feedback: styles.emailTypeTab_kind_feedback,
  updated: styles.emailTypeTab_kind_updated,
  cancelled: styles.emailTypeTab_kind_cancelled,
};

function formatMergeFieldLabel(key) {
  return String(key)
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPreviewVars(tab) {
  const base = {
    title: 'SEO Proposal Discussion',
    attendee_email: 'rahul.patel@example.com',
    contact_name: 'Rahul Patel',
    company_name: 'Your Company',
    feedback_link: 'https://yourcompany.com/feedback/abc123',
    start_at: '06 May 2026, 10:00 AM',
    end_at: '06 May 2026, 11:00 AM',
    meeting_status: tab === 'cancelled' ? 'cancelled' : 'scheduled',
    meeting_platform: 'google_meet',
    meeting_platform_label: 'Google Meet',
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    meeting_duration_min: '60',
    meeting_owner_name: 'John Doe',
    account_label: 'Your Company',
    account_email: 'sales@yourcompany.com',
    meeting_date: '06 May 2026 (Wednesday)',
    meeting_time: '10:00 AM - 11:00 AM (IST)',
    meeting_end_time: '11:00 AM',
    meeting_card_date: '06 May 2026 (Wednesday)',
    meeting_card_time: '10:00 AM - 11:00 AM (IST)',
    calendar_google_url: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Sample',
    calendar_outlook_url: 'https://outlook.live.com/calendar/0/deeplink/compose',
    location: 'Google Meet',
    description: 'Sample agenda for preview.',
  };
  return base;
}

function applyTemplate(text, plainVars, htmlVars) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = htmlVars ? htmlVars[key] : plainVars[key];
    return v !== undefined && v !== null ? String(v) : `{{${key}}}`;
  });
}

export function MeetingAttendeeEmailSettingsPage() {
  const bodyEditorRef = React.useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [tab, setTab] = useState('created');
  const [settings, setSettings] = useState(null);
  const [attendeeTemplates, setAttendeeTemplates] = useState([]);
  const [attendeePlaceholderHelp, setAttendeePlaceholderHelp] = useState([]);
  const [previewTemplateOpen, setPreviewTemplateOpen] = useState(false);
  const [automationExpanded, setAutomationExpanded] = useState(false);

  React.useEffect(() => {
    if (tab !== 'reminder') setAutomationExpanded(false);
  }, [tab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const [res, resT] = await Promise.all([
        meetingsAPI.getDefaultEmailSettings(),
        meetingsAPI.getUserAttendeeEmailTemplates(),
      ]);
      setSettings(ensureDefaultCcBccByKind(res?.data?.data ?? null));
      setAttendeeTemplates(resT?.data?.data ?? []);
      setAttendeePlaceholderHelp(resT?.data?.placeholder_help ?? []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load default meeting email settings');
      setSettings(null);
      setAttendeeTemplates([]);
      setAttendeePlaceholderHelp([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const variableGroupsAutomation = useMemo(() => {
    const placeholderHelp = [
      'title',
      'meeting_date',
      'meeting_time',
      'meeting_end_time',
      'meeting_card_date',
      'meeting_card_time',
      'meeting_link',
      'meeting_platform',
      'meeting_platform_label',
      'location',
      'description',
      'attendee_email',
      'contact_name',
      'company_name',
      'feedback_link',
      'calendar_google_url',
      'calendar_outlook_url',
    ];
    return [
      {
        moduleKey: 'meeting',
        label: 'Meeting placeholders',
        list: placeholderHelp.map((name) => ({
          key: name,
          label: formatMergeFieldLabel(name),
        })),
      },
    ];
  }, []);

  const variableGroupsAttendee = useMemo(() => {
    const list = attendeePlaceholderHelp.length
      ? attendeePlaceholderHelp
      : [
          'title',
          'start_at',
          'end_at',
          'location',
          'description',
          'meeting_status',
          'meeting_platform',
          'meeting_platform_label',
          'meeting_link',
          'meeting_duration_min',
          'meeting_owner_name',
          'attendee_email',
          'account_label',
          'account_email',
          'meeting_card_date',
          'meeting_card_time',
          'calendar_google_url',
          'calendar_outlook_url',
        ];
    return [
      {
        moduleKey: 'meeting',
        label: 'Meeting placeholders',
        list: list.map((name) => ({
          key: name,
          label: formatMergeFieldLabel(name),
        })),
      },
    ];
  }, [attendeePlaceholderHelp]);

  function updateField(field, value) {
    setSettings((prev) => ({ ...(prev || {}), [field]: value }));
  }

  function settingsPayloadForSave(raw, { activeTab } = {}) {
    const base = ensureDefaultCcBccByKind(raw || {});
    base.reminder_offsets = [getReminderOffset(base)];
    const editorHtml = bodyEditorRef.current?.getHtml?.();
    const editorTrimmed = editorHtml != null ? String(editorHtml).trim() : '';
    const stateReminderHtml = String(raw?.reminder_body_html ?? '');
    const stateFeedbackHtml = String(raw?.feedback_body_html ?? '');
    if (activeTab === 'reminder') {
      base.reminder_body_html = editorTrimmed || stateReminderHtml;
    } else {
      base.reminder_body_html = stateReminderHtml;
    }
    if (activeTab === 'feedback') {
      base.feedback_body_html = editorTrimmed || stateFeedbackHtml;
    } else {
      base.feedback_body_html = stateFeedbackHtml;
    }
    return base;
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await meetingsAPI.putDefaultEmailSettings(
        settingsPayloadForSave(settings, { activeTab: tab })
      );
      setSettings(ensureDefaultCcBccByKind(res?.data?.data ?? null));
      setSuccessMsg('Settings saved.');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveAttendeeTemplates() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const templates = attendeeTemplates.map(({ template_kind, subject, body_html, body_text }) => ({
        template_kind,
        subject,
        body_html: body_html ?? '',
        body_text: body_text ?? '',
      }));
      const [resT, resS] = await Promise.all([
        meetingsAPI.putUserAttendeeEmailTemplates({ templates }),
        meetingsAPI.putDefaultEmailSettings(settingsPayloadForSave(settings, { activeTab: tab })),
      ]);
      setAttendeeTemplates(resT?.data?.data ?? []);
      setSettings(ensureDefaultCcBccByKind(resS?.data?.data ?? settings));
      setAttendeePlaceholderHelp(resT?.data?.placeholder_help ?? attendeePlaceholderHelp);
      setSuccessMsg('Settings saved.');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function updateCcBccForKind(kind, field, value) {
    setSettings((prev) => {
      if (!prev) return prev;
      const ensured = ensureDefaultCcBccByKind(prev);
      const by = { ...ensured.default_cc_bcc_by_kind };
      by[kind] = { ...(by[kind] || { cc: '', bcc: '' }), [field]: value };
      const created = by.created || { cc: '', bcc: '' };
      return {
        ...ensured,
        default_cc_bcc_by_kind: by,
        default_cc_email: created.cc,
        default_bcc_email: created.bcc,
      };
    });
  }

  async function resetCurrentTabDefaults() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (tab === 'reminder' || tab === 'feedback') {
        const res = await meetingsAPI.resetDefaultEmailSection({ section: tab });
        setSettings(ensureDefaultCcBccByKind(res?.data?.data ?? null));
      } else {
        await meetingsAPI.resetUserAttendeeEmailTemplate({ template_kind: tab });
        const [resT, resS] = await Promise.all([
          meetingsAPI.getUserAttendeeEmailTemplates(),
          meetingsAPI.getDefaultEmailSettings(),
        ]);
        setAttendeeTemplates(resT?.data?.data ?? []);
        setSettings(ensureDefaultCcBccByKind(resS?.data?.data ?? settings));
        setAttendeePlaceholderHelp(resT?.data?.placeholder_help ?? attendeePlaceholderHelp);
      }
      setSuccessMsg('Restored default content for this email type.');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Reset failed');
    } finally {
      setSaving(false);
    }
  }

  async function cancelEdits() {
    setSuccessMsg(null);
    await load();
  }

  function updateReminderOffset(field, value) {
    const current = getReminderOffset(settings);
    const next = {
      ...current,
      [field]: field === 'value' ? Number(value || 1) : value,
    };
    updateField('reminder_offsets', [next]);
  }

  const meta = cardMeta(tab);
  const activeCcBcc = useMemo(() => {
    const by = settings?.default_cc_bcc_by_kind?.[tab];
    return by && typeof by === 'object' ? { cc: String(by.cc ?? ''), bcc: String(by.bcc ?? '') } : { cc: '', bcc: '' };
  }, [settings, tab]);
  const attendeeActive = attendeeTemplates.find((t) => t.template_kind === tab) || null;
  const activeSubject =
    tab === 'reminder'
      ? settings?.reminder_subject || ''
      : tab === 'feedback'
        ? settings?.feedback_subject || ''
        : attendeeActive?.subject || '';
  const activeBodyHtml =
    tab === 'reminder'
      ? settings?.reminder_body_html || ''
      : tab === 'feedback'
        ? settings?.feedback_body_html || ''
        : attendeeActive?.body_html || '';

  const previewPlain = useMemo(() => buildPreviewVars(tab), [tab]);

  const previewHtmlVars = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(previewPlain).map(([k, v]) => [k, escapeHtml(v)])
      ),
    [previewPlain]
  );

  const resolvedPreviewSubject = useMemo(
    () => applyTemplate(activeSubject, previewPlain, null),
    [activeSubject, previewPlain]
  );

  const resolvedPreviewBodyHtml = useMemo(
    () => applyTemplate(activeBodyHtml, previewPlain, previewHtmlVars),
    [activeBodyHtml, previewPlain, previewHtmlVars]
  );

  const personSuffix = (
    <span className={styles.inputSuffixIcon} aria-hidden>
      <MaterialSymbol name="person_add" size="sm" />
    </span>
  );

  const previewCcDisplay =
    formatEmailRecipientListDisplay(activeCcBcc.cc) || 'amit.kumar@example.com, neha.sharma@example.com';
  const previewBccDisplay =
    formatEmailRecipientListDisplay(activeCcBcc.bcc) || 'sneha.verma@example.com';
  const ccBccPlaceholder = `Up to ${MAX_CC_BCC_RECIPIENTS} addresses (comma, semicolon, or newline separated)`;

  return (
    <div className={styles.page}>
      {error ? (
        <Alert variant="error" className={styles.alert}>
          {error}
        </Alert>
      ) : null}
      {successMsg ? (
        <Alert variant="success" className={styles.alert}>
          {successMsg}
        </Alert>
      ) : null}

      <div className={styles.pageToolbar}>
        <Button type="button" variant="secondary" onClick={cancelEdits} disabled={saving || loading}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={resetCurrentTabDefaults}
          disabled={saving || loading || !settings}
        >
          Reset to default
        </Button>
        <Button
          type="button"
          onClick={tab === 'reminder' || tab === 'feedback' ? save : saveAttendeeTemplates}
          loading={saving}
          disabled={
            loading ||
            (tab === 'reminder' || tab === 'feedback' ? !settings : attendeeTemplates.length < 1)
          }
        >
          <MaterialSymbol name="check" size="sm" className={styles.btnIcon} aria-hidden />
          Save Settings
        </Button>
      </div>

      <div className={styles.layout}>
        <Card padding={false} className={styles.configCard}>
          {loading ? (
            <p className={styles.muted}>Loading settings…</p>
          ) : settings ? (
            <div className={styles.form}>
              <div
                className={styles.emailTypeTablist}
                role="tablist"
                aria-label="Meeting email type"
              >
                {EMAIL_TYPE_CARDS.map((c) => {
                  const selected = tab === c.kind;
                  return (
                    <button
                      key={c.kind}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      className={`${styles.emailTypeTab} ${EMAIL_TYPE_TAB_KIND_CLASS[c.kind] || ''} ${
                        selected ? styles.emailTypeTabActive : ''
                      }`}
                      onClick={() => setTab(c.kind)}
                      disabled={saving}
                    >
                      <MaterialSymbol name={c.sectionIcon} size="sm" className={styles.emailTypeTabIcon} aria-hidden />
                      <span className={styles.emailTypeTabLabel}>{c.tabLabel}</span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.formSectionHead}>
                <span className={styles.formSectionIcon} aria-hidden>
                  <MaterialSymbol name={meta.sectionIcon} size="md" />
                </span>
                <div>
                  <h2 className={styles.formSectionTitle}>{meta.sectionTitle}</h2>
                  <p className={styles.formSectionSubtitle}>{meta.sectionSubtitle}</p>
                </div>
              </div>

              <Input
                label="Email subject"
                required
                value={activeSubject}
                onChange={(e) => {
                  if (tab === 'reminder') updateField('reminder_subject', e.target.value);
                  else if (tab === 'feedback') updateField('feedback_subject', e.target.value);
                  else {
                    setAttendeeTemplates((prev) =>
                      prev.map((t) => (t.template_kind === tab ? { ...t, subject: e.target.value } : t))
                    );
                  }
                }}
                disabled={saving}
              />

              <div className={styles.templateRow}>
                <Select
                  label="Email template"
                  value={tab}
                  onChange={(e) => setTab(e.target.value)}
                  options={EMAIL_TYPE_CARDS.map((c) => ({ value: c.kind, label: c.templateSelectLabel }))}
                  disabled={saving}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.previewTemplateBtn}
                  onClick={() => setPreviewTemplateOpen(true)}
                  disabled={saving || loading}
                >
                  <MaterialSymbol name="visibility" size="sm" className={styles.btnIcon} aria-hidden />
                  Preview Template
                </Button>
              </div>

              <div>
                <div className={styles.fieldLabel}>Email content</div>
                <ScriptBodyEditor
                  ref={bodyEditorRef}
                  key={tab}
                  scrollableLayout
                  enableHtmlSourceToggle
                  variableGroups={tab === 'reminder' || tab === 'feedback' ? variableGroupsAutomation : variableGroupsAttendee}
                  value={activeBodyHtml}
                  onChange={(html) => {
                    if (tab === 'reminder') updateField('reminder_body_html', html);
                    else if (tab === 'feedback') updateField('feedback_body_html', html);
                    else {
                      setAttendeeTemplates((prev) =>
                        prev.map((t) => (t.template_kind === tab ? { ...t, body_html: html } : t))
                      );
                    }
                  }}
                  readOnly={saving}
                  placeholder="Write your email. Merge fields use {{name}} syntax."
                />
              </div>

              <Input
                label="CC"
                value={activeCcBcc.cc}
                onChange={(e) => updateCcBccForKind(tab, 'cc', e.target.value)}
                placeholder={ccBccPlaceholder}
                disabled={saving || loading}
                suffix={personSuffix}
              />
              <Input
                label="BCC"
                value={activeCcBcc.bcc}
                onChange={(e) => updateCcBccForKind(tab, 'bcc', e.target.value)}
                placeholder={ccBccPlaceholder}
                disabled={saving || loading}
                suffix={personSuffix}
              />

              <div className={styles.additionalBlock}>
                <div className={styles.additionalTitle}>Additional options</div>
                {tab === 'reminder' ? (
                  <>
                    <button
                      type="button"
                      id="meeting-email-automation-trigger"
                      className={styles.automationToggle}
                      aria-expanded={automationExpanded}
                      aria-controls="meeting-email-automation-panel"
                      onClick={() => setAutomationExpanded((v) => !v)}
                      disabled={saving || loading}
                    >
                      <span className={styles.automationToggleText}>
                        <span className={styles.automationToggleLabel}>Automation</span>
                        <span className={styles.automationToggleHint}>
                          {automationExpanded
                            ? 'Hide reminder timing and related options'
                            : 'Show reminder timing, feedback delay, and schedule'}
                        </span>
                      </span>
                      <IconChevronDown
                        className={`${styles.automationChevron} ${automationExpanded ? styles.automationChevronOpen : ''}`}
                      />
                    </button>
                    {automationExpanded ? (
                      <div
                        id="meeting-email-automation-panel"
                        role="region"
                        aria-labelledby="meeting-email-automation-trigger"
                        className={styles.automationPanel}
                      >
                        <p className={styles.hint} style={{ marginTop: 0 }}>
                          Reminders, feedback timing, and related options apply to your meetings.
                        </p>
                        <div className={styles.grid2}>
                          <Select
                            label="Send reminders"
                            value={settings?.reminder_enabled ? 'yes' : 'no'}
                            onChange={(e) => updateField('reminder_enabled', e.target.value === 'yes')}
                            options={[
                              { value: 'yes', label: 'Enabled' },
                              { value: 'no', label: 'Disabled' },
                            ]}
                            disabled={saving || loading}
                          />
                          <Select
                            label="Send feedback request"
                            value={settings?.feedback_enabled ? 'yes' : 'no'}
                            onChange={(e) => updateField('feedback_enabled', e.target.value === 'yes')}
                            options={[
                              { value: 'yes', label: 'Enabled' },
                              { value: 'no', label: 'Disabled' },
                            ]}
                            disabled={saving || loading}
                          />
                        </div>
                        <div className={styles.grid2}>
                          <Input
                            label="After meeting — delay value"
                            type="number"
                            min="1"
                            value={settings?.feedback_delay_value ?? 2}
                            onChange={(e) => updateField('feedback_delay_value', Number(e.target.value || 1))}
                            disabled={saving || loading}
                          />
                          <Select
                            label="Delay unit"
                            value={settings?.feedback_delay_unit || 'hours'}
                            onChange={(e) => updateField('feedback_delay_unit', e.target.value)}
                            options={[
                              { value: 'minutes', label: 'Minutes' },
                              { value: 'hours', label: 'Hours' },
                              { value: 'days', label: 'Days' },
                            ]}
                            disabled={saving || loading}
                          />
                        </div>
                        <div className={styles.grid2}>
                          <Input
                            label="Thank you page URL (optional)"
                            value={settings?.thank_you_page_url || ''}
                            onChange={(e) => updateField('thank_you_page_url', e.target.value)}
                            disabled={saving || loading}
                            placeholder="https://yourcompany.com/thank-you"
                          />
                        </div>

                        <div className={styles.reminderSchedule}>
                          <div className={styles.fieldLabel} style={{ marginBottom: 10 }}>
                            Reminder schedule
                          </div>
                          <p className={styles.hint} style={{ marginTop: 0 }}>
                            Send this many minutes, hours, or days before the meeting starts.
                          </p>
                          <div className={styles.reminderRow}>
                            <Input
                              label="Amount"
                              type="number"
                              min="1"
                              value={getReminderOffset(settings).value}
                              onChange={(e) => updateReminderOffset('value', e.target.value)}
                              disabled={saving}
                            />
                            <Select
                              label="Unit"
                              value={getReminderOffset(settings).unit}
                              onChange={(e) => updateReminderOffset('unit', e.target.value)}
                              options={[
                                { value: 'minutes', label: 'Minutes' },
                                { value: 'hours', label: 'Hours' },
                                { value: 'days', label: 'Days' },
                              ]}
                              disabled={saving}
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {tab === 'reminder' ? (
                  <p className={styles.hint} style={{ marginBottom: 0 }}>
                    The reminder body can include the meeting summary and calendar links. Use{' '}
                    <strong>Reset to default</strong> in the toolbar to restore the built-in reminder layout.
                  </p>
                ) : null}
                {tab === 'feedback' ? (
                  <p className={styles.hint} style={{ marginBottom: 0 }}>
                    Reminder and feedback timing are configured under <strong>Automation</strong> on the{' '}
                    <strong>Default Meeting Reminder</strong> card.
                  </p>
                ) : null}
                {tab === 'created' || tab === 'updated' || tab === 'cancelled' ? (
                  <p className={styles.hint} style={{ marginBottom: 0 }}>
                    Meeting summary and “Add to calendar” links are part of the email HTML above. Use{' '}
                    <strong>Reset to default</strong> in the toolbar to restore the built-in layout for this email type.
                  </p>
                ) : null}
              </div>

              <div className={styles.formInfoBanner}>
                <MaterialSymbol name="info" size="sm" className={styles.formInfoIcon} aria-hidden />
                <span>{meta.formInfoLine}</span>
              </div>
            </div>
          ) : (
            <p className={styles.muted}>Could not load settings.</p>
          )}
        </Card>

        <aside className={styles.previewShell} aria-label="Email preview">
          <Card padding={false} className={styles.previewPanel}>
            <div className={styles.previewSectionHead}>
              <span className={styles.previewSectionIcon} aria-hidden>
                <MaterialSymbol name="visibility" size="md" />
              </span>
              <div>
                <h2 className={styles.previewSectionTitle}>Email Preview</h2>
                <p className={styles.previewSectionSubtitle}>{meta.previewSubtitle}</p>
              </div>
            </div>

            <div className={styles.previewMeta}>
              <div className={styles.previewMetaRow}>
                <span className={styles.previewMetaLabel}>Subject</span>
                <span className={styles.previewSubject}>{resolvedPreviewSubject || '—'}</span>
              </div>
              <div className={styles.previewMetaRow}>
                <span className={styles.previewMetaLabel}>To</span>
                <span>{previewPlain.attendee_email}</span>
              </div>
              <div className={styles.previewMetaRow}>
                <span className={styles.previewMetaLabel}>CC</span>
                <span
                  className={
                    formatEmailRecipientListDisplay(settings?.default_cc_email) ? '' : styles.previewMetaFaint
                  }
                >
                  {previewCcDisplay}
                </span>
              </div>
              <div className={styles.previewMetaRow}>
                <span className={styles.previewMetaLabel}>BCC</span>
                <span
                  className={
                    formatEmailRecipientListDisplay(settings?.default_bcc_email) ? '' : styles.previewMetaFaint
                  }
                >
                  {previewBccDisplay}
                </span>
              </div>
            </div>

            <div className={styles.previewBodyRegion}>
              {loading || !settings ? (
                <p className={styles.muted}>Loading…</p>
              ) : (
                <div className={styles.previewStream}>
                  <EmailPreviewFrame html={resolvedPreviewBodyHtml} className={styles.previewIframe} />
                  {tab === 'feedback' ? (
                    <div>
                      <a
                        className={styles.previewCta}
                        href={previewPlain.feedback_link}
                        onClick={(e) => e.preventDefault()}
                      >
                        Share your feedback
                      </a>
                      <p className={styles.muted} style={{ marginTop: 8, fontSize: 12 }}>
                        {previewPlain.feedback_link}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <div className={styles.previewInfoBanner}>
              <MaterialSymbol name="info" size="sm" className={styles.previewInfoIcon} aria-hidden />
              <span>Preview shows example data. Actual email content will be personalized.</span>
            </div>
          </Card>
        </aside>
      </div>

      <Modal
        isOpen={previewTemplateOpen}
        onClose={() => setPreviewTemplateOpen(false)}
        title="Template preview"
        subtitle={meta.templateSelectLabel}
        size="lg"
        closeOnEscape
        closeOnOverlay
        headerIcon={
          <span className={styles.testModalHeaderIcon}>
            <MaterialSymbol name="visibility" size="md" />
          </span>
        }
        footer={
          <ModalFooter className={styles.testModalFooter}>
            <Button type="button" variant="ghost" onClick={() => setPreviewTemplateOpen(false)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        <EmailPreviewFrame html={resolvedPreviewBodyHtml} className={styles.modalPreviewIframe} title="Template preview" />
      </Modal>
    </div>
  );
}
