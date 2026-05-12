import React, { useCallback, useMemo, useState } from 'react';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { meetingsAPI } from '../services/meetingsAPI';
import { ScriptBodyEditor } from '../features/callScripts/ScriptBodyEditor';
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

/** Split rendered HTML so meeting details can sit before closing / thanks lines (preview only). */
function splitPreviewHtmlBeforeClosing(html) {
  const h = String(html || '');
  if (!h.trim()) return { before: '', after: '' };
  const needles = [
    'We apologize',
    'Thanks,',
    'Thank you,',
    'Best regards',
    'Kind regards',
    'Warm regards',
    'Regards,',
    'Sincerely',
    'We hope your meeting',
    'Please share your feedback',
  ];
  let bestCut = -1;
  for (const n of needles) {
    let from = 0;
    while (from < h.length) {
      const idx = h.indexOf(n, from);
      if (idx === -1) break;
      const pOpen = h.lastIndexOf('<p', idx);
      const cutCandidate = pOpen >= 0 ? pOpen : idx;
      if (bestCut === -1 || cutCandidate < bestCut) bestCut = cutCandidate;
      from = idx + n.length;
    }
  }
  if (bestCut >= 0) return { before: h.slice(0, bestCut), after: h.slice(bestCut) };
  return { before: h, after: '' };
}

function buildPreviewVars(tab, includeMeetingDetails) {
  const include = includeMeetingDetails !== false;
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
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    meeting_duration_min: '60',
    meeting_owner_name: 'John Doe',
    account_label: 'Your Company',
    account_email: 'sales@yourcompany.com',
  };
  if (!include) {
    return {
      ...base,
      meeting_date: '',
      meeting_time: '',
      meeting_end_time: '',
      meeting_link: '',
      meeting_platform: '',
      location: '',
      description: '',
    };
  }
  return {
    ...base,
    meeting_date: '06 May 2026 (Wednesday)',
    meeting_time: '10:00 AM - 11:00 AM (IST)',
    meeting_end_time: '11:00 AM',
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    meeting_platform: tab === 'reminder' || tab === 'feedback' ? 'Google Meet' : 'google_meet',
    location: 'Google Meet',
    description: 'Sample agenda for preview.',
  };
}

function applyTemplate(text, plainVars, htmlVars) {
  return String(text || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = htmlVars ? htmlVars[key] : plainVars[key];
    return v !== undefined && v !== null ? String(v) : `{{${key}}}`;
  });
}

function previewCcBccLine(raw, fallback) {
  const t = String(raw || '').trim();
  return t || fallback;
}

function IconGoogleCal() {
  return (
    <svg className={styles.calBrandIcon} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function IconOutlookCal() {
  return (
    <svg className={styles.calBrandIcon} viewBox="0 0 24 24" aria-hidden>
      <path fill="#0078D4" d="M7 3h9a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" />
      <path fill="#fff" d="M7 7h12v2H7zm0 4h12v2H7zm0 4h8v2H7z" opacity="0.9" />
    </svg>
  );
}

function IconIcsCal() {
  return (
    <svg className={styles.calBrandIcon} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#E11D48" />
      <path d="M3 10h18" stroke="#fff" strokeWidth="1.5" />
      <text x="12" y="17.5" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700">
        31
      </text>
    </svg>
  );
}

export function MeetingAttendeeEmailSettingsPage() {
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
      setSettings(res?.data?.data ?? null);
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
      'meeting_link',
      'meeting_platform',
      'location',
      'description',
      'attendee_email',
      'contact_name',
      'company_name',
      'feedback_link',
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
          'meeting_link',
          'meeting_duration_min',
          'meeting_owner_name',
          'attendee_email',
          'account_label',
          'account_email',
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

  async function save() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await meetingsAPI.putDefaultEmailSettings(settings || {});
      setSettings(res?.data?.data ?? null);
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
        meetingsAPI.putDefaultEmailSettings(settings || {}),
      ]);
      setAttendeeTemplates(resT?.data?.data ?? []);
      setSettings(resS?.data?.data ?? settings);
      setAttendeePlaceholderHelp(resT?.data?.placeholder_help ?? attendeePlaceholderHelp);
      setSuccessMsg('Settings saved.');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function cancelEdits() {
    setSuccessMsg(null);
    await load();
  }

  function updateReminderOffset(index, field, value) {
    const list = Array.isArray(settings?.reminder_offsets) ? settings.reminder_offsets : [];
    const next = list.map((item, i) =>
      i === index ? { ...item, [field]: field === 'value' ? Number(value || 1) : value } : item
    );
    updateField('reminder_offsets', next);
  }

  function addReminderOffset() {
    const list = Array.isArray(settings?.reminder_offsets) ? settings.reminder_offsets : [];
    updateField('reminder_offsets', [...list, { value: 30, unit: 'minutes' }]);
  }

  function removeReminderOffset(index) {
    const list = Array.isArray(settings?.reminder_offsets) ? settings.reminder_offsets : [];
    updateField(
      'reminder_offsets',
      list.filter((_, i) => i !== index)
    );
  }

  const meta = cardMeta(tab);
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

  const previewPlain = useMemo(
    () => buildPreviewVars(tab, settings?.include_meeting_details),
    [tab, settings?.include_meeting_details]
  );

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

  const previewStreamParts = useMemo(() => {
    const full = String(resolvedPreviewBodyHtml || '');
    if (!full.trim()) {
      return {
        intro: '<p class="muted">No message body yet.</p>',
        closing: '',
        fullOnly: '<p class="muted">No message body yet.</p>',
      };
    }
    const { before, after } = splitPreviewHtmlBeforeClosing(full);
    const closingTrim = (after || '').trim();
    const beforeTrim = (before || '').trim();
    if (!beforeTrim && closingTrim) {
      return { intro: full, closing: '', fullOnly: full };
    }
    return { intro: before, closing: after, fullOnly: full };
  }, [resolvedPreviewBodyHtml]);

  const previewCcDisplay = previewCcBccLine(
    settings?.default_cc_email,
    'amit.kumar@example.com, neha.sharma@example.com'
  );
  const previewBccDisplay = previewCcBccLine(settings?.default_bcc_email, 'sneha.verma@example.com');

  const personSuffix = (
    <span className={styles.inputSuffixIcon} aria-hidden>
      <MaterialSymbol name="person_add" size="sm" />
    </span>
  );

  const showCalendarLinks =
    settings?.include_meeting_details &&
    (tab === 'reminder' || tab === 'created' || tab === 'updated' || tab === 'cancelled');

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
                  key={tab}
                  scrollableLayout
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
                value={settings?.default_cc_email ?? ''}
                onChange={(e) => updateField('default_cc_email', e.target.value)}
                placeholder="Add CC email addresses"
                disabled={saving || loading}
                suffix={personSuffix}
              />
              <Input
                label="BCC"
                value={settings?.default_bcc_email ?? ''}
                onChange={(e) => updateField('default_bcc_email', e.target.value)}
                placeholder="Add BCC email addresses"
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
                            Send this many minutes/hours/days before the meeting start. Each row is one reminder.
                          </p>
                          {(settings?.reminder_offsets || []).map((item, idx) => (
                            <div key={`offset-${idx}`} className={styles.reminderRow}>
                              <Input
                                label={idx === 0 ? 'Amount' : undefined}
                                type="number"
                                min="1"
                                value={item?.value ?? 1}
                                onChange={(e) => updateReminderOffset(idx, 'value', e.target.value)}
                                disabled={saving}
                              />
                              <Select
                                label={idx === 0 ? 'Unit' : undefined}
                                value={item?.unit || 'minutes'}
                                onChange={(e) => updateReminderOffset(idx, 'unit', e.target.value)}
                                options={[
                                  { value: 'minutes', label: 'Minutes' },
                                  { value: 'hours', label: 'Hours' },
                                  { value: 'days', label: 'Days' },
                                ]}
                                disabled={saving}
                              />
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => removeReminderOffset(idx)}
                                disabled={saving || (settings?.reminder_offsets || []).length <= 1}
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                          <button type="button" className={styles.addReminderLink} onClick={addReminderOffset} disabled={saving}>
                            + Add another reminder
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <Checkbox
                      label="Include meeting details in email"
                      checked={Boolean(settings?.include_meeting_details)}
                      onChange={(e) => updateField('include_meeting_details', e.target.checked)}
                      disabled={saving || loading}
                    />
                  </>
                ) : (
                  <>
                    <Checkbox
                      label="Include meeting details in email"
                      checked={Boolean(settings?.include_meeting_details)}
                      onChange={(e) => updateField('include_meeting_details', e.target.checked)}
                      disabled={saving || loading}
                    />
                    {tab === 'feedback' ? (
                      <p className={styles.hint} style={{ marginBottom: 0 }}>
                        Reminder and feedback timing are configured under <strong>Automation</strong> on the{' '}
                        <strong>Default Meeting Reminder</strong> card.
                      </p>
                    ) : null}
                  </>
                )}
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
                <span className={settings?.default_cc_email?.trim() ? '' : styles.previewMetaFaint}>{previewCcDisplay}</span>
              </div>
              <div className={styles.previewMetaRow}>
                <span className={styles.previewMetaLabel}>BCC</span>
                <span className={settings?.default_bcc_email?.trim() ? '' : styles.previewMetaFaint}>{previewBccDisplay}</span>
              </div>
            </div>

            <div className={styles.previewBodyRegion}>
              {loading || !settings ? (
                <p className={styles.muted}>Loading…</p>
              ) : (
                <div className={styles.previewStream}>
                {settings?.include_meeting_details ? (
                  <>
                    <div
                      className={styles.previewBody}
                      dangerouslySetInnerHTML={{ __html: previewStreamParts.intro }}
                    />
                    <div
                      className={`${styles.meetingDetailsAlert} ${styles[`meetingDetailsAlert_tone_${tab}`]}`}
                    >
                      <div className={styles.meetingDetailsHeroRow}>
                        <span className={styles.meetingDetailsHeroIcon} aria-hidden>
                          <MaterialSymbol name={meta.previewHeroIcon} size="md" className={styles.meetingDetailsHeroGlyph} />
                        </span>
                        <div className={styles.meetingDetailsHeroCopy}>
                          <div className={styles.meetingDetailsAlertTitle}>Meeting details</div>
                          <div className={styles.meetingDetailsGrid}>
                            {[
                              { label: 'Meeting Title', value: previewPlain.title || '—', isLink: false },
                              { label: 'Date', value: previewPlain.meeting_date || '—', isLink: false },
                              { label: 'Time', value: previewPlain.meeting_time || '—', isLink: false },
                              { label: 'Platform', value: previewPlain.meeting_platform || '—', isLink: false },
                              {
                                label: 'Meeting Link',
                                value: previewPlain.meeting_link || '',
                                isLink: true,
                              },
                            ].map((row) => (
                              <div key={row.label} className={styles.meetingDetailLine}>
                                <span className={styles.meetingDetailLabel}>{row.label}</span>
                                <span className={styles.meetingDetailValue}>
                                  {row.isLink && row.value ? (
                                    <a href={row.value} target="_blank" rel="noopener noreferrer">
                                      {row.value}
                                    </a>
                                  ) : (
                                    row.value || '—'
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    {previewStreamParts.closing.trim() ? (
                      <div
                        className={styles.previewBody}
                        dangerouslySetInnerHTML={{ __html: previewStreamParts.closing }}
                      />
                    ) : null}
                  </>
                ) : (
                  <div
                    className={styles.previewBody}
                    dangerouslySetInnerHTML={{ __html: previewStreamParts.fullOnly }}
                  />
                )}

                {tab === 'feedback' ? (
                  <div>
                    <a className={styles.previewCta} href={previewPlain.feedback_link} onClick={(e) => e.preventDefault()}>
                      Share your feedback
                    </a>
                    <p className={styles.muted} style={{ marginTop: 8, fontSize: 12 }}>
                      {previewPlain.feedback_link}
                    </p>
                  </div>
                ) : null}

                {showCalendarLinks ? (
                  <div className={styles.calendarRow}>
                    <span className={styles.calendarLink}>
                      <IconGoogleCal />
                      Add to Google Calendar
                    </span>
                    <span className={styles.calendarLink}>
                      <IconOutlookCal />
                      Add to Outlook
                    </span>
                    <span className={styles.calendarLink}>
                      <IconIcsCal />
                      Add to iCal
                    </span>
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
        <div
          className={styles.modalPreviewBody}
          dangerouslySetInnerHTML={{
            __html: resolvedPreviewBodyHtml || '<p>No content yet.</p>',
          }}
        />
      </Modal>
    </div>
  );
}
