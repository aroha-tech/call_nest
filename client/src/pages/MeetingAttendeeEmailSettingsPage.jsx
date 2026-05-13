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
import { formatEmailRecipientListDisplay, validateEmailRecipientList } from '../utils/emailRecipientList';
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

const EMAIL_KINDS = EMAIL_TYPE_CARDS.map((c) => c.kind);

function ensureDefaultCcBccByKind(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const by = { ...(settings.default_cc_bcc_by_kind || {}) };
  for (const k of EMAIL_KINDS) {
    const slot = by[k];
    if (!slot || typeof slot !== 'object') {
      by[k] = { cc: '', bcc: '' };
    } else {
      by[k] = { cc: String(slot.cc ?? ''), bcc: String(slot.bcc ?? '') };
    }
  }
  const allEmpty = EMAIL_KINDS.every((k) => !String(by[k].cc || '').trim() && !String(by[k].bcc || '').trim());
  if (allEmpty && (String(settings.default_cc_email || '').trim() || String(settings.default_bcc_email || '').trim())) {
    const cc = String(settings.default_cc_email || '');
    const bcc = String(settings.default_bcc_email || '');
    for (const k of EMAIL_KINDS) {
      by[k] = { cc, bcc };
    }
  }
  return { ...settings, default_cc_bcc_by_kind: by };
}

function validateAllMeetingCcBcc(settings) {
  const by = settings?.default_cc_bcc_by_kind || {};
  /** @type {Record<string, string>} */
  const errors = {};
  for (const k of EMAIL_KINDS) {
    const slot = by[k] || {};
    const ccRes = validateEmailRecipientList(slot.cc || '');
    if (!ccRes.valid) {
      errors[`${k}_cc`] =
        ccRes.invalidParts.length > 0
          ? `Invalid email address: ${ccRes.invalidParts.join(', ')}`
          : 'Invalid CC list';
    }
    const bccRes = validateEmailRecipientList(slot.bcc || '');
    if (!bccRes.valid) {
      errors[`${k}_bcc`] =
        bccRes.invalidParts.length > 0
          ? `Invalid email address: ${bccRes.invalidParts.join(', ')}`
          : 'Invalid BCC list';
    }
  }
  return errors;
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
    feedback_url: 'https://yourcompany.com/feedback/abc123',
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
  const [ccBccErrors, setCcBccErrors] = useState({});

  React.useEffect(() => {
    if (tab !== 'reminder') setAutomationExpanded(false);
  }, [tab]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setCcBccErrors({});
    try {
      const [res, resT] = await Promise.all([
        meetingsAPI.getDefaultEmailSettings(),
        meetingsAPI.getUserAttendeeEmailTemplates(),
      ]);
      const raw = res?.data?.data ?? null;
      setSettings(raw ? ensureDefaultCcBccByKind(raw) : null);
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
      'feedback_url',
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

  function updateCcBccField(kind, field, value) {
    setError(null);
    setCcBccErrors((prev) => {
      const next = { ...prev };
      delete next[`${kind}_${field}`];
      return next;
    });
    setSettings((prev) => {
      if (!prev) return prev;
      const ensured = ensureDefaultCcBccByKind(prev);
      const by = { ...ensured.default_cc_bcc_by_kind };
      by[kind] = { ...(by[kind] || { cc: '', bcc: '' }), [field]: value };
      return { ...prev, default_cc_bcc_by_kind: by };
    });
  }

  function updateField(field, value) {
    setSettings((prev) => ({ ...(prev || {}), [field]: value }));
  }

  async function save() {
    const errs = validateAllMeetingCcBcc(settings);
    if (Object.keys(errs).length) {
      setCcBccErrors(errs);
      setError('Fix invalid CC or BCC email addresses before saving.');
      return;
    }
    setCcBccErrors({});
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await meetingsAPI.putDefaultEmailSettings(settings || {});
      const raw = res?.data?.data ?? null;
      setSettings(raw ? ensureDefaultCcBccByKind(raw) : null);
      setSuccessMsg('Settings saved.');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveAttendeeTemplates() {
    const errs = validateAllMeetingCcBcc(settings);
    if (Object.keys(errs).length) {
      setCcBccErrors(errs);
      setError('Fix invalid CC or BCC email addresses before saving.');
      return;
    }
    setCcBccErrors({});
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
      const rawS = resS?.data?.data ?? settings;
      setSettings(rawS ? ensureDefaultCcBccByKind(rawS) : null);
      setAttendeePlaceholderHelp(resT?.data?.placeholder_help ?? attendeePlaceholderHelp);
      setSuccessMsg('Settings saved.');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function resetCurrentTabDefaults() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (tab === 'reminder' || tab === 'feedback') {
        const res = await meetingsAPI.resetDefaultEmailSection({ section: tab });
        const raw = res?.data?.data ?? null;
        setSettings(raw ? ensureDefaultCcBccByKind(raw) : null);
      } else {
        await meetingsAPI.resetUserAttendeeEmailTemplate({ template_kind: tab });
        const [resT, resS] = await Promise.all([
          meetingsAPI.getUserAttendeeEmailTemplates(),
          meetingsAPI.getDefaultEmailSettings(),
        ]);
        setAttendeeTemplates(resT?.data?.data ?? []);
        const rawS = resS?.data?.data ?? settings;
        setSettings(rawS ? ensureDefaultCcBccByKind(rawS) : null);
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

              <div className={styles.recipientPanel} role="group" aria-labelledby={`cc-bcc-heading-${tab}`}>
                <h3 className={styles.recipientPanelTitle} id={`cc-bcc-heading-${tab}`}>
                  Additional recipients for <strong>{meta.tabLabel}</strong> emails only
                </h3>
                <p className={styles.recipientPanelHint}>
                  CC and BCC here apply only to this email type (for example, Invitation vs Reminder). Separate
                  multiple addresses with commas, semicolons, or line breaks. Leave blank to send only to the attendee.
                </p>
                <Input
                  label="CC (optional)"
                  value={activeCcBcc.cc}
                  onChange={(e) => updateCcBccField(tab, 'cc', e.target.value)}
                  placeholder="manager@company.com, team@company.com"
                  disabled={saving || loading}
                  suffix={personSuffix}
                  error={ccBccErrors[`${tab}_cc`]}
                />
                <Input
                  label="BCC (optional)"
                  value={activeCcBcc.bcc}
                  onChange={(e) => updateCcBccField(tab, 'bcc', e.target.value)}
                  placeholder="archive@company.com"
                  disabled={saving || loading}
                  suffix={personSuffix}
                  error={ccBccErrors[`${tab}_bcc`]}
                />
              </div>

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
                    formatEmailRecipientListDisplay(activeCcBcc.cc) ? '' : styles.previewMetaFaint
                  }
                >
                  {previewCcDisplay}
                </span>
              </div>
              <div className={styles.previewMetaRow}>
                <span className={styles.previewMetaLabel}>BCC</span>
                <span
                  className={
                    formatEmailRecipientListDisplay(activeCcBcc.bcc) ? '' : styles.previewMetaFaint
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
                  <div
                    className={styles.previewBody}
                    dangerouslySetInnerHTML={{
                      __html: resolvedPreviewBodyHtml.trim()
                        ? resolvedPreviewBodyHtml
                        : '<p class="muted">No message body yet.</p>',
                    }}
                  />
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
