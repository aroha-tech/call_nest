import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { Alert } from '../../components/ui/Alert';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { DateTimePickerField } from '../../components/ui/DateTimePickerField';
import { CampaignFilterBuilder } from './CampaignFilterBuilder';
import { defaultRule } from './campaignFilterConfig';
import { ScriptBodyEditor } from '../callScripts/ScriptBodyEditor';
import { CampaignWizardSectionHeader, WizardDecorIcons } from './campaignWizardDecor';
import { AudienceSourceIcon, ChannelPickerGlyph, WizardLaunchRocketHero, WizardRocketMini } from './campaignWizardVisuals';
import { getImmediateStartDate } from './campaignFormHelpers';
import { ContactLeadPickerModal } from '../../components/crm/ContactLeadPickerModal';
import { DEFAULT_PREVIEW_DATA, linkifyHtml, renderPreview } from '../../utils/templateVariables';
import styles from './CampaignsPage.module.scss';

const STEPS = [
  { id: 'info', label: 'Campaign Info', hint: 'Basic details and settings' },
  { id: 'audience', label: 'Audience', hint: 'Define your target audience' },
  { id: 'channel', label: 'Channel & Content', hint: 'Choose channel and content' },
  { id: 'review', label: 'Review & Launch', hint: 'Review and launch campaign' },
];

const CHANNEL_CARDS = [
  { value: 'phone', label: 'Phone Call' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp', comingSoon: true },
  { value: 'sms', label: 'SMS', comingSoon: true },
];

const CHANNEL_HINTS = {
  phone: 'Make calls to your audience.',
  whatsapp: 'Send WhatsApp messages.',
  email: 'Send emails to your audience.',
  sms: 'Send SMS to your audience.',
};

const PAGE_LEADS = [
  null,
  { title: 'Audience', hint: 'Choose who you want to reach with this campaign.' },
  { title: 'Channel & Content', hint: 'Select the channel to reach your audience and customize your content.' },
  { title: 'Review & Launch', hint: 'Review your campaign details before launching.' },
];

const SCHEDULE_SELECT_OPTIONS = [
  { value: 'immediate', label: 'Start immediately', scheduleKey: 'immediate' },
  { value: 'scheduled', label: 'Scheduled start', scheduleKey: 'scheduled' },
];

const DEFAULT_EMAIL_TEMPLATE = `<div style="background:#f4f7fb;padding:40px 0;font-family:Arial,sans-serif;">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
    <tr>
      <td style="background:linear-gradient(135deg,#5b5ff8,#7c3aed);padding:30px;text-align:center;">
        <h1 style="color:#ffffff;margin:0;font-size:28px;">
          Welcome {{contact.first_name}}
        </h1>
        <p style="color:#dbeafe;margin-top:10px;font-size:15px;">
          We&rsquo;re excited to connect with you.
        </p>
      </td>
    </tr>

    <tr>
      <td style="padding:35px;">
        <h2 style="margin-top:0;color:#111827;font-size:22px;">
          Your Campaign Starts Here &#128640;
        </h2>

        <p style="color:#4b5563;font-size:15px;line-height:1.7;">
          Thank you for joining <strong>{{company.name}}</strong>.
          We&rsquo;re here to help you manage campaigns, automate communication,
          and grow your business faster.
        </p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:25px 0;">
          <h3 style="margin-top:0;color:#111827;font-size:18px;">
            Campaign Details
          </h3>

          <p style="margin:8px 0;color:#374151;">
            <strong>Name:</strong> {{contact.first_name}} {{contact.last_name}}
          </p>

          <p style="margin:8px 0;color:#374151;">
            <strong>Email:</strong> {{contact.email}}
          </p>

          <p style="margin:8px 0;color:#374151;">
            <strong>Status:</strong> Active
          </p>
        </div>

        <div style="text-align:center;margin-top:35px;">
          <a href="#"
            style="background:linear-gradient(135deg,#5b5ff8,#7c3aed);
            color:#ffffff;
            text-decoration:none;
            padding:14px 30px;
            border-radius:10px;
            display:inline-block;
            font-size:15px;
            font-weight:bold;">
            Launch Campaign
          </a>
        </div>
      </td>
    </tr>

    <tr>
      <td style="background:#111827;padding:25px;text-align:center;">
        <p style="color:#9ca3af;font-size:13px;margin:0;">
          &copy; 2026 {{company.name}}. All rights reserved.
        </p>

        <p style="color:#6b7280;font-size:12px;margin-top:8px;">
          You&rsquo;re receiving this email because you subscribed to our platform.
        </p>
      </td>
    </tr>
  </table>
</div>`;

const CAMPAIGN_EMAIL_PREVIEW_DATA = {
  ...DEFAULT_PREVIEW_DATA,
  'contact.first_name': 'Rahul',
  'contact.last_name': 'Sharma',
  'contact.full_name': 'Rahul Sharma',
  'contact.email': 'rahul@example.com',
  'contact.phone': '+91 98765 43210',
  'company.name': 'Arohva',
  'company.phone': '+91 1800 123 456',
  'company.email': 'hello@arohva.com',
  'company.website': 'https://arohva.com',
  'campaign.name': 'Spring Growth Campaign',
  'campaign.status': 'Active',
  'campaign.channel': 'Email',
  current_year: '2026',
};

const STATIC_RECORD_OPTIONS = [
  { value: 'lead', label: 'Leads', desc: 'Assign leads to this campaign.' },
  { value: 'contact', label: 'Contacts', desc: 'Assign contacts to this campaign.' },
  { value: 'both', label: 'Both', desc: 'Assign leads and contacts to this campaign.' },
];

function CalendarGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function GlobeGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3 12h18M12 3a14 14 0 000 18M12 3a14 14 0 010 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sampleValueForVariable(variable) {
  const key = String(variable || '').trim();
  const lower = key.toLowerCase();
  const label = key
    .split('.')
    .pop()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

  if (lower.includes('email')) return 'rahul@example.com';
  if (lower.includes('phone') || lower.includes('mobile')) return '+91 98765 43210';
  if (lower.includes('company')) return 'Arohva';
  if (lower.includes('name')) return 'Rahul Sharma';
  if (lower.includes('date')) return '16 May 2026';
  if (lower.includes('time')) return '10:00 AM';
  if (lower.includes('year')) return '2026';
  if (lower.includes('link') || lower.includes('url') || lower.includes('website')) return 'https://example.com';
  if (lower.includes('status')) return 'Active';
  return label || 'Sample Value';
}

function renderCampaignEmailPreview(html) {
  const rendered = renderPreview(html, CAMPAIGN_EMAIL_PREVIEW_DATA);
  const withFallbackSamples = rendered.replace(/{{(.*?)}}/g, (_, raw) => {
    const [variable, fallback] = String(raw).split('|').map((part) => part.trim());
    return fallback || sampleValueForVariable(variable);
  });
  return linkifyHtml(withFallbackSamples);
}

export function CampaignFormWizard({
  step,
  form,
  setForm,
  editing,
  statusOptions,
  tagOptions,
  managerOptions,
  agentOptions,
  staticCampaignOptions,
  campaignTypeSelectOptions,
  campaignStatusSelectOptions,
  pipelineOptions,
  timezoneOptions,
  scriptSelectOptions,
  onRecalculateAudience,
  audienceEstimateLoading,
  formatDateTime,
  formatDate,
  launchBusy,
  onReviewLaunch,
  fieldErrors = {},
  onClearFieldError,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const emailPreviewRef = useRef(null);
  const descLen = (form.description || '').length;

  const audienceTab = form.audienceTab || (form.type === 'static' ? 'static' : 'filter');

  const setAudienceTab = (tab) => {
    if (tab === 'import') return;
    setForm((s) => ({
      ...s,
      audienceTab: tab,
      type: tab === 'static' ? 'static' : 'filter',
      filterRules:
        tab === 'filter' && (!s.filterRules || s.filterRules.length === 0) ? [defaultRule()] : s.filterRules,
    }));
  };

  const estimatedTotal =
    form.audience_estimate_total != null && Number.isFinite(Number(form.audience_estimate_total))
      ? Number(form.audience_estimate_total)
      : null;
  const phoneContentHtml = form.phone_content_html ?? (form.channel === 'phone' ? form.content_html || '' : '');
  const emailContentHtml = form.email_content_html ?? (form.channel === 'email' ? form.content_html || '' : '');

  const selectChannel = useCallback(
    (channel) => {
      setForm((s) => ({
        ...s,
        channel,
        email_content_html:
          channel === 'email' && !s.email_content_html?.trim() ? DEFAULT_EMAIL_TEMPLATE : s.email_content_html,
      }));
    },
    [setForm]
  );

  useEffect(() => {
    if (step === 1 && form.type === 'filter' && estimatedTotal == null && !audienceEstimateLoading) {
      onRecalculateAudience?.();
    }
  }, [step, form.type, estimatedTotal, audienceEstimateLoading, onRecalculateAudience]);

  const audienceEstimateRecencyLabel = useMemo(() => {
    if (!form.audience_estimate_at) return null;
    const t = new Date(form.audience_estimate_at).getTime();
    if (!Number.isFinite(t)) return null;
    const diff = Date.now() - t;
    if (diff >= 0 && diff < 120_000) return 'Just now';
    return formatDateTime ? formatDateTime(form.audience_estimate_at) : String(form.audience_estimate_at);
  }, [form.audience_estimate_at, formatDateTime]);

  const emailPreviewHtml = useMemo(
    () =>
      emailContentHtml?.trim()
        ? renderCampaignEmailPreview(emailContentHtml)
        : '<p style="color:#94a3b8;text-align:center;padding:40px;">No content yet.</p>',
    [emailContentHtml]
  );

  const campaignTypeLabel =
    campaignTypeSelectOptions.find((o) => o.value === String(form.campaign_type_master_id))?.label || '—';
  const campaignStatusLabel =
    campaignStatusSelectOptions.find((o) => o.value === String(form.campaign_status_master_id))?.label || '—';
  const pipelineLabel =
    pipelineOptions.find((o) => o.value === String(form.pipeline_id))?.label || '—';
  const ownerLabel = form.manager_id
    ? managerOptions.find((o) => o.value === String(form.manager_id))?.label || '—'
    : 'All managers';

  const channelMeta = CHANNEL_CARDS.find((c) => c.value === form.channel) || CHANNEL_CARDS[0];

  const scriptSummary =
    form.call_script_id
      ? scriptSelectOptions.find((o) => o.value === String(form.call_script_id))?.label || '—'
      : stripHtml(phoneContentHtml)
        ? 'Custom script'
        : '—';

  const pageLead = PAGE_LEADS[step] || null;
  const startDateLabel =
    form.start_date && formatDate
      ? formatDate(form.start_date)
      : form.start_date && formatDateTime
        ? formatDateTime(form.start_date)
        : '—';

  const scheduleImmediate = form.schedule_mode === 'immediate';
  const staticRecordLabel =
    form.static_record_type === 'contact' ? 'Contacts' : form.static_record_type === 'lead' ? 'Leads' : form.static_record_type === 'both' ? 'Both (Leads & Contacts)' : '—';

  const campaignStatusRichOptions = useMemo(
    () =>
      campaignStatusSelectOptions.map((o) => ({
        ...o,
        statusDot: /\bactive\b/i.test(String(o.label)) ? 'green' : 'muted',
      })),
    [campaignStatusSelectOptions]
  );

  const formatOwnerOptionLabel = useCallback((option) => {
    if (!option) return null;
    if (option.value == null || String(option.value) === '') {
      return <span className={styles.selectOptionPlain}>— All managers —</span>;
    }
    if (option.ownerInitials) {
      return (
        <span className={styles.selectOwnerRow}>
          <span className={styles.selectOwnerAvatar}>{option.ownerInitials}</span>
          <span>{option.label}</span>
        </span>
      );
    }
    return option.label;
  }, []);

  const formatStatusOptionLabel = useCallback((option) => {
    if (!option) return null;
    const dotClass = option.statusDot === 'green' ? styles.selectDotGreen : styles.selectDotMuted;
    return (
      <span className={styles.selectPillRow}>
        <span className={dotClass} />
        <span>{option.label}</span>
      </span>
    );
  }, []);

  const formatScheduleOptionLabel = useCallback((option) => {
    if (!option) return null;
    return (
      <span className={styles.selectPillRow}>
        <span className={styles.selectScheduleIcon}>
          <CalendarGlyph />
        </span>
        <span>{option.label}</span>
      </span>
    );
  }, []);

  const formatTimezoneOptionLabel = useCallback((option) => {
    if (!option) return null;
    return (
      <span className={styles.selectPillRow}>
        <span className={styles.selectGlobeIcon}>
          <GlobeGlyph />
        </span>
        <span>{option.label}</span>
      </span>
    );
  }, []);

  return (
    <div className={`${styles.wizardShell} ${step === 3 ? styles.wizardShellReview : ''}`.trim()}>
      <nav className={styles.wizardStepper} aria-label="Campaign steps">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
          <div
            key={s.id}
            className={`${styles.wizardStep} ${active ? styles.wizardStepActive : ''} ${done ? styles.wizardStepComplete : ''}`.trim()}
            aria-current={active ? 'step' : undefined}
          >
            <div className={styles.wizardStepRail}>
              <div className={styles.wizardStepNumber}>
                {done ? <span className={styles.wizardStepCheck}>✓</span> : i + 1}
              </div>
              {i < STEPS.length - 1 ? <div className={styles.wizardStepConnector} aria-hidden /> : null}
            </div>
            <div className={styles.wizardStepCopy}>
              <span className={styles.wizardStepTitle}>{s.label}</span>
              <span className={styles.wizardStepDesc}>{s.hint}</span>
            </div>
          </div>
          );
        })}
      </nav>

      <div
        className={`${styles.wizardBody} ${step === 2 ? styles.wizardBodyChannelStep : ''} ${step === 3 ? styles.wizardBodyReviewStep : ''}`.trim()}
      >
        {pageLead ? (
          <div className={styles.wizardPageLead}>
            <h2 className={styles.wizardPageTitle}>{pageLead.title}</h2>
            <p className={styles.wizardPageSubtitle}>{pageLead.hint}</p>
          </div>
        ) : null}

        {step === 0 ? (
          <div className={styles.wizardInfoDenseLayout}>
            <div className={styles.wizardInfoCol}>
              <div className={styles.wizardInfoSection}>
                <CampaignWizardSectionHeader
                  title="Basic Information"
                  hint="Provide basic details to identify and organize your campaign."
                />
                <div className={`${styles.wizardInfoBasicGrid} ${styles.wizardInfoGrid}`.trim()}>
                  <Input
                    label="Campaign name"
                    required
                    value={form.name}
                    error={fieldErrors.name}
                    onChange={(e) => {
                      onClearFieldError?.('name');
                      setForm((s) => ({ ...s, name: e.target.value }));
                    }}
                    placeholder="e.g. Summer offer campaign"
                    inputClassName={styles.wizardInfoControl}
                  />
                  <Select
                    label="Campaign type"
                    required
                    value={form.campaign_type_master_id}
                    error={fieldErrors.campaign_type_master_id}
                    onChange={(e) => {
                      onClearFieldError?.('campaign_type_master_id');
                      setForm((s) => ({ ...s, campaign_type_master_id: e.target.value }));
                    }}
                    placeholder="Select campaign type"
                    options={campaignTypeSelectOptions.filter((o) => o.value !== '')}
                    selectClassName={styles.wizardInfoSelect}
                  />
                  <Select
                    label="Select pipeline"
                    allowEmpty
                    value={form.pipeline_id || ''}
                    onChange={(e) => setForm((s) => ({ ...s, pipeline_id: e.target.value }))}
                    placeholder="Select pipeline"
                    options={pipelineOptions}
                    selectClassName={styles.wizardInfoSelect}
                  />
                  <Select
                    label="Campaign owner"
                    allowEmpty
                    value={form.manager_id || ''}
                    onChange={(e) => setForm((s) => ({ ...s, manager_id: e.target.value }))}
                    placeholder="Visible to all managers"
                    options={[{ value: '', label: '— All managers —' }, ...managerOptions]}
                    formatOptionLabel={formatOwnerOptionLabel}
                    selectClassName={styles.wizardInfoSelect}
                  />
                </div>
                <div className={styles.wizardFieldFull}>
                  <label className={styles.wizardTextareaLabel} htmlFor="campaign-desc">
                    Description <span className={styles.optional}>(optional)</span>
                  </label>
                  <textarea
                    id="campaign-desc"
                    className={`${styles.wizardTextarea} ${styles.wizardInfoTextarea}`.trim()}
                    value={form.description}
                    maxLength={500}
                    onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                    placeholder="Add internal notes about this campaign…"
                    rows={3}
                  />
                  <div className={styles.wizardCharCount}>
                    {descLen} / 500
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.wizardInfoCol}>
              <div className={styles.wizardInfoSection}>
                <CampaignWizardSectionHeader
                  tone="brand"
                  icon={WizardDecorIcons.settings}
                  title="Campaign Settings"
                  hint="Set status, visibility and other preferences."
                />
                <div className={`${styles.wizardGrid2} ${styles.wizardInfoGrid}`.trim()}>
                  <Select
                    label="Campaign status"
                    required
                    value={form.campaign_status_master_id}
                    error={fieldErrors.campaign_status_master_id}
                    onChange={(e) => {
                      onClearFieldError?.('campaign_status_master_id');
                      setForm((s) => ({ ...s, campaign_status_master_id: e.target.value }));
                    }}
                    placeholder="Select status"
                    options={campaignStatusRichOptions}
                    formatOptionLabel={formatStatusOptionLabel}
                    selectClassName={styles.wizardInfoSelect}
                  />
                  <Select
                    label="Schedule"
                    value={form.schedule_mode}
                    onChange={(e) => {
                      const mode = e.target.value;
                      onClearFieldError?.('start_date');
                      setForm((s) => ({
                        ...s,
                        schedule_mode: mode,
                        start_date: mode === 'immediate' ? '' : s.start_date,
                      }));
                    }}
                    options={SCHEDULE_SELECT_OPTIONS}
                    formatOptionLabel={formatScheduleOptionLabel}
                    selectClassName={styles.wizardInfoSelect}
                  />
                </div>
                <div className={`${styles.wizardInfoDatesRow} ${styles.wizardInfoGrid}`.trim()}>
                  <DateTimePickerField
                    mode="date"
                    label="Start date"
                    required={!scheduleImmediate}
                    disabled={scheduleImmediate}
                    error={fieldErrors.start_date}
                    hint={
                      scheduleImmediate
                        ? 'Uses today’s date when you set an end date; not required on its own.'
                        : undefined
                    }
                    value={
                      scheduleImmediate
                        ? form.end_date
                          ? form.start_date || getImmediateStartDate()
                          : form.start_date || ''
                        : form.start_date || ''
                    }
                    onChange={(v) => {
                      if (scheduleImmediate) return;
                      onClearFieldError?.('start_date');
                      setForm((s) => ({ ...s, start_date: v || '' }));
                    }}
                    placeholder={scheduleImmediate ? 'Today’s date' : 'Select date'}
                    inputClassName={styles.wizardInfoDateTrigger}
                  />
                  <DateTimePickerField
                    mode="date"
                    label="End date (optional)"
                    value={form.end_date || ''}
                    onChange={(v) => {
                      const endVal = v || '';
                      setForm((s) => {
                        const next = { ...s, end_date: endVal };
                        if (s.schedule_mode === 'immediate') {
                          next.start_date = endVal ? getImmediateStartDate() : '';
                        }
                        return next;
                      });
                    }}
                    placeholder="Select date"
                    inputClassName={styles.wizardInfoDateTrigger}
                  />
                  <Select
                    label="Time zone"
                    value={form.timezone || ''}
                    onChange={(e) => setForm((s) => ({ ...s, timezone: e.target.value }))}
                    options={timezoneOptions}
                    formatOptionLabel={formatTimezoneOptionLabel}
                    selectClassName={styles.wizardInfoSelect}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <>
            <section className={styles.wizardSection}>
              <CampaignWizardSectionHeader
                tone="brand"
                icon={WizardDecorIcons.audience}
                title="Audience source"
                hint="Choose how contacts are selected for this campaign."
              />
              <div className={styles.audienceTabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={audienceTab === 'filter'}
                  className={`${styles.audienceTab} ${audienceTab === 'filter' ? styles.audienceTabActive : ''}`.trim()}
                  onClick={() => setAudienceTab('filter')}
                  disabled={!!editing}
                >
                  <span className={styles.audienceTabIcon}>
                    <AudienceSourceIcon variant="filter" />
                  </span>
                  <span className={styles.audienceTabBody}>
                    <strong>Filter (Dynamic rules)</strong>
                    <span className={styles.audienceTabDesc}>Use rules to build a dynamic audience.</span>
                  </span>
                  {audienceTab === 'filter' ? <span className={styles.audienceTabCheck}>✓</span> : null}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={audienceTab === 'static'}
                  className={`${styles.audienceTab} ${audienceTab === 'static' ? styles.audienceTabActive : ''}`.trim()}
                  onClick={() => setAudienceTab('static')}
                  disabled={!!editing}
                >
                  <span className={styles.audienceTabIcon}>
                    <AudienceSourceIcon variant="list" />
                  </span>
                  <span className={styles.audienceTabBody}>
                    <strong>Static list</strong>
                    <span className={styles.audienceTabDesc}>Use an existing list of contacts.</span>
                  </span>
                  {audienceTab === 'static' ? <span className={styles.audienceTabCheck}>✓</span> : null}
                </button>
                <button type="button" className={`${styles.audienceTab} ${styles.audienceTabDisabled}`} disabled>
                  <span className={styles.audienceTabIcon}>
                    <AudienceSourceIcon variant="import" />
                  </span>
                  <span className={styles.audienceTabBody}>
                    <strong>Import</strong>
                    <span className={styles.audienceTabDesc}>Import contacts from a file.</span>
                  </span>
                </button>
              </div>
              {editing ? (
                <div style={{ marginTop: '16px' }}>
                  <Alert variant="warning" display="inline">
                    Audience type cannot change after creation.
                  </Alert>
                </div>
              ) : null}
            </section>

            {form.type === 'filter' ? (
              <section className={styles.wizardSection}>
                <CampaignWizardSectionHeader
                  tone="brand"
                  icon={WizardDecorIcons.rules}
                  title="Define Audience Rules"
                  hint="Tag rules match contacts that have any of the selected tags."
                />
                <CampaignFilterBuilder
                  rules={form.filterRules || []}
                  onChange={(next) => setForm((s) => ({ ...s, filterRules: next }))}
                  statusOptions={statusOptions}
                  tagOptions={tagOptions}
                  managerOptions={managerOptions}
                  agentOptions={agentOptions}
                  campaignOptions={staticCampaignOptions}
                />
              </section>
            ) : (
              <section className={styles.wizardSection}>
                <CampaignWizardSectionHeader
                  tone="brand"
                  icon={WizardDecorIcons.audience}
                  title="Record type"
                  hint="Choose whether this campaign targets leads or contacts."
                />
                <div
                  className={`${styles.staticRecordTabs} ${fieldErrors.static_record_type ? styles.staticRecordTabsError : ''}`.trim()}
                  role="radiogroup"
                  aria-label="Record type"
                  aria-invalid={fieldErrors.static_record_type ? true : undefined}
                >
                  {STATIC_RECORD_OPTIONS.map((opt) => {
                    const active = (form.static_record_type || 'lead') === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`${styles.audienceTab} ${active ? styles.audienceTabActive : ''}`.trim()}
                        onClick={() => {
                          onClearFieldError?.('static_record_type');
                          setForm((s) => ({ ...s, static_record_type: opt.value, static_contact_ids: [] }));
                        }}
                      >
                        <span className={styles.audienceTabIcon}>
                          <AudienceSourceIcon variant={opt.value === 'lead' ? 'filter' : 'list'} />
                        </span>
                        <span className={styles.audienceTabBody}>
                          <strong>{opt.label}</strong>
                          <span className={styles.audienceTabDesc}>{opt.desc}</span>
                        </span>
                        {active ? <span className={styles.audienceTabCheck}>✓</span> : null}
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.static_record_type ? (
                  <p className={styles.wizardFieldError} role="alert">
                    {fieldErrors.static_record_type}
                  </p>
                ) : null}
                
                <Alert variant="info" style={{ marginTop: 24 }}>
                  <strong>After saving, assign records from the Leads or Contacts list, or import them with a campaign column.</strong>
                </Alert>
              </section>
            )}

            {form.type === 'filter' ? (
              <div className={styles.audienceEstimate}>
                <div className={styles.audienceEstimateMain}>
                  <div className={styles.audienceEstimateIcon} aria-hidden>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
                        stroke="currentColor"
                        strokeWidth="1.65"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className={styles.audienceEstimateLabel}>Estimated audience size</div>
                    <div className={styles.audienceEstimateValue}>
                      {estimatedTotal != null ? `${estimatedTotal.toLocaleString()} Contacts` : 'Not calculated yet'}
                    </div>
                  </div>
                </div>
                <div className={styles.audienceEstimateActions}>
                  <div className={styles.audienceEstimateMeta}>
                    Last calculated{' '}
                    {audienceEstimateRecencyLabel ?? '—'}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onRecalculateAudience}
                    disabled={audienceEstimateLoading}
                    className={styles.audienceRecalculateBtn}
                  >
                    {audienceEstimateLoading ? (
                      'Calculating…'
                    ) : (
                      <>
                        <span className={styles.audienceRecalculateIcon} aria-hidden>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M4.5 9.5A7.5 7.5 0 0118.2 6M19.5 14.5A7.5 7.5 0 015.8 18M6 6V3H3M18 18v3h3"
                              stroke="currentColor"
                              strokeWidth="1.75"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        Recalculate
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <div className={styles.wizardChannelStep}>
            <section className={styles.wizardSection}>
              <div className={styles.channelGrid}>
                {CHANNEL_CARDS.map((c) => {
                  const active = form.channel === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      className={`${styles.channelCard} ${styles[`channelPick_${c.value}`]} ${active ? styles.channelCardActive : ''} ${c.comingSoon ? styles.channelCardComingSoon : ''}`.trim()}
                      onClick={() => {
                        if (!c.comingSoon) selectChannel(c.value);
                      }}
                      disabled={c.comingSoon || !!editing}
                    >
                      <span className={styles.channelCardIconWrap}>
                        <ChannelPickerGlyph channel={c.value} />
                      </span>
                      <span className={styles.channelCardText}>
                        <span className={styles.channelCardLabel}>
                          {c.label}
                          {c.comingSoon ? <span className={styles.comingSoonBadge}>Coming Soon</span> : null}
                        </span>
                        <span className={styles.channelCardHint}>{CHANNEL_HINTS[c.value]}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {editing ? (
                <div style={{ marginTop: 16 }}>
                  <Alert variant="warning" display="inline">
                    Channel cannot be changed after campaign creation.
                  </Alert>
                </div>
              ) : null}
            </section>

            {form.channel === 'phone' ? (
              <section className={styles.wizardSection}>
                <CampaignWizardSectionHeader
                  title="Call Script"
                  hint="Select a pre-built script agents will follow during calls, or write inline talking points below."
                />
                <div style={{ maxWidth: 400 }}>
                  <Select
                    label="Call script"
                    allowEmpty
                    compact
                    value={form.call_script_id || ''}
                    onChange={(e) => setForm((s) => ({ ...s, call_script_id: e.target.value }))}
                    placeholder="Select script"
                    options={[{ value: '', label: '— None —' }, ...scriptSelectOptions]}
                    wrapperClassName={styles.wizardCallScriptSelect}
                  />
                </div>
                <div style={{ marginTop: 16 }}>
                  <label className={styles.wizardTextareaLabel}>Campaign notes / inline script <span className={styles.optional}>(optional)</span></label>
                  <div className={styles.wizardQuill}>
                    <ScriptBodyEditor
                      value={phoneContentHtml}
                      onChange={(html) => setForm((s) => ({ ...s, phone_content_html: html }))}
                      placeholder="Write campaign-specific talking points…"
                      compact
                      scrollableLayout
                      denseScrollLayout
                    />
                  </div>
                </div>
              </section>
            ) : form.channel === 'email' ? (
              <section className={styles.wizardSection}>
                <CampaignWizardSectionHeader
                  title="Email Template"
                  hint="Design the email content that will be sent to your audience. Switch between Visual and HTML modes."
                />
                <div className={styles.emailTemplateToolbar}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setForm((s) => ({ ...s, email_content_html: DEFAULT_EMAIL_TEMPLATE }))}
                  >
                    <span className={styles.emailToolbarBtnInner}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 4v5h5M20 20v-5h-5M5 19A8 8 0 0119 8M19 5a8 8 0 00-14 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Reset to default
                    </span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEmailPreviewOpen(true)}
                    disabled={!emailContentHtml?.trim()}
                  >
                    <span className={styles.emailToolbarBtnInner}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" /></svg>
                      Preview
                    </span>
                  </Button>
                </div>
                <div className={styles.wizardQuill}>
                  <ScriptBodyEditor
                    value={emailContentHtml || DEFAULT_EMAIL_TEMPLATE}
                    onChange={(html) => setForm((s) => ({ ...s, email_content_html: html }))}
                    placeholder="Hello {{contact.first_name}}, …"
                    compact
                    scrollableLayout
                    denseScrollLayout
                    enableHtmlSourceToggle
                  />
                </div>
              </section>
            ) : (
              <section className={styles.wizardSection}>
                <CampaignWizardSectionHeader
                  title="Template"
                  hint={`Pre-approved ${form.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} templates will be available here.`}
                />
                <div className={styles.wizardComingSoonPlaceholder}>
                  <p className={styles.wizardMuted}>
                    Template selection for {form.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} campaigns is coming soon.
                  </p>
                </div>
              </section>
            )}
          </div>
        ) : null}

        {step === 3 ? (
          <div className={styles.reviewLayout}>
            <div className={styles.reviewColumns}>
              <div className={styles.reviewCard}>
                <h4>Campaign summary</h4>
                <ul className={styles.reviewList}>
                  <li>
                    <span>Campaign name</span> <strong>{form.name || '—'}</strong>
                  </li>
                  <li>
                    <span>Campaign type</span> <strong>{campaignTypeLabel}</strong>
                  </li>
                  <li>
                    <span>Pipeline</span> <strong>{pipelineLabel}</strong>
                  </li>
                  <li>
                    <span>Owner</span> <strong>{ownerLabel}</strong>
                  </li>
                  <li>
                    <span>Status</span> <strong>{campaignStatusLabel}</strong>
                  </li>
                  <li>
                    <span>Start date</span> <strong>{startDateLabel}</strong>
                  </li>
                </ul>
              </div>
              <div className={styles.reviewCard}>
                <h4>Audience summary</h4>
                <ul className={styles.reviewList}>
                  <li>
                    <span>Source</span>{' '}
                    <strong>
                      {form.type === 'filter' ? 'Filter (Dynamic rules)' : 'Static list'}
                    </strong>
                  </li>
                  {form.type === 'static' ? (
                    <li>
                      <span>Record type</span> <strong>{staticRecordLabel}</strong>
                    </li>
                  ) : null}
                  <li>
                    <span>Rules applied</span>{' '}
                    <strong>
                      {form.type === 'filter' ? `${(form.filterRules || []).length} rules` : '—'}
                    </strong>
                  </li>
                  <li>
                    <span>Estimated audience size</span>{' '}
                    <strong>
                      {form.type === 'filter' && estimatedTotal != null
                        ? `${estimatedTotal.toLocaleString()} Contacts`
                        : '—'}
                    </strong>
                  </li>
                  <li>
                    <span>Last calculated</span>{' '}
                    <strong>
                      {form.audience_estimate_at && formatDateTime
                        ? formatDateTime(form.audience_estimate_at)
                        : '—'}
                    </strong>
                  </li>
                </ul>
              </div>
              <div className={`${styles.reviewCard} ${styles.reviewCardWide}`.trim()}>
                <h4>Channel &amp; Content summary</h4>
                <ul className={styles.reviewList}>
                  <li>
                    <span>Channel</span>{' '}
                    <strong className={styles.reviewChannelLine}>
                      <span
                        className={`${styles.reviewChannelGlyph} ${styles[`reviewChannelGlyph_${form.channel || 'phone'}`]}`.trim()}
                      >
                        <ChannelPickerGlyph channel={form.channel || 'phone'} />
                      </span>
                      {channelMeta.label}
                    </strong>
                  </li>
                  <li>
                    <span>Content</span> <strong>{scriptSummary}</strong>
                  </li>
                </ul>
              </div>
            </div>
            <aside className={styles.reviewAside}>
              <div className={styles.reviewLaunchCard}>
                <WizardLaunchRocketHero className={styles.reviewRocketSvg} />
                <h4>Ready to launch?</h4>
                <p>Your campaign is ready to go live.</p>
                <ul className={styles.reviewChecklist}>
                  <li>
                    <span className={styles.reviewCheckIcon} aria-hidden>
                      ✓
                    </span>
                    Campaign info
                  </li>
                  <li>
                    <span className={styles.reviewCheckIcon} aria-hidden>
                      ✓
                    </span>
                    Audience defined
                  </li>
                  <li>
                    <span className={styles.reviewCheckIcon} aria-hidden>
                      ✓
                    </span>
                    Channel &amp; content set
                  </li>
                </ul>
                {onReviewLaunch ? (
                  <Button
                    type="button"
                    className={styles.reviewLaunchCta}
                    onClick={onReviewLaunch}
                    disabled={launchBusy}
                  >
                    <span className={styles.reviewLaunchCtaInner}>
                      <WizardRocketMini className={styles.reviewLaunchCtaRocket} aria-hidden />
                      {launchBusy ? 'Saving…' : 'Launch Campaign'}
                    </span>
                  </Button>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}
      </div>
      {emailPreviewOpen ? (
        <Modal
          isOpen
          onClose={() => setEmailPreviewOpen(false)}
          title="Email Preview"
          size="xxl"
          footer={
            <ModalFooter>
              <Button variant="secondary" onClick={() => setEmailPreviewOpen(false)}>
                Close
              </Button>
            </ModalFooter>
          }
        >
          <div className={styles.emailPreviewFrame}>
            <iframe
              ref={emailPreviewRef}
              title="Email preview"
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;}</style></head><body>${emailPreviewHtml}</body></html>`}
              className={styles.emailPreviewIframe}
              sandbox="allow-same-origin"
            />
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export { STEPS };
