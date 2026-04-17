import React from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { MultiSelectDropdown } from '../../components/ui/MultiSelectDropdown';
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_NATIONAL_MAX_DIGITS,
  getCallingCodeOptionsForSelect,
  normalizeCallingCode,
  clampNationalDigits,
} from '../../utils/phoneInput';
import { CONTACT_FORM_SECTION_IDS } from './contactFormLayout';

const PHONE_LABEL_OPTIONS = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

function normalizeOptions(options_json) {
  if (!options_json) return [];
  if (Array.isArray(options_json)) return options_json.map((x) => String(x));
  if (typeof options_json === 'string') {
    const trimmed = options_json.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      /* legacy */
    }
    return trimmed
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof options_json === 'object' && Array.isArray(options_json.values)) {
    return options_json.values.map((x) => String(x));
  }
  return [];
}

function parseMultiselectStored(raw) {
  if (raw == null || raw === '') return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.map((x) => String(x));
  } catch {
    /* ignore */
  }
  return String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isRequiredFlag(v) {
  return v === 1 || v === true || v === '1';
}

function requiredLabelText(label, required) {
  const base = label || '';
  return required ? `${base} *` : base;
}

function formatRecordDate(iso) {
  if (iso == null || iso === '') return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function RecordViewField({ label, children, className = '', styles: st }) {
  const showDash = children == null || children === '';
  return (
    <div className={`${st.viewField} ${className}`.trim()}>
      <div className={st.viewLabel}>{label}</div>
      <div className={st.viewValue}>{showDash ? '—' : children}</div>
    </div>
  );
}

/**
 * Returns () => ReactNode for each CONTACT_FORM_SECTION_IDS used on the edit/create form.
 */
export function createContactFormEditSectionRenderers(ctx) {
  const {
    styles,
    isNew,
    contact,
    type,
    role,
    isLeadRoute,
    showFormHints,
    isEditing,
    formData,
    setFormData,
    setDisplayNameTouched,
    formErrors,
    contactStatusesLoading,
    contactStatuses,
    availableLabelOptions,
    contactTagOptions,
    managerSelectOptions,
    agentSelectOptions,
    campaignSelectOptions,
    loadingIndustryFields,
    industryFieldDefs,
    loadingCustomFields,
    customFields,
    clearDynamicFieldError,
    setConvertTypeOpen,
    canConvertRecordType,
  } = ctx;

  return {
    [CONTACT_FORM_SECTION_IDS.RECORD]: () =>
      !isNew && contact ? (
        <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-record">
          <h2 id="contact-section-record" className={styles.sectionTitle}>
            Record
          </h2>
          <div className={styles.recordMetaGrid}>
            <RecordViewField styles={styles} label="Created">
              {formatRecordDate(contact.created_at)}
            </RecordViewField>
            <RecordViewField styles={styles} label="Last updated">
              {formatRecordDate(contact.updated_at)}
            </RecordViewField>
          </div>
          {isEditing && canConvertRecordType ? (
            <div className={styles.convertTypeRow}>
              <Button type="button" variant="secondary" size="sm" onClick={() => setConvertTypeOpen(true)}>
                {type === 'lead' ? 'Convert to contact' : 'Convert to lead'}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null,

    [CONTACT_FORM_SECTION_IDS.IDENTITY]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-identity">
        <h2 id="contact-section-identity" className={styles.sectionTitle}>
          {isLeadRoute ? 'Lead details' : 'Contact details'}
        </h2>
        {showFormHints ? (
          <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
            Display name required; first name or email required. Display name follows first + last until you edit it.
          </p>
        ) : null}
        <div className={styles.fieldGridDense}>
          <Input
            label="First name"
            value={formData.first_name}
            onChange={(e) => setFormData((p) => ({ ...p, first_name: e.target.value }))}
            error={formErrors.first_name}
          />
          <Input
            label="Last name"
            value={formData.last_name}
            onChange={(e) => setFormData((p) => ({ ...p, last_name: e.target.value }))}
          />
          <Input
            required
            label="Display name"
            value={formData.display_name}
            onChange={(e) => {
              setDisplayNameTouched(true);
              setFormData((p) => ({ ...p, display_name: e.target.value }));
            }}
            error={formErrors.display_name}
          />
          <Input
            label="Email"
            value={formData.email}
            onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
            type="email"
            autoComplete="email"
          />
          <Input
            label="Company"
            value={formData.company}
            onChange={(e) => setFormData((p) => ({ ...p, company: e.target.value }))}
          />
          <Input
            label="Job title"
            value={formData.job_title}
            onChange={(e) => setFormData((p) => ({ ...p, job_title: e.target.value }))}
          />
          <Input
            label="Industry"
            value={formData.industry}
            onChange={(e) => setFormData((p) => ({ ...p, industry: e.target.value }))}
          />
          <Input
            label="Website"
            value={formData.website}
            onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
            type="url"
            placeholder="https://"
          />
          <Input
            label="Date of birth"
            value={formData.date_of_birth}
            onChange={(e) => setFormData((p) => ({ ...p, date_of_birth: e.target.value }))}
            type="date"
          />
          <Input
            label="GST / PAN / Tax ID"
            value={formData.tax_id}
            onChange={(e) => setFormData((p) => ({ ...p, tax_id: e.target.value }))}
          />
        </div>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.LOCATION]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-location">
        <h2 id="contact-section-location" className={styles.sectionTitle}>
          Location
        </h2>
        {showFormHints ? (
          <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
            Street, city, and country used in lists and export.
          </p>
        ) : null}
        <div className={styles.fieldGridDense}>
          <Input
            label="Address line 1"
            value={formData.address}
            onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
            className={styles.fullWidthFieldDense}
          />
          <Input
            label="Address line 2"
            value={formData.address_line_2}
            onChange={(e) => setFormData((p) => ({ ...p, address_line_2: e.target.value }))}
            className={styles.fullWidthFieldDense}
          />
          <Input label="City" value={formData.city} onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))} />
          <Input
            label="State / region"
            value={formData.state}
            onChange={(e) => setFormData((p) => ({ ...p, state: e.target.value }))}
          />
          <Input
            label="Country"
            value={formData.country}
            onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
            autoComplete="country-name"
          />
          <Input
            label="PIN / postal code"
            value={formData.pin_code}
            onChange={(e) => setFormData((p) => ({ ...p, pin_code: e.target.value }))}
          />
        </div>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.NOTES]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-notes">
        <h2 id="contact-section-notes" className={styles.sectionTitle}>
          Contact notes
        </h2>
        {showFormHints ? (
          <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
            Persistent notes on this record. Notes for a specific call are saved on the call attempt when you set a
            disposition.
          </p>
        ) : null}
        <textarea
          id="contact-notes-input"
          className={styles.notesTextarea}
          value={formData.notes ?? ''}
          onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
          placeholder="General notes about this lead or contact…"
          rows={5}
          disabled={!isEditing}
        />
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.STATUS]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-status">
        <h2 id="contact-section-status" className={styles.sectionTitle}>
          Status
        </h2>
        {showFormHints ? (
          <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
            Lifecycle stage from Admin → Masters → Contact statuses.
          </p>
        ) : null}
        <div className={styles.fieldGridDense}>
          <Select
            label="Contact status"
            value={formData.status_id || ''}
            onChange={(e) => setFormData((p) => ({ ...p, status_id: e.target.value }))}
            disabled={contactStatusesLoading}
            allowEmpty
            placeholder="— None —"
            options={contactStatuses.map((s) => ({
              value: s.id,
              label: s.name ? `${s.name}${s.code ? ` (${s.code})` : ''}` : s.code || '—',
            }))}
          />
        </div>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.PHONES]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-phones">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderText}>
            <h2 id="contact-section-phones" className={styles.sectionTitle}>
              Phone numbers
            </h2>
            {showFormHints ? (
              <p className={`${styles.sectionDesc} ${styles.sectionDescTight}`}>One label per row; one primary when possible.</p>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={availableLabelOptions.length === 0}
            onClick={() => {
              const nextLabel = availableLabelOptions[0]?.value || 'other';
              setFormData((prev) => ({
                ...prev,
                phones: [
                  ...(prev.phones || []),
                  { country_code: DEFAULT_PHONE_COUNTRY_CODE, number: '', label: nextLabel, is_primary: false },
                ],
              }));
            }}
          >
            + Add phone
          </Button>
        </div>

        <div className={styles.phoneList}>
          {(formData.phones || []).map((p, idx) => {
            const used = new Set(
              (formData.phones || []).map((x, i) => (i === idx ? null : (x.label || 'mobile').toLowerCase())).filter(Boolean)
            );
            const labelOptionsForRow = PHONE_LABEL_OPTIONS.filter((o) => !used.has(o.value) || o.value === (p.label || 'mobile'));
            return (
              <div key={idx} className={`${styles.phoneRow} ${styles.phoneRowCompact}`}>
                <div className={styles.phoneCc}>
                  <Select
                    label={idx === 0 ? 'Country code' : undefined}
                    value={normalizeCallingCode(p.country_code || DEFAULT_PHONE_COUNTRY_CODE)}
                    onChange={(e) => {
                      const next = [...formData.phones];
                      next[idx] = { ...next[idx], country_code: e.target.value };
                      setFormData((prev) => ({ ...prev, phones: next }));
                    }}
                    options={getCallingCodeOptionsForSelect(p.country_code || DEFAULT_PHONE_COUNTRY_CODE)}
                  />
                </div>
                <div className={styles.phoneNum}>
                  <Input
                    label={idx === 0 ? 'Number' : undefined}
                    value={p.number || ''}
                    onChange={(e) => {
                      const next = [...formData.phones];
                      next[idx] = { ...next[idx], number: clampNationalDigits(e.target.value) };
                      setFormData((prev) => ({ ...prev, phones: next }));
                    }}
                    placeholder="10-digit number"
                    inputMode="numeric"
                    maxLength={PHONE_NATIONAL_MAX_DIGITS}
                  />
                </div>
                <div className={styles.phoneLabel}>
                  <Select
                    label={idx === 0 ? 'Label' : undefined}
                    value={p.label || 'mobile'}
                    onChange={(e) => {
                      const next = [...formData.phones];
                      next[idx] = { ...next[idx], label: e.target.value };
                      setFormData((prev) => ({ ...prev, phones: next }));
                    }}
                    options={labelOptionsForRow}
                  />
                </div>
                <div className={styles.phoneTail}>
                  <label className={styles.primaryCheck}>
                    <input
                      type="checkbox"
                      checked={!!p.is_primary}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const next = [...formData.phones];
                        if (checked) {
                          next.forEach((row, i) => {
                            next[i] = { ...row, is_primary: i === idx };
                          });
                        } else {
                          next[idx] = { ...next[idx], is_primary: false };
                        }
                        setFormData((prev) => ({ ...prev, phones: next }));
                      }}
                    />
                    Primary
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={(formData.phones || []).length <= 1}
                    onClick={() => {
                      const next = (formData.phones || []).filter((_, i) => i !== idx);
                      if (next.length > 0 && !next.some((x) => x.is_primary)) {
                        next[0].is_primary = true;
                      }
                      setFormData((prev) => ({ ...prev, phones: next }));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.TAGS]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-tags">
        <h2 id="contact-section-tags" className={styles.sectionTitle}>
          Tags
        </h2>
        {showFormHints ? (
          <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>Tenant tag catalog (Settings → Contact tags).</p>
        ) : null}
        {(formData.tag_ids || []).length === 0 ? <p className={styles.tagEmptyHint}>No tags yet — add one below.</p> : null}
        <div className={styles.tagChips} role="list">
          {(formData.tag_ids || []).map((tid) => {
            const label = contactTagOptions.find((o) => o.value === String(tid))?.label || '—';
            return (
              <span key={tid} className={styles.tagChip} role="listitem">
                <span className={styles.tagChipLabel}>{label}</span>
                <button
                  type="button"
                  className={styles.tagRemove}
                  onClick={() =>
                    setFormData((p) => ({
                      ...p,
                      tag_ids: (p.tag_ids || []).filter((x) => String(x) !== String(tid)),
                    }))
                  }
                  aria-label={`Remove tag ${label}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
        <select
          className={styles.tagAddSelect}
          aria-label="Add tag"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            setFormData((p) => {
              const cur = p.tag_ids || [];
              if (cur.map(String).includes(v)) return p;
              return { ...p, tag_ids: [...cur, v] };
            });
            e.target.value = '';
          }}
        >
          <option value="">Add tag…</option>
          {contactTagOptions
            .filter((o) => !(formData.tag_ids || []).map(String).includes(o.value))
            .map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
        </select>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.ASSIGNMENT]: () => (
      <>
        {role === 'admin' && isNew ? (
          <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-ownership">
            <h2 id="contact-section-ownership" className={styles.sectionTitle}>
              Ownership (optional)
            </h2>
            {showFormHints ? (
              <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
                Optional manager, agent, and campaign; leave manager empty if this record has no manager yet.
              </p>
            ) : null}
            <div className={styles.assignGrid}>
              <Select
                label="Manager"
                value={formData.manager_id}
                onChange={(e) => setFormData((p) => ({ ...p, manager_id: e.target.value }))}
                placeholder="— None —"
                options={[{ value: '', label: '— None —' }, ...managerSelectOptions]}
              />
              <Select
                label="Assigned agent"
                value={formData.assigned_user_id}
                onChange={(e) => setFormData((p) => ({ ...p, assigned_user_id: e.target.value }))}
                placeholder="— None —"
                options={[{ value: '', label: '— None —' }, ...agentSelectOptions]}
              />
              <Select
                label="Campaign"
                value={formData.campaign_id}
                onChange={(e) => setFormData((p) => ({ ...p, campaign_id: e.target.value }))}
                placeholder="— None —"
                options={[{ value: '', label: '— None —' }, ...campaignSelectOptions]}
              />
            </div>
          </section>
        ) : null}
        {role === 'manager' && isNew ? (
          <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-new-manager-assign">
            <h2 id="contact-section-new-manager-assign" className={styles.sectionTitle}>
              Campaign &amp; assignment (optional)
            </h2>
            {showFormHints ? (
              <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
                Defaults to you as manager; optional team agent and campaign.
              </p>
            ) : null}
            <div className={styles.assignGrid}>
              <Select
                label="Assigned agent"
                value={formData.assigned_user_id}
                onChange={(e) => setFormData((p) => ({ ...p, assigned_user_id: e.target.value }))}
                placeholder="— Myself (default) —"
                options={[{ value: '', label: '— Myself (default) —' }, ...agentSelectOptions]}
              />
              <Select
                label="Campaign"
                value={formData.campaign_id}
                onChange={(e) => setFormData((p) => ({ ...p, campaign_id: e.target.value }))}
                placeholder="— None —"
                options={[{ value: '', label: '— None —' }, ...campaignSelectOptions]}
              />
            </div>
          </section>
        ) : null}
        {role === 'agent' && isNew && type === 'lead' ? (
          <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-new-agent-campaign">
            <h2 id="contact-section-new-agent-campaign" className={styles.sectionTitle}>
              Campaign (optional)
            </h2>
            {showFormHints ? (
              <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>Optional campaign; you stay assigned.</p>
            ) : null}
            <div className={styles.assignGrid}>
              <Select
                label="Campaign"
                value={formData.campaign_id}
                onChange={(e) => setFormData((p) => ({ ...p, campaign_id: e.target.value }))}
                placeholder="— None —"
                options={[{ value: '', label: '— None —' }, ...campaignSelectOptions]}
              />
            </div>
          </section>
        ) : null}
        {!isNew && (role === 'admin' || role === 'manager') ? (
          <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-assign">
            <h2 id="contact-section-assign" className={styles.sectionTitle}>
              Assignment
            </h2>
            {showFormHints ? (
              <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
                {role === 'manager' ? 'Team agent and campaign.' : 'Manager, agent, and campaign.'}
              </p>
            ) : null}
            <div className={styles.assignGrid}>
              {role === 'admin' ? (
                <Select
                  label="Manager"
                  value={formData.manager_id}
                  onChange={(e) => setFormData((p) => ({ ...p, manager_id: e.target.value }))}
                  placeholder="— No manager —"
                  options={[{ value: '', label: '— No manager —' }, ...managerSelectOptions]}
                />
              ) : null}
              <Select
                label="Assigned agent"
                value={formData.assigned_user_id}
                onChange={(e) => setFormData((p) => ({ ...p, assigned_user_id: e.target.value }))}
                placeholder="— No agent —"
                options={[{ value: '', label: '— No agent —' }, ...agentSelectOptions]}
              />
              <Select
                label="Campaign"
                value={formData.campaign_id}
                onChange={(e) => setFormData((p) => ({ ...p, campaign_id: e.target.value }))}
                placeholder="— None —"
                options={[{ value: '', label: '— None —' }, ...campaignSelectOptions]}
              />
            </div>
          </section>
        ) : null}
      </>
    ),

    [CONTACT_FORM_SECTION_IDS.INDUSTRY]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-industry">
        <h2 id="contact-section-industry" className={styles.sectionTitle}>
          Industry fields
          {loadingIndustryFields ? <span className={styles.loadingInline}>Loading…</span> : null}
        </h2>
        {showFormHints ? (
          <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
            Defined by your platform admin for your industry. Enable optional packs under Company settings. Fields marked *
            are required before save.
          </p>
        ) : null}
        {!loadingIndustryFields && industryFieldDefs.length === 0 ? (
          <p className={styles.customEmpty}>No industry fields for this workspace.</p>
        ) : null}

        <div className={styles.customFieldsGridDense}>
          {industryFieldDefs.map((f) => {
            const value = formData?.industryValuesMap?.[f.field_key] ?? '';
            const options = normalizeOptions(f.options_json);
            const req = isRequiredFlag(f.is_required);
            const lbl = requiredLabelText(f.label, req);
            const indFieldErr = formErrors[`industry:${f.field_key}`];
            const setIndustryMap = (key, nextVal) => {
              clearDynamicFieldError('industry', key);
              const nextMap = { ...(formData.industryValuesMap || {}) };
              nextMap[key] = nextVal;
              setFormData((prev) => ({ ...prev, industryValuesMap: nextMap }));
            };

            if (f.type === 'select') {
              return (
                <Select
                  key={f.field_key}
                  label={lbl}
                  value={value || ''}
                  onChange={(e) => setIndustryMap(f.field_key, e.target.value)}
                  options={options.map((opt) => ({ value: String(opt), label: String(opt) }))}
                  placeholder={req ? 'Select…' : 'Select...'}
                  error={indFieldErr}
                />
              );
            }

            if (f.type === 'multiselect') {
              const selected = new Set(parseMultiselectStored(value).map(String));
              const setMultiselect = (nextSet) => {
                const ordered = options.map(String).filter((o) => nextSet.has(o));
                setIndustryMap(f.field_key, ordered.length ? JSON.stringify(ordered) : '');
              };
              return (
                <div key={f.field_key} className={styles.customFieldFull}>
                  <div className={styles.customMultiselectLabel}>{lbl}</div>
                  {indFieldErr ? (
                    <p className={styles.fieldErrorText} role="alert">
                      {indFieldErr}
                    </p>
                  ) : null}
                  {options.length === 0 ? (
                    <p className={styles.customMultiselectEmpty}>No options configured for this field.</p>
                  ) : (
                    <div className={styles.customMultiselectGroup} role="group" aria-label={f.label}>
                      {options.map((opt, optIdx) => {
                        const optStr = String(opt);
                        const cid = `ind-ms-${f.field_key}-${optIdx}`;
                        return (
                          <Checkbox
                            key={cid}
                            id={cid}
                            label={optStr}
                            checked={selected.has(optStr)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(optStr);
                              else next.delete(optStr);
                              setMultiselect(next);
                            }}
                            className={styles.customMultiselectCheck}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            if (f.type === 'multiselect_dropdown') {
              return (
                <div key={f.field_key} className={styles.customFieldFull}>
                  <MultiSelectDropdown
                    label={lbl}
                    options={options}
                    value={value}
                    placeholder="Select…"
                    searchable={options.length > 12}
                    onChange={(next) => setIndustryMap(f.field_key, next)}
                    error={indFieldErr}
                  />
                </div>
              );
            }

            if (f.type === 'boolean') {
              return (
                <div key={f.field_key} className={`${styles.customFieldFull} ${styles.customBooleanRow}`}>
                  <label className={`${styles.primaryCheck} ${styles.customBooleanRow}`}>
                    <input
                      type="checkbox"
                      checked={String(value).toLowerCase() === 'true' || value === '1'}
                      onChange={(e) => setIndustryMap(f.field_key, e.target.checked ? 'true' : 'false')}
                    />
                    <span className={styles.booleanLabel}>{lbl}</span>
                  </label>
                  {indFieldErr ? (
                    <p className={styles.fieldErrorText} role="alert">
                      {indFieldErr}
                    </p>
                  ) : null}
                </div>
              );
            }

            return (
              <Input
                key={f.field_key}
                label={lbl}
                value={value}
                onChange={(e) => setIndustryMap(f.field_key, e.target.value)}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                placeholder={req ? 'Required' : 'Optional'}
                error={indFieldErr}
              />
            );
          })}
        </div>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.CUSTOM]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-custom">
        <h2 id="contact-section-custom" className={styles.sectionTitle}>
          Custom fields
          {loadingCustomFields ? <span className={styles.loadingInline}>Loading…</span> : null}
        </h2>
        {showFormHints ? (
          <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
            Tenant-defined. Optional fields can be left blank; fields marked * are required before save.
          </p>
        ) : null}
        {!loadingCustomFields && customFields.length === 0 ? (
          <p className={styles.customEmpty}>No custom fields configured for this tenant.</p>
        ) : null}

        <div className={styles.customFieldsGridDense}>
          {customFields.map((f) => {
            const value = formData?.customValuesMap?.[f.field_id] ?? '';
            const options = normalizeOptions(f.options_json);
            const req = isRequiredFlag(f.is_required);
            const lbl = requiredLabelText(f.label, req);
            const cfFieldErr = formErrors[`custom:${f.field_id}`];

            if (f.type === 'select') {
              return (
                <Select
                  key={f.field_id}
                  label={lbl}
                  value={value || ''}
                  onChange={(e) => {
                    clearDynamicFieldError('custom', f.field_id);
                    const nextMap = { ...(formData.customValuesMap || {}) };
                    nextMap[f.field_id] = e.target.value;
                    setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                  }}
                  options={options.map((opt) => ({ value: String(opt), label: String(opt) }))}
                  placeholder="Select..."
                  error={cfFieldErr}
                />
              );
            }

            if (f.type === 'multiselect') {
              const selected = new Set(parseMultiselectStored(value).map(String));
              const setMultiselect = (nextSet) => {
                clearDynamicFieldError('custom', f.field_id);
                const ordered = options.map(String).filter((o) => nextSet.has(o));
                const nextMap = { ...(formData.customValuesMap || {}) };
                nextMap[f.field_id] = ordered.length ? JSON.stringify(ordered) : '';
                setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
              };
              return (
                <div key={f.field_id} className={styles.customFieldFull}>
                  <div className={styles.customMultiselectLabel}>{lbl}</div>
                  {cfFieldErr ? (
                    <p className={styles.fieldErrorText} role="alert">
                      {cfFieldErr}
                    </p>
                  ) : null}
                  {options.length === 0 ? (
                    <p className={styles.customMultiselectEmpty}>
                      No options configured. Add comma-separated options under Settings → Custom fields.
                    </p>
                  ) : (
                    <div className={styles.customMultiselectGroup} role="group" aria-label={f.label}>
                      {options.map((opt, optIdx) => {
                        const optStr = String(opt);
                        const id = `cf-ms-${f.field_id}-${optIdx}`;
                        return (
                          <Checkbox
                            key={id}
                            id={id}
                            label={optStr}
                            checked={selected.has(optStr)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(optStr);
                              else next.delete(optStr);
                              setMultiselect(next);
                            }}
                            className={styles.customMultiselectCheck}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            if (f.type === 'multiselect_dropdown') {
              return (
                <div key={f.field_id} className={styles.customFieldFull}>
                  <MultiSelectDropdown
                    label={lbl}
                    options={options}
                    value={value}
                    placeholder="Select…"
                    searchable={options.length > 12}
                    onChange={(next) => {
                      clearDynamicFieldError('custom', f.field_id);
                      const nextMap = { ...(formData.customValuesMap || {}) };
                      nextMap[f.field_id] = next;
                      setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                    }}
                    error={cfFieldErr}
                  />
                </div>
              );
            }

            if (f.type === 'boolean') {
              return (
                <div key={f.field_id} className={`${styles.customFieldFull} ${styles.customBooleanRow}`}>
                  <label className={`${styles.primaryCheck} ${styles.customBooleanRow}`}>
                    <input
                      type="checkbox"
                      checked={String(value).toLowerCase() === 'true' || value === '1'}
                      onChange={(e) => {
                        clearDynamicFieldError('custom', f.field_id);
                        const nextMap = { ...(formData.customValuesMap || {}) };
                        nextMap[f.field_id] = e.target.checked ? 'true' : 'false';
                        setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                      }}
                    />
                    <span className={styles.booleanLabel}>{lbl}</span>
                  </label>
                  {cfFieldErr ? (
                    <p className={styles.fieldErrorText} role="alert">
                      {cfFieldErr}
                    </p>
                  ) : null}
                </div>
              );
            }

            return (
              <Input
                key={f.field_id}
                label={lbl}
                value={value}
                onChange={(e) => {
                  clearDynamicFieldError('custom', f.field_id);
                  const nextMap = { ...(formData.customValuesMap || {}) };
                  nextMap[f.field_id] = e.target.value;
                  setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                }}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                placeholder={req ? 'Required' : 'Optional'}
                error={cfFieldErr}
              />
            );
          })}
        </div>
      </section>
    ),
  };
}
