import React, { useCallback, useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { InfoHelpIcon } from '../components/ui/InfoHelpIcon';
import { meetingsAPI } from '../services/meetingsAPI';
import { ScriptBodyEditor } from '../features/callScripts/ScriptBodyEditor';
import { IconChevronDown } from '../features/contacts/ListActionsMenuIcons';
import styles from './MeetingAttendeeEmailSettingsPage.module.scss';

const TEMPLATE_TABS = [
  { kind: 'reminder', label: 'Reminder email' },
  { kind: 'feedback', label: 'Feedback email' },
  { kind: 'created', label: 'New meeting email' },
  { kind: 'updated', label: 'Updated meeting email' },
  { kind: 'cancelled', label: 'Cancelled meeting email' },
];

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

/** Sample data for preview — mirrors backend test email samples. */
function buildPreviewVars(tab, includeMeetingDetails) {
  const include = includeMeetingDetails !== false;
  const base = {
    title: 'SEO Proposal Discussion',
    attendee_email: 'rahul.patel@example.com',
    contact_name: 'Rahul Patel',
    company_name: 'Your Company',
    feedback_link: 'https://yourcompany.com/feedback/abc123',
    // attendee notification placeholders (created/updated/cancelled)
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

export function MeetingAttendeeEmailSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [tab, setTab] = useState('reminder');
  const [settings, setSettings] = useState(null);
  const [attendeeTemplates, setAttendeeTemplates] = useState([]);
  const [attendeePlaceholderHelp, setAttendeePlaceholderHelp] = useState([]);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
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
      const res = await meetingsAPI.putUserAttendeeEmailTemplates({ templates });
      setAttendeeTemplates(res?.data?.data ?? []);
      setAttendeePlaceholderHelp(res?.data?.placeholder_help ?? attendeePlaceholderHelp);
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

  async function sendTestEmail() {
    setSendingTestEmail(true);
    setError(null);
    setSuccessMsg(null);
    try {
      if (tab === 'reminder' || tab === 'feedback') {
        await meetingsAPI.sendDefaultSettingsTestEmail({
          type: tab,
          to_email: testEmailTo,
        });
      } else {
        await meetingsAPI.sendUserAttendeeEmailTemplateTestEmail({
          template_kind: tab,
          to_email: testEmailTo,
        });
      }
      setSuccessMsg('Test email sent.');
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to send test email');
    } finally {
      setSendingTestEmail(false);
    }
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

  const headerTitle =
    tab === 'reminder'
      ? 'Default Meeting Reminder'
      : tab === 'feedback'
        ? 'Default Meeting Feedback'
        : tab === 'created'
          ? 'Default New Meeting Email'
          : tab === 'updated'
            ? 'Default Updated Meeting Email'
            : 'Default Cancelled Meeting Email';

  return (
    <div className={styles.page}>
      <PageHeader
        title={headerTitle}
        description="Schedule, remind and get feedback for successful meetings. These defaults apply to meetings you create or own."
        titleIcon="event"
        actions={
          <div className={styles.headerActions}>
            <Input
              type="email"
              value={testEmailTo}
              onChange={(e) => setTestEmailTo(e.target.value)}
              placeholder="Test recipient email"
              disabled={saving || sendingTestEmail || loading}
              className={styles.testEmailInput}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={sendTestEmail}
              loading={sendingTestEmail}
              disabled={!String(testEmailTo || '').trim() || saving || loading}
            >
              Send Test Email
            </Button>
            <Button type="button" variant="ghost" onClick={cancelEdits} disabled={saving || sendingTestEmail || loading}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={tab === 'reminder' || tab === 'feedback' ? save : saveAttendeeTemplates}
              loading={saving}
              disabled={
                loading ||
                (tab === 'reminder' || tab === 'feedback'
                  ? !settings
                  : attendeeTemplates.length < 1)
              }
            >
              Save Settings
            </Button>
          </div>
        }
      />

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

      <div className={styles.layout}>
        <Card className={styles.configCard}>
          <p className={styles.intro}>
            Choose an email type, edit subject and content below, then adjust timing on the Reminder tab. The preview
            uses example data.
          </p>

          <div className={styles.tabs}>
            {TEMPLATE_TABS.map((item) => (
              <button
                key={item.kind}
                type="button"
                className={`${styles.tab} ${tab === item.kind ? styles.tabActive : ''}`}
                onClick={() => setTab(item.kind)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {loading ? (
            <p className={styles.muted}>Loading settings…</p>
          ) : settings ? (
            <div className={styles.form}>
              <Input
                label="Email subject"
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
              <div>
                <div className={styles.label}>Email content</div>
                <p className={styles.hint}>
                  Use the toolbar. Insert placeholders with <strong>Variable</strong> in the editor.
                </p>
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

              {tab === 'reminder' ? (
                <div className={styles.configSection}>
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
                      <span className={styles.sectionTitle}>Automation</span>
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
                        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                          <Checkbox
                            label="Include meeting details in email"
                            checked={Boolean(settings?.include_meeting_details)}
                            onChange={(e) => updateField('include_meeting_details', e.target.checked)}
                            disabled={saving || loading}
                          />
                        </div>
                      </div>

                      <div className={styles.reminderSchedule}>
                        <div className={styles.label} style={{ marginBottom: 10 }}>
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
                </div>
              ) : (
                <div className={styles.configSection}>
                  <div className={styles.sectionTitle}>Email options</div>
                  <Checkbox
                    label="Include meeting details in email"
                    checked={Boolean(settings?.include_meeting_details)}
                    onChange={(e) => updateField('include_meeting_details', e.target.checked)}
                    disabled={saving || loading}
                  />
                  {tab === 'feedback' ? (
                    <p className={styles.hint} style={{ marginBottom: 0 }}>
                      Reminder and feedback timing are configured on the <strong>Reminder email</strong> tab under
                      Automation.
                    </p>
                  ) : null}
                </div>
              )}

              <div className={styles.footerNote}>
                <InfoHelpIcon
                  title="About these settings"
                  modalTitle="Default meeting emails"
                  message="Reminder/feedback and attendee notification emails use the meeting owner’s saved defaults. Preview shows sample data; real sends use each meeting’s details."
                />
                <span>
                  These settings apply to meetings you create or own. Reminder emails go out before the start time;
                  feedback requests go out after the meeting ends, based on the delay you set. New/Updated/Cancelled
                  emails are sent immediately when the meeting is saved.
                </span>
              </div>
            </div>
          ) : (
            <p className={styles.muted}>Could not load settings.</p>
          )}
        </Card>

        <aside className={styles.previewCard} aria-label="Email preview">
          <h2 className={styles.previewTitle}>Email preview</h2>
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
              <span className={styles.muted}>amit.kumar@example.com, neha.sharma@example.com</span>
            </div>
            <div className={styles.previewMetaRow}>
              <span className={styles.previewMetaLabel}>BCC</span>
              <span className={styles.muted}>sneha.verma@example.com</span>
            </div>
          </div>

          {loading || !settings ? (
            <p className={styles.muted}>Loading…</p>
          ) : (
            <>
              <div
                className={styles.previewBody}
                dangerouslySetInnerHTML={{
                  __html: resolvedPreviewBodyHtml || '<p class="muted">No message body yet.</p>',
                }}
              />

              {settings?.include_meeting_details ? (
                <div className={styles.meetingDetailsBox}>
                  <div className={styles.meetingDetailsTitle}>Meeting details</div>
                  <div className={styles.meetingDetailsGrid}>
                    <div className={styles.meetingDetailRow}>
                      <span className={styles.previewMetaLabel}>Title</span>
                      <span>{previewPlain.title}</span>
                    </div>
                    <div className={styles.meetingDetailRow}>
                      <span className={styles.previewMetaLabel}>Date</span>
                      <span>{previewPlain.meeting_date || '—'}</span>
                    </div>
                    <div className={styles.meetingDetailRow}>
                      <span className={styles.previewMetaLabel}>Time</span>
                      <span>{previewPlain.meeting_time || '—'}</span>
                    </div>
                    <div className={styles.meetingDetailRow}>
                      <span className={styles.previewMetaLabel}>Platform</span>
                      <span>{previewPlain.meeting_platform || '—'}</span>
                    </div>
                    <div className={styles.meetingDetailRow}>
                      <span className={styles.previewMetaLabel}>Link</span>
                      <span>
                        {previewPlain.meeting_link ? (
                          <a href={previewPlain.meeting_link} target="_blank" rel="noopener noreferrer">
                            {previewPlain.meeting_link}
                          </a>
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

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

              {tab === 'reminder' ? (
                <div className={styles.calendarRow}>
                  <span className={styles.calendarBtn}>Add to Google Calendar</span>
                  <span className={styles.calendarBtn}>Add to Outlook</span>
                  <span className={styles.calendarBtn}>Add to iCal</span>
                </div>
              ) : null}

              <p className={styles.previewDisclaimer}>
                Preview shows example data. Actual emails use real meeting and contact values.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
