import React, { useMemo, useCallback } from 'react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { DateTimePickerField } from '../../components/ui/DateTimePickerField';
import { CampaignFilterBuilder } from './CampaignFilterBuilder';
import { defaultRule } from './campaignFilterConfig';
import { ScriptBodyEditor } from '../callScripts/ScriptBodyEditor';
import { CampaignWizardSectionHeader, WizardDecorIcons } from './campaignWizardDecor';
import { AudienceSourceIcon, ChannelPickerGlyph, WizardLaunchRocketHero, WizardRocketMini } from './campaignWizardVisuals';
import styles from './CampaignsPage.module.scss';

const STEPS = [
  { id: 'info', label: 'Campaign Info', hint: 'Basic details and settings' },
  { id: 'audience', label: 'Audience', hint: 'Define your target audience' },
  { id: 'channel', label: 'Channel & Content', hint: 'Choose channel and content' },
  { id: 'review', label: 'Review & Launch', hint: 'Review and launch campaign' },
];

const CHANNEL_CARDS = [
  { value: 'phone', label: 'Phone Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
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

const DIALER_SELECT_OPTIONS = [
  { value: 'active', label: 'Active', dialerKey: 'active' },
  { value: 'paused', label: 'Paused', dialerKey: 'paused' },
];

const SCHEDULE_SELECT_OPTIONS = [
  { value: 'immediate', label: 'Start immediately', scheduleKey: 'immediate' },
  { value: 'scheduled', label: 'Scheduled start', scheduleKey: 'scheduled' },
];

function DialerGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12.86.3 1.71.6 2.54a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.83.3 1.68.48 2.54.6A2 2 0 0122 16.92z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
}) {
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

  const audienceEstimateRecencyLabel = useMemo(() => {
    if (!form.audience_estimate_at) return null;
    const t = new Date(form.audience_estimate_at).getTime();
    if (!Number.isFinite(t)) return null;
    const diff = Date.now() - t;
    if (diff >= 0 && diff < 120_000) return 'Just now';
    return formatDateTime ? formatDateTime(form.audience_estimate_at) : String(form.audience_estimate_at);
  }, [form.audience_estimate_at, formatDateTime]);

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
      : stripHtml(form.content_html)
        ? 'Custom script'
        : '—';

  const pageLead = PAGE_LEADS[step] || null;
  const startDateLabel =
    form.start_date && formatDate
      ? formatDate(form.start_date)
      : form.start_date && formatDateTime
        ? formatDateTime(form.start_date)
        : '—';

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

  const formatDialerOptionLabel = useCallback((option) => {
    if (!option) return null;
    const active = option.dialerKey === 'active';
    return (
      <span className={styles.selectPillRow}>
        <span className={active ? styles.selectDialerIconActive : styles.selectDialerIconMuted}>
          <DialerGlyph />
        </span>
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
                    onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                    placeholder="e.g. Summer offer campaign"
                    inputClassName={styles.wizardInfoControl}
                  />
                  <Select
                    label="Campaign type"
                    required
                    value={form.campaign_type_master_id}
                    onChange={(e) => setForm((s) => ({ ...s, campaign_type_master_id: e.target.value }))}
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
                <div className={`${styles.wizardGrid3} ${styles.wizardInfoGrid}`.trim()}>
                  <Select
                    label="Campaign status"
                    required
                    value={form.campaign_status_master_id}
                    onChange={(e) => setForm((s) => ({ ...s, campaign_status_master_id: e.target.value }))}
                    placeholder="Select status"
                    options={campaignStatusRichOptions}
                    formatOptionLabel={formatStatusOptionLabel}
                    selectClassName={styles.wizardInfoSelect}
                  />
                  <Select
                    label="Dialer availability"
                    value={form.status}
                    onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                    options={DIALER_SELECT_OPTIONS}
                    formatOptionLabel={formatDialerOptionLabel}
                    selectClassName={styles.wizardInfoSelect}
                  />
                  <Select
                    label="Schedule"
                    value={form.schedule_mode}
                    onChange={(e) => setForm((s) => ({ ...s, schedule_mode: e.target.value }))}
                    options={SCHEDULE_SELECT_OPTIONS}
                    formatOptionLabel={formatScheduleOptionLabel}
                    selectClassName={styles.wizardInfoSelect}
                  />
                </div>
                <div className={`${styles.wizardInfoDatesRow} ${styles.wizardInfoGrid}`.trim()}>
                  <DateTimePickerField
                    mode="date"
                    label="Start date"
                    required={form.schedule_mode === 'scheduled'}
                    value={form.start_date || ''}
                    onChange={(v) => setForm((s) => ({ ...s, start_date: v || '' }))}
                    placeholder="Select date"
                    inputClassName={styles.wizardInfoDateTrigger}
                  />
                  <DateTimePickerField
                    mode="date"
                    label="End date (optional)"
                    value={form.end_date || ''}
                    onChange={(v) => setForm((s) => ({ ...s, end_date: v || '' }))}
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
                <p className={styles.wizardMuted}>Audience type cannot change after creation.</p>
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
                <p className={styles.wizardMuted}>
                  For static campaigns, assign contacts (or import with a campaign column) so they reference this campaign.
                  Filter rules are not used.
                </p>
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
                {CHANNEL_CARDS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`${styles.channelCard} ${styles[`channelPick_${c.value}`]} ${form.channel === c.value ? styles.channelCardActive : ''}`.trim()}
                    onClick={() => setForm((s) => ({ ...s, channel: c.value }))}
                  >
                    <span className={styles.channelCardIconWrap}>
                      <ChannelPickerGlyph channel={c.value} />
                    </span>
                    <span className={styles.channelCardText}>
                      <span className={styles.channelCardLabel}>{c.label}</span>
                      <span className={styles.channelCardHint}>{CHANNEL_HINTS[c.value]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {form.channel === 'phone' ? (
              <section className={`${styles.wizardSection} ${styles.wizardCallSettingsSection}`.trim()}>
                <CampaignWizardSectionHeader title="Call settings" />
                <div className={styles.wizardCallSettingsGrid}>
                  <Input
                    label="Caller ID"
                    value={form.caller_id_label || ''}
                    onChange={(e) => setForm((s) => ({ ...s, caller_id_label: e.target.value }))}
                    placeholder="e.g. +91 98765 43210"
                  />
                  <Select
                    label="Call script (optional)"
                    allowEmpty
                    compact
                    value={form.call_script_id || ''}
                    onChange={(e) => setForm((s) => ({ ...s, call_script_id: e.target.value }))}
                    placeholder="Select script"
                    options={[{ value: '', label: '— None —' }, ...scriptSelectOptions]}
                    wrapperClassName={styles.wizardCallScriptSelect}
                  />
                  <div className={styles.wizardCallSettingsTimeout}>
                    <Input
                      label="Timeout (seconds)"
                      type="number"
                      min={5}
                      max={600}
                      value={form.timeout_seconds ?? 30}
                      onChange={(e) => setForm((s) => ({ ...s, timeout_seconds: e.target.value }))}
                    />
                    <p className={styles.wizardFieldHint}>Time to wait for answer</p>
                  </div>
                </div>
              </section>
            ) : (
              <p className={styles.wizardMuted}>
                {form.channel === 'email'
                  ? 'Email sending uses the Email module; this selection is saved for reporting and future automation.'
                  : 'Channel-specific actions will use integrations configured for your tenant.'}
              </p>
            )}

            <section className={styles.wizardSection}>
              <CampaignWizardSectionHeader title="Content / Script" />
              <div className={styles.wizardQuill}>
                <ScriptBodyEditor
                  value={form.content_html || ''}
                  onChange={(html) => setForm((s) => ({ ...s, content_html: html }))}
                  placeholder="Hello {{contact.first_name}}, …"
                  compact
                  scrollableLayout
                  denseScrollLayout
                />
              </div>
            </section>
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
                    <span>Caller ID</span> <strong>{form.caller_id_label || '—'}</strong>
                  </li>
                  <li>
                    <span>Script</span> <strong>{scriptSummary}</strong>
                  </li>
                  <li>
                    <span>Timeout</span> <strong>{form.timeout_seconds ?? 30} seconds</strong>
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
    </div>
  );
}

export { STEPS };
