import React, { useMemo } from 'react';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { DateTimePickerField } from '../../components/ui/DateTimePickerField';
import { CampaignFilterBuilder } from './CampaignFilterBuilder';
import { defaultRule } from './campaignFilterConfig';
import { ScriptBodyEditor } from '../callScripts/ScriptBodyEditor';
import { CampaignWizardSectionHeader, WizardDecorIcons } from './campaignWizardDecor';
import { WizardStepperGlyph, ChannelPickerGlyph } from './campaignWizardVisuals';
import styles from './CampaignsPage.module.scss';

const STEPS = [
  { id: 'info', label: 'Campaign Info', hint: 'Basic details and settings' },
  { id: 'audience', label: 'Audience', hint: 'Define your target audience' },
  { id: 'channel', label: 'Channel & Content', hint: 'Choose channel and content' },
  { id: 'review', label: 'Review & Launch', hint: 'Review and go live' },
];

const CHANNEL_CARDS = [
  { value: 'phone', label: 'Phone Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
];

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

  const contentPreview = useMemo(() => {
    const t = stripHtml(form.content_html);
    return t.length > 220 ? `${t.slice(0, 220)}…` : t;
  }, [form.content_html]);

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

  return (
    <div className={styles.wizardShell}>
      <nav className={styles.wizardStepper} aria-label="Campaign steps">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`${styles.wizardStep} ${i === step ? styles.wizardStepActive : ''} ${i < step ? styles.wizardStepDone : ''}`.trim()}
            aria-current={i === step ? 'step' : undefined}
          >
            <div className={`${styles.wizardStepGlyph} ${styles[`wizardStepGlyph_${s.id}`]}`.trim()}>
              <WizardStepperGlyph id={s.id} />
            </div>
            <div className={styles.wizardStepCopy}>
              <span className={styles.wizardStepTitle}>{s.label}</span>
              <span className={styles.wizardStepDesc}>{s.hint}</span>
            </div>
          </div>
        ))}
      </nav>

      <div className={styles.wizardBody}>
        {step === 0 ? (
          <>
            <section className={styles.wizardSection}>
              <CampaignWizardSectionHeader
                tone="indigo"
                icon={WizardDecorIcons.basic}
                title="Basic information"
                hint="Provide basic details to identify and organize your campaign."
              />
              <div className={styles.wizardGrid2}>
                <Input
                  label="Campaign name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Summer offer campaign"
                />
                <Select
                  label="Campaign type"
                  required
                  value={form.campaign_type_master_id}
                  onChange={(e) => setForm((s) => ({ ...s, campaign_type_master_id: e.target.value }))}
                  placeholder="Select campaign type"
                  options={campaignTypeSelectOptions.filter((o) => o.value !== '')}
                />
                <Select
                  label="Pipeline"
                  allowEmpty
                  value={form.pipeline_id || ''}
                  onChange={(e) => setForm((s) => ({ ...s, pipeline_id: e.target.value }))}
                  placeholder="Select pipeline"
                  options={pipelineOptions}
                />
                <Select
                  label="Campaign owner"
                  allowEmpty
                  value={form.manager_id || ''}
                  onChange={(e) => setForm((s) => ({ ...s, manager_id: e.target.value }))}
                  placeholder="Visible to all managers"
                  options={[{ value: '', label: '— All managers —' }, ...managerOptions]}
                />
              </div>
              <div className={styles.wizardFieldFull}>
                <label className={styles.wizardTextareaLabel} htmlFor="campaign-desc">
                  Description <span className={styles.optional}>(optional)</span>
                </label>
                <textarea
                  id="campaign-desc"
                  className={styles.wizardTextarea}
                  value={form.description}
                  maxLength={500}
                  onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                  placeholder="Add internal notes about this campaign…"
                  rows={4}
                />
                <div className={styles.wizardCharCount}>
                  {descLen} / 500
                </div>
              </div>
            </section>

            <section className={styles.wizardSection}>
              <CampaignWizardSectionHeader
                tone="teal"
                icon={WizardDecorIcons.settings}
                title="Campaign settings"
                hint="CRM lifecycle, dialer availability, and schedule preferences."
              />
              <div className={styles.wizardGrid2}>
                <Select
                  label="Campaign status (CRM)"
                  required
                  value={form.campaign_status_master_id}
                  onChange={(e) => setForm((s) => ({ ...s, campaign_status_master_id: e.target.value }))}
                  placeholder="Select status"
                  options={campaignStatusSelectOptions.filter((o) => o.value !== '')}
                />
                <Select
                  label="Dialer availability"
                  value={form.status}
                  onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'paused', label: 'Paused' },
                  ]}
                />
                <Select
                  label="Schedule"
                  value={form.schedule_mode}
                  onChange={(e) => setForm((s) => ({ ...s, schedule_mode: e.target.value }))}
                  options={[
                    { value: 'immediate', label: 'Start immediately' },
                    { value: 'scheduled', label: 'Scheduled start' },
                  ]}
                />
                <Select
                  label="Time zone"
                  value={form.timezone || ''}
                  onChange={(e) => setForm((s) => ({ ...s, timezone: e.target.value }))}
                  options={timezoneOptions}
                />
                <DateTimePickerField
                  mode="date"
                  label="Start date"
                  required={form.schedule_mode === 'scheduled'}
                  value={form.start_date || ''}
                  onChange={(v) => setForm((s) => ({ ...s, start_date: v || '' }))}
                  disabled={form.schedule_mode !== 'scheduled'}
                  placeholder={form.schedule_mode === 'scheduled' ? 'Select date' : '—'}
                />
                <DateTimePickerField
                  mode="date"
                  label="End date (optional)"
                  value={form.end_date || ''}
                  onChange={(v) => setForm((s) => ({ ...s, end_date: v || '' }))}
                  placeholder="Select date"
                />
              </div>
            </section>

            <div className={styles.wizardTip}>
              <span className={styles.wizardTipIcon} aria-hidden>💡</span>
              <span>
                You can define your target audience and channel content in the next steps. Owning manager limits who can
                manage this campaign in the tenant.
              </span>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <section className={styles.wizardSection}>
              <CampaignWizardSectionHeader
                tone="violet"
                icon={WizardDecorIcons.audience}
                title="Audience"
                hint="Choose how membership is determined for this campaign."
              />
              <div className={styles.audienceTabs} role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={audienceTab === 'filter'}
                  className={`${styles.audienceTab} ${audienceTab === 'filter' ? styles.audienceTabActive : ''}`.trim()}
                  onClick={() => setAudienceTab('filter')}
                >
                  <strong>Filter (dynamic rules)</strong>
                  <span>Use rules to build a dynamic audience.</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={audienceTab === 'static'}
                  className={`${styles.audienceTab} ${audienceTab === 'static' ? styles.audienceTabActive : ''}`.trim()}
                  onClick={() => setAudienceTab('static')}
                  disabled={!!editing}
                >
                  <strong>Static list</strong>
                  <span>Membership comes from contacts assigned to this campaign.</span>
                </button>
                <button type="button" className={`${styles.audienceTab} ${styles.audienceTabDisabled}`} disabled>
                  <strong>Import</strong>
                  <span>Coming soon</span>
                </button>
              </div>
              {editing ? (
                <p className={styles.wizardMuted}>Audience type cannot change after creation.</p>
              ) : null}
            </section>

            {form.type === 'filter' ? (
              <section className={styles.wizardSection}>
                <CampaignWizardSectionHeader
                  tone="orange"
                  icon={WizardDecorIcons.rules}
                  title="Define audience rules"
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
                <div>
                  <div className={styles.audienceEstimateLabel}>Estimated audience size</div>
                  <div className={styles.audienceEstimateValue}>
                    {estimatedTotal != null ? `${estimatedTotal.toLocaleString()} contacts` : 'Not calculated yet'}
                  </div>
                  {form.audience_estimate_at ? (
                    <div className={styles.wizardMuted}>
                      Last calculated: {formatDateTime ? formatDateTime(form.audience_estimate_at) : form.audience_estimate_at}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onRecalculateAudience}
                  disabled={audienceEstimateLoading}
                >
                  {audienceEstimateLoading ? 'Calculating…' : 'Recalculate'}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        {step === 2 ? (
          <>
            <section className={styles.wizardSection}>
              <CampaignWizardSectionHeader
                tone="pink"
                icon={WizardDecorIcons.channel}
                title="Select channel"
                hint="Pick the primary outreach channel for this campaign."
              />
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
                    <span className={styles.channelCardLabel}>{c.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {form.channel === 'phone' ? (
              <section className={styles.wizardSection}>
                <CampaignWizardSectionHeader
                  tone="emerald"
                  icon={WizardDecorIcons.call}
                  title="Call settings"
                />
                <div className={styles.wizardGrid2}>
                  <Input
                    label="Caller ID (label)"
                    value={form.caller_id_label || ''}
                    onChange={(e) => setForm((s) => ({ ...s, caller_id_label: e.target.value }))}
                    placeholder="e.g. +91 98765 43210"
                  />
                  <Select
                    label="Call script (optional)"
                    allowEmpty
                    value={form.call_script_id || ''}
                    onChange={(e) => setForm((s) => ({ ...s, call_script_id: e.target.value }))}
                    placeholder="Select script"
                    options={[{ value: '', label: '— None —' }, ...scriptSelectOptions]}
                  />
                  <Input
                    label="Timeout (seconds)"
                    type="number"
                    min={5}
                    max={600}
                    value={form.timeout_seconds ?? 30}
                    onChange={(e) => setForm((s) => ({ ...s, timeout_seconds: e.target.value }))}
                  />
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
              <CampaignWizardSectionHeader
                tone="blue"
                icon={WizardDecorIcons.article}
                title="Content / script"
                hint="Optional talking points or message body (merge tags supported)."
              />
              <div className={styles.wizardQuill}>
                <ScriptBodyEditor
                  value={form.content_html || ''}
                  onChange={(html) => setForm((s) => ({ ...s, content_html: html }))}
                  placeholder="Hello {{contact.first_name}}, …"
                  compact
                  scrollableLayout
                />
              </div>
            </section>
          </>
        ) : null}

        {step === 3 ? (
          <div className={styles.reviewLayout}>
            <div className={styles.reviewColumns}>
              <div className={styles.reviewCard}>
                <h4>Campaign summary</h4>
                <ul className={styles.reviewList}>
                  <li>
                    <span>Name</span> <strong>{form.name || '—'}</strong>
                  </li>
                  <li>
                    <span>Type</span> <strong>{campaignTypeLabel}</strong>
                  </li>
                  <li>
                    <span>Pipeline</span> <strong>{pipelineLabel}</strong>
                  </li>
                  <li>
                    <span>Owner</span> <strong>{ownerLabel}</strong>
                  </li>
                  <li>
                    <span>CRM status</span> <strong>{campaignStatusLabel}</strong>
                  </li>
                  <li>
                    <span>Dialer</span> <strong>{form.status === 'paused' ? 'Paused' : 'Active'}</strong>
                  </li>
                  <li>
                    <span>Schedule</span>{' '}
                    <strong>{form.schedule_mode === 'scheduled' ? 'Scheduled' : 'Start immediately'}</strong>
                  </li>
                </ul>
              </div>
              <div className={styles.reviewCard}>
                <h4>Audience summary</h4>
                <ul className={styles.reviewList}>
                  <li>
                    <span>Source</span>{' '}
                    <strong>{form.type === 'filter' ? 'Dynamic filter' : 'Static membership'}</strong>
                  </li>
                  <li>
                    <span>Rules</span>{' '}
                    <strong>
                      {form.type === 'filter' ? `${(form.filterRules || []).length} rule(s)` : 'N/A (static)'}
                    </strong>
                  </li>
                  <li>
                    <span>Estimated size</span>{' '}
                    <strong>
                      {form.type === 'filter' && estimatedTotal != null
                        ? `${estimatedTotal.toLocaleString()} contacts`
                        : '—'}
                    </strong>
                  </li>
                </ul>
              </div>
              <div className={styles.reviewCard}>
                <h4>Channel &amp; content</h4>
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
                    <span>Script</span>{' '}
                    <strong>
                      {form.call_script_id
                        ? scriptSelectOptions.find((o) => o.value === String(form.call_script_id))?.label || '—'
                        : '—'}
                    </strong>
                  </li>
                  <li>
                    <span>Timeout</span> <strong>{form.timeout_seconds ?? 30}s</strong>
                  </li>
                  <li>
                    <span>Content preview</span> <strong>{contentPreview || '—'}</strong>
                  </li>
                </ul>
              </div>
            </div>
            <aside className={styles.reviewAside}>
              <div className={styles.reviewLaunchCard}>
                <div className={styles.reviewRocket} aria-hidden>
                  🚀
                </div>
                <h4>Ready to launch?</h4>
                <ul className={styles.reviewChecklist}>
                  <li>✓ Campaign info</li>
                  <li>✓ Audience defined</li>
                  <li>✓ Channel &amp; content</li>
                </ul>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { STEPS };
