import React from 'react';
import { DEFAULT_PHONE_COUNTRY_CODE } from '../../utils/phoneInput';
import { CONTACT_FORM_SECTION_IDS } from './contactFormLayout';

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

function formatViewText(v) {
  if (v == null) return '—';
  const s = typeof v === 'string' ? v : String(v);
  return s.trim() ? s : '—';
}

/**
 * @param {object} ctx
 * @param {object} ctx.styles
 * @param {React.ComponentType} ctx.ViewField
 * @param {boolean} ctx.isNew
 * @param {object|null} ctx.contact
 * @param {boolean} ctx.isLeadRoute
 * @param {string} ctx.role
 * @param {object} ctx.formData
 * @param {React.ReactNode} ctx.statusDisplay
 * @param {(label: string) => string} ctx.phoneLabelText
 * @param {Array} ctx.contactTagOptions
 * @param {React.ReactNode} ctx.managerDisplay
 * @param {React.ReactNode} ctx.agentDisplay
 * @param {React.ReactNode} ctx.campaignDisplay
 * @param {boolean} ctx.loadingIndustryFields
 * @param {Array} ctx.industryFieldDefs
 * @param {(f: object) => string} ctx.formatIndustryFieldForView
 * @param {boolean} ctx.loadingCustomFields
 * @param {Array} ctx.customFields
 * @param {(f: object) => string} ctx.formatCustomFieldForView
 */
export function createContactFormViewSectionRenderers(ctx) {
  const {
    styles,
    ViewField,
    isNew,
    contact,
    isLeadRoute,
    role,
    formData,
    statusDisplay,
    phoneLabelText,
    contactTagOptions,
    managerDisplay,
    agentDisplay,
    campaignDisplay,
    loadingIndustryFields,
    industryFieldDefs,
    formatIndustryFieldForView,
    loadingCustomFields,
    customFields,
    formatCustomFieldForView,
  } = ctx;

  return {
    [CONTACT_FORM_SECTION_IDS.RECORD]: () =>
      !isNew && contact ? (
        <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-record">
          <h2 id="view-section-record" className={styles.sectionTitle}>
            Record
          </h2>
          <div className={styles.recordMetaGrid}>
            <ViewField label="Created">{formatRecordDate(contact.created_at)}</ViewField>
            <ViewField label="Last updated">{formatRecordDate(contact.updated_at)}</ViewField>
          </div>
        </section>
      ) : null,

    [CONTACT_FORM_SECTION_IDS.IDENTITY]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-identity">
        <h2 id="view-section-identity" className={styles.sectionTitle}>
          {isLeadRoute ? 'Lead details' : 'Contact details'}
        </h2>
        <div className={styles.fieldGridDense}>
          <ViewField label="First name">{formatViewText(formData.first_name)}</ViewField>
          <ViewField label="Last name">{formatViewText(formData.last_name)}</ViewField>
          <ViewField label="Display name">{formatViewText(formData.display_name)}</ViewField>
          <ViewField label="Email">{formatViewText(formData.email)}</ViewField>
          <ViewField label="Company">{formatViewText(formData.company)}</ViewField>
          <ViewField label="Job title">{formatViewText(formData.job_title)}</ViewField>
          <ViewField label="Industry">{formatViewText(formData.industry)}</ViewField>
          <ViewField label="Website">
            {formData.website?.trim() ? (
              <a
                href={
                  /^https?:\/\//i.test(formData.website.trim())
                    ? formData.website.trim()
                    : `https://${formData.website.trim()}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className={styles.viewLink}
              >
                {formData.website.trim()}
              </a>
            ) : (
              '—'
            )}
          </ViewField>
          <ViewField label="Date of birth">{formatViewText(formData.date_of_birth)}</ViewField>
          <ViewField label="GST / PAN / Tax ID">{formatViewText(formData.tax_id)}</ViewField>
        </div>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.LOCATION]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-location">
        <h2 id="view-section-location" className={styles.sectionTitle}>
          Location
        </h2>
        <div className={styles.fieldGridDense}>
          <ViewField label="Address line 1" className={styles.fullWidthFieldDense}>
            {formatViewText(formData.address)}
          </ViewField>
          <ViewField label="Address line 2" className={styles.fullWidthFieldDense}>
            {formatViewText(formData.address_line_2)}
          </ViewField>
          <ViewField label="City">{formatViewText(formData.city)}</ViewField>
          <ViewField label="State / region">{formatViewText(formData.state)}</ViewField>
          <ViewField label="Country">{formatViewText(formData.country)}</ViewField>
          <ViewField label="PIN / postal code">{formatViewText(formData.pin_code)}</ViewField>
        </div>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.NOTES]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-notes">
        <h2 id="view-section-notes" className={styles.sectionTitle}>
          Contact notes
        </h2>
        <ViewField label="Notes" className={styles.fullWidthFieldDense}>
          {formData.notes != null && String(formData.notes).trim() ? (
            <span className={styles.viewNotesMultiline}>{formData.notes}</span>
          ) : (
            '—'
          )}
        </ViewField>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.STATUS]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-status">
        <h2 id="view-section-status" className={styles.sectionTitle}>
          Status
        </h2>
        <div className={styles.fieldGridDense}>
          <ViewField label="Contact status">{statusDisplay}</ViewField>
        </div>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.PHONES]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-phones">
        <h2 id="view-section-phones" className={styles.sectionTitle}>
          Phone numbers
        </h2>
        <ul className={styles.viewPhoneList}>
          {(formData.phones || []).map((p, idx) => {
            const num = String(p.number || '').trim();
            const line = num
              ? `${p.country_code || DEFAULT_PHONE_COUNTRY_CODE} ${num} · ${phoneLabelText(p.label)}${p.is_primary ? ' · Primary' : ''}`
              : `${p.country_code || DEFAULT_PHONE_COUNTRY_CODE} (no number) · ${phoneLabelText(p.label)}`;
            return (
              <li key={idx} className={styles.viewPhoneItem}>
                {line}
              </li>
            );
          })}
        </ul>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.TAGS]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-tags">
        <h2 id="view-section-tags" className={styles.sectionTitle}>
          Tags
        </h2>
        {(formData.tag_ids || []).length === 0 ? (
          <p className={styles.tagEmptyHint}>—</p>
        ) : (
          <div className={styles.tagChips} role="list">
            {(formData.tag_ids || []).map((tid) => {
              const label = contactTagOptions.find((o) => o.value === String(tid))?.label || tid;
              return (
                <span key={tid} className={styles.tagChip} role="listitem">
                  <span className={styles.tagChipLabel}>{label}</span>
                </span>
              );
            })}
          </div>
        )}
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.ASSIGNMENT]: () =>
      !isNew && (role === 'admin' || role === 'manager') ? (
        <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-assign">
          <h2 id="view-section-assign" className={styles.sectionTitle}>
            Assignment
          </h2>
          <div className={styles.fieldGridDense}>
            {role === 'admin' ? <ViewField label="Manager">{managerDisplay}</ViewField> : null}
            <ViewField label="Assigned agent">{agentDisplay}</ViewField>
            <ViewField label="Campaign">{campaignDisplay}</ViewField>
          </div>
        </section>
      ) : null,

    [CONTACT_FORM_SECTION_IDS.INDUSTRY]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-industry">
        <h2 id="view-section-industry" className={styles.sectionTitle}>
          Industry fields
        </h2>
        {!loadingIndustryFields && industryFieldDefs.length === 0 ? (
          <p className={styles.customEmpty}>No industry fields for this workspace.</p>
        ) : null}
        <div className={styles.fieldGridDense}>
          {industryFieldDefs.map((f) => (
            <ViewField key={f.field_key} label={f.label}>
              {formatIndustryFieldForView(f)}
            </ViewField>
          ))}
        </div>
      </section>
    ),

    [CONTACT_FORM_SECTION_IDS.CUSTOM]: () => (
      <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-custom">
        <h2 id="view-section-custom" className={styles.sectionTitle}>
          Custom fields
        </h2>
        {!loadingCustomFields && customFields.length === 0 ? (
          <p className={styles.customEmpty}>No custom fields configured for this tenant.</p>
        ) : null}
        <div className={styles.fieldGridDense}>
          {customFields.map((f) => (
            <ViewField key={f.field_id} label={f.label}>
              {formatCustomFieldForView(f)}
            </ViewField>
          ))}
        </div>
      </section>
    ),
  };
}
