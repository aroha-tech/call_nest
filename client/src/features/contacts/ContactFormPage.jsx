import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { contactsAPI } from '../../services/contactsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { campaignsAPI } from '../../services/campaignsAPI';
import { contactTagsAPI } from '../../services/contactTagsAPI';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import styles from './ContactFormPage.module.scss';

const PHONE_LABEL_OPTIONS = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'home', label: 'Home' },
  { value: 'work', label: 'Work' },
  { value: 'other', label: 'Other' },
];

const DEFAULT_COUNTRY_CODE = '+91';

function normalizeOptions(options_json) {
  if (!options_json) return [];
  if (Array.isArray(options_json)) return options_json;
  if (typeof options_json === 'string') {
    try {
      const parsed = JSON.parse(options_json);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
  }
  if (typeof options_json === 'object' && Array.isArray(options_json.values)) return options_json.values;
  return [];
}

function uniqueLabelError(phones) {
  const seen = new Set();
  for (const p of phones || []) {
    const label = (p?.label || 'mobile').toLowerCase();
    if (seen.has(label)) return `Only one phone number is allowed per label (${label})`;
    seen.add(label);
  }
  return null;
}

export function ContactFormPage({ defaultType }) {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const authUser = useAppSelector(selectUser);
  const role = authUser?.role ?? 'agent';

  const id = params.id;
  const isNew = !id || id === 'new';
  const type = defaultType; // 'lead' or 'contact' from route wrapper

  const [customFields, setCustomFields] = useState([]);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [campaignList, setCampaignList] = useState([]);
  const [contactTagOptions, setContactTagOptions] = useState([]);
  const [loadingCustomFields, setLoadingCustomFields] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [formData, setFormData] = useState({
    type,
    display_name: '',
    first_name: '',
    last_name: '',
    email: '',
    city: '',
    state: '',
    country: '',
    address: '',
    address_line_2: '',
    pin_code: '',
    company: '',
    job_title: '',
    website: '',
    industry: '',
    date_of_birth: '',
    tax_id: '',
    phones: [{ country_code: DEFAULT_COUNTRY_CODE, number: '', label: 'mobile', is_primary: true }],
    customValuesMap: {},
    manager_id: '',
    assigned_user_id: '',
    campaign_id: '',
    tag_ids: [],
  });

  function splitPhoneE164(value) {
    const raw = String(value || '').trim();
    if (!raw) return { country_code: DEFAULT_COUNTRY_CODE, number: '' };
    const compact = raw.replace(/[^\d+]/g, '');

    // Prefer splitting by default country code if it matches.
    const defaultCcDigits = DEFAULT_COUNTRY_CODE.replace(/[^\d]/g, '');
    if (compact.startsWith(`+${defaultCcDigits}`) && compact.length > (`+${defaultCcDigits}`.length + 5)) {
      return {
        country_code: `+${defaultCcDigits}`,
        number: compact.slice((`+${defaultCcDigits}`).length).replace(/\D/g, ''),
      };
    }

    // Generic fallback: +<1-3 digits country code> + rest
    const m = compact.match(/^\+(\d{1,3})(\d{6,15})$/);
    if (m) return { country_code: `+${m[1]}`, number: m[2] };
    // Fallback: take only digits as number
    return { country_code: DEFAULT_COUNTRY_CODE, number: raw.replace(/\D/g, '') };
  }

  const fetchContact = useCallback(() => (isNew ? Promise.resolve({ data: { data: null } }) : contactsAPI.getById(id)), [isNew, id]);
  const { data: contactResponse, loading: loadingContact, error: contactError } = useAsyncData(fetchContact, [fetchContact], {
    transform: (res) => res?.data ?? { data: null },
  });
  const contact = contactResponse?.data ?? null;

  const createMutation = useMutation((payload) => contactsAPI.create(payload));
  const updateMutation = useMutation((payload) => contactsAPI.update(id, payload));

  const fetchCustomFields = useCallback(async () => {
    setLoadingCustomFields(true);
    try {
      const res = await contactsAPI.getCustomFields();
      setCustomFields(res?.data?.data ?? []);
    } catch {
      setCustomFields([]);
    } finally {
      setLoadingCustomFields(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomFields();
  }, [fetchCustomFields]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await contactTagsAPI.list();
        if (cancelled) return;
        const rows = res?.data?.data ?? [];
        setContactTagOptions(rows.map((t) => ({ value: String(t.id), label: t.name || `#${t.id}` })));
      } catch {
        if (!cancelled) setContactTagOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (role !== 'admin' && role !== 'manager') return;
    (async () => {
      try {
        const [uRes, cRes] = await Promise.all([
          tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false }),
          campaignsAPI.list({ page: 1, limit: 500, show_paused: true }).catch(() => ({ data: { data: [] } })),
        ]);
        if (cancelled) return;
        setTenantUsers(uRes?.data?.data ?? []);
        setCampaignList(cRes?.data?.data ?? []);
      } catch {
        if (!cancelled) {
          setTenantUsers([]);
          setCampaignList([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  // Load contact into form when editing
  useEffect(() => {
    if (!contact || isNew) return;
    setDisplayNameTouched(false);
    const contactPhones = Array.isArray(contact.phones) && contact.phones.length > 0
      ? contact.phones
      : (contact.primary_phone ? [{ phone: contact.primary_phone, label: 'mobile', is_primary: 1 }] : []);
    const mappedPhones = contactPhones.length > 0
      ? contactPhones.map((p) => ({
          ...splitPhoneE164(p.phone),
          label: p.label || 'mobile',
          is_primary: !!p.is_primary,
        }))
      : [{ country_code: DEFAULT_COUNTRY_CODE, number: '', label: 'mobile', is_primary: true }];
    setFormData((prev) => ({
      ...prev,
      type: contact.type,
      display_name: contact.display_name ?? '',
      first_name: contact.first_name ?? '',
      last_name: contact.last_name ?? '',
      email: contact.email ?? '',
      city: contact.city ?? '',
      state: contact.state ?? '',
      country: contact.country ?? '',
      address: contact.address ?? '',
      address_line_2: contact.address_line_2 ?? '',
      pin_code: contact.pin_code ?? '',
      company: contact.company ?? '',
      job_title: contact.job_title ?? '',
      website: contact.website ?? '',
      industry: contact.industry ?? '',
      date_of_birth:
        contact.date_of_birth == null
          ? ''
          : String(contact.date_of_birth).slice(0, 10),
      tax_id: contact.tax_id ?? '',
      phones: mappedPhones,
      customValuesMap: prev.customValuesMap || {},
      manager_id: contact.manager_id != null ? String(contact.manager_id) : '',
      assigned_user_id: contact.assigned_user_id != null ? String(contact.assigned_user_id) : '',
      campaign_id: contact.campaign_id != null ? String(contact.campaign_id) : '',
      tag_ids: Array.isArray(contact.tag_ids)
        ? contact.tag_ids.map((x) => String(x))
        : Array.isArray(contact.tags)
          ? contact.tags.map((t) => String(t.id))
          : [],
    }));
  }, [contact, isNew]);

  // Auto-generate display_name from first+last until user manually edits it.
  useEffect(() => {
    if (displayNameTouched) return;
    const first = String(formData.first_name || '').trim();
    const last = String(formData.last_name || '').trim();
    const composed = `${first} ${last}`.trim();
    if (composed && composed !== formData.display_name) {
      setFormData((p) => ({ ...p, display_name: composed }));
    }
    if (!composed && formData.display_name) {
      // If both names cleared and display_name was auto, clear it too.
      // Keep as-is if user later touches display name.
      setFormData((p) => ({ ...p, display_name: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.first_name, formData.last_name, displayNameTouched]);

  // Load custom field values for edit
  useEffect(() => {
    let cancelled = false;
    async function loadValues() {
      if (isNew) return;
      if (!id) return;
      if (customFields.length === 0) return;
      try {
        const res = await contactsAPI.getContactCustomFields(id);
        const values = res?.data?.data ?? [];
        if (cancelled) return;
        const map = {};
        values.forEach((v) => {
          map[v.field_id] = v.value_text ?? '';
        });
        setFormData((prev) => ({ ...prev, customValuesMap: map }));
      } catch {
        // ignore
      }
    }
    loadValues();
    return () => {
      cancelled = true;
    };
  }, [id, isNew, customFields.length]);

  const availableLabelOptions = useMemo(() => {
    const used = new Set((formData.phones || []).map((p) => (p.label || 'mobile').toLowerCase()));
    return PHONE_LABEL_OPTIONS.filter((o) => !used.has(o.value));
  }, [formData.phones]);

  const managerSelectOptions = useMemo(
    () =>
      tenantUsers
        .filter((u) => u.role === 'manager')
        .map((u) => ({ value: String(u.id), label: u.name || u.email || `#${u.id}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [tenantUsers]
  );

  /** Agents allowed for the current manager selection (admin: scoped by manager_id; manager: own team only). */
  const agentsAllowedForManager = useMemo(() => {
    let agents = tenantUsers.filter((u) => u.role === 'agent');
    if (role === 'manager' && authUser?.id) {
      return agents.filter((u) => Number(u.manager_id) === Number(authUser.id));
    }
    if (role === 'admin') {
      const mid = formData.manager_id ? Number(formData.manager_id) : null;
      if (mid) {
        return agents.filter((u) => Number(u.manager_id) === mid);
      }
      return agents;
    }
    return agents;
  }, [tenantUsers, role, authUser?.id, formData.manager_id]);

  const agentSelectOptions = useMemo(() => {
    const base = agentsAllowedForManager
      .map((u) => ({ value: String(u.id), label: u.name || u.email || `#${u.id}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const aid = formData.assigned_user_id ? String(formData.assigned_user_id) : '';
    if (!aid) return base;
    const inList = base.some((o) => o.value === aid);
    if (inList) return base;
    const u = tenantUsers.find((x) => x.role === 'agent' && String(x.id) === aid);
    if (u) {
      return [
        {
          value: aid,
          label: `${u.name || u.email || `#${u.id}`} (current — not under selected manager)`,
        },
        ...base,
      ];
    }
    return base;
  }, [agentsAllowedForManager, formData.assigned_user_id, tenantUsers]);

  // Admin: when a specific manager is chosen, drop the agent if they are not on that team.
  useEffect(() => {
    if (role !== 'admin') return;
    const aid = formData.assigned_user_id;
    if (!aid) return;
    const mid = formData.manager_id ? Number(formData.manager_id) : null;
    if (mid == null) return;
    const agent = tenantUsers.find((u) => u.role === 'agent' && String(u.id) === String(aid));
    if (!agent) return;
    if (Number(agent.manager_id) !== mid) {
      setFormData((p) => ({ ...p, assigned_user_id: '' }));
    }
  }, [role, formData.manager_id, formData.assigned_user_id, tenantUsers]);

  // Admin: unassigned pool + pick agent → set owning manager from that agent (matches bulk assign / server rules).
  useEffect(() => {
    if (role !== 'admin') return;
    if (formData.manager_id) return;
    const aid = formData.assigned_user_id;
    if (!aid) return;
    if (tenantUsers.length === 0) return;
    const agent = tenantUsers.find((u) => u.role === 'agent' && String(u.id) === String(aid));
    if (!agent) return;
    const agentMgr = agent.manager_id != null ? String(agent.manager_id) : '';
    setFormData((p) => {
      if (p.manager_id) return p;
      if ((p.assigned_user_id ? String(p.assigned_user_id) : '') !== String(aid)) return p;
      if ((agentMgr || '') === (p.manager_id || '')) return p;
      return { ...p, manager_id: agentMgr };
    });
  }, [role, formData.manager_id, formData.assigned_user_id, tenantUsers]);

  const campaignSelectOptions = useMemo(
    () =>
      (campaignList || []).map((c) => ({
        value: String(c.id),
        label: c.name || `#${c.id}`,
      })),
    [campaignList]
  );

  const buildSubmitPayload = () => {
    const phones = (formData.phones || []).map((p) => {
      const cc = String(p.country_code || DEFAULT_COUNTRY_CODE).trim();
      const num = String(p.number || '').trim().replace(/\D/g, '');
      const normalizedCc = cc.startsWith('+') ? cc : `+${cc.replace(/\D/g, '')}`;
      const phone = num ? `${normalizedCc}${num}` : '';
      return {
        phone,
      label: p.label || 'mobile',
      is_primary: !!p.is_primary,
      };
    });

    const custom_fields = (customFields || [])
      .map((f) => {
        const raw = formData?.customValuesMap?.[f.field_id];
        const value_text =
          raw === undefined || raw === null || String(raw).trim() === '' ? null : String(raw).trim();
        if (value_text === null) return null;
        return { field_id: f.field_id, value_text };
      })
      .filter(Boolean);

    const base = {
      type,
      display_name: formData.display_name,
      first_name: formData.first_name || null,
      last_name: formData.last_name || null,
      email: formData.email || null,
      city: formData.city?.trim() || null,
      state: formData.state?.trim() || null,
      country: formData.country?.trim() || null,
      address: formData.address?.trim() || null,
      address_line_2: formData.address_line_2?.trim() || null,
      pin_code: formData.pin_code?.trim() || null,
      company: formData.company?.trim() || null,
      job_title: formData.job_title?.trim() || null,
      website: formData.website?.trim() || null,
      industry: formData.industry?.trim() || null,
      date_of_birth: formData.date_of_birth?.trim() || null,
      tax_id: formData.tax_id?.trim() || null,
      tag_ids: (formData.tag_ids || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0),
      phones,
      custom_fields,
    };

    if (role === 'admin' && isNew) {
      if (formData.manager_id) base.manager_id = Number(formData.manager_id);
      if (formData.assigned_user_id) base.assigned_user_id = Number(formData.assigned_user_id);
      if (formData.campaign_id) base.campaign_id = Number(formData.campaign_id);
    }

    if (!isNew && (role === 'admin' || role === 'manager')) {
      if (role === 'admin') {
        base.manager_id = formData.manager_id ? Number(formData.manager_id) : null;
      }
      base.assigned_user_id = formData.assigned_user_id ? Number(formData.assigned_user_id) : null;
      base.campaign_id = formData.campaign_id ? Number(formData.campaign_id) : null;
      if (
        role === 'manager' &&
        contact?.manager_id == null &&
        base.assigned_user_id != null &&
        authUser?.id
      ) {
        base.manager_id = Number(authUser.id);
      }
    }

    return base;
  };

  const validate = () => {
    const errs = {};
    if (!formData.display_name || !String(formData.display_name).trim()) {
      errs.display_name = 'display_name is required';
    }
    if (!formData.first_name?.trim() && !formData.email?.trim()) {
      errs.first_name = 'Either first_name or email is required';
    }
    const phoneErr = uniqueLabelError(formData.phones);
    if (phoneErr) errs.phones = phoneErr;
    // Optional: validate phone format for rows where number entered
    for (const p of formData.phones || []) {
      const num = String(p.number || '').trim();
      if (num && num.replace(/\D/g, '').length < 6) {
        errs.phones = 'Phone number looks too short';
        break;
      }
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const errs = validate();
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = buildSubmitPayload();
    const result = isNew ? await createMutation.mutate(payload) : await updateMutation.mutate(payload);
    if (result?.success) {
      navigate(type === 'lead' ? '/leads' : '/contacts');
    } else {
      setSubmitError(result?.error || 'Save failed');
    }
  };

  const title = isNew ? `Add ${type === 'lead' ? 'Lead' : 'Contact'}` : `Edit ${type === 'lead' ? 'Lead' : 'Contact'}`;
  const isLeadRoute = location.pathname.startsWith('/leads');
  const recordLabel = type === 'lead' ? 'lead' : 'contact';
  const pageDescription = isNew
    ? `Create a ${recordLabel}: name, tags, phones${role === 'admin' ? ', and optional ownership' : ''}.`
    : `Update ${recordLabel} profile, tags, assignment, and phone numbers.`;

  if (!isNew && loadingContact && !contact) {
    return (
      <div className={styles.stateWrap}>
        <PageHeader title={title} />
        <div className={styles.stateCenter}>
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (!isNew && contactError) {
    return (
      <div className={styles.stateWrap}>
        <PageHeader title={title} />
        <Alert variant="error">{contactError}</Alert>
        <Button variant="ghost" onClick={() => navigate(-1)} style={{ marginTop: 12 }}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={title}
        description={pageDescription}
        actions={
          <div className={styles.headerActions}>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" form="contact-record-form" loading={createMutation.loading || updateMutation.loading}>
              Save
            </Button>
          </div>
        }
      />

      {submitError && <Alert variant="error">{submitError}</Alert>}
      {formErrors.phones && <Alert variant="warning">{formErrors.phones}</Alert>}

      <form id="contact-record-form" onSubmit={handleSubmit} className={styles.form}>
        <section className={styles.section} aria-labelledby="contact-section-identity">
          <h2 id="contact-section-identity" className={styles.sectionTitle}>
            {isLeadRoute ? 'Lead details' : 'Contact details'}
          </h2>
          <p className={styles.sectionDesc}>
            Display name is required. Provide at least first name or email. Display name updates from first and last name until you edit it directly.
          </p>
          <div className={styles.fieldGrid}>
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
          </div>
        </section>

        <section className={styles.section} aria-labelledby="contact-section-location">
          <h2 id="contact-section-location" className={styles.sectionTitle}>
            Location &amp; professional
          </h2>
          <p className={styles.sectionDesc}>
            Standard fields stored on the contact record (not custom fields). Used in lists, export, and imports.
          </p>
          <div className={styles.fieldGrid}>
            <Input
              label="Country"
              value={formData.country}
              onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
              autoComplete="country-name"
            />
            <Input
              label="State / region"
              value={formData.state}
              onChange={(e) => setFormData((p) => ({ ...p, state: e.target.value }))}
            />
            <Input
              label="City"
              value={formData.city}
              onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value }))}
            />
            <Input
              label="PIN / postal code"
              value={formData.pin_code}
              onChange={(e) => setFormData((p) => ({ ...p, pin_code: e.target.value }))}
            />
            <Input
              label="Address line 1"
              value={formData.address}
              onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
              className={styles.fullWidthField}
            />
            <Input
              label="Address line 2"
              value={formData.address_line_2}
              onChange={(e) => setFormData((p) => ({ ...p, address_line_2: e.target.value }))}
              className={styles.fullWidthField}
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

        <section className={styles.section} aria-labelledby="contact-section-tags">
          <h2 id="contact-section-tags" className={styles.sectionTitle}>
            Tags
          </h2>
          <p className={styles.sectionDesc}>
            Choose any active tags from your tenant list (shared catalog). Admins and managers manage the catalog under Settings → Contact tags.
          </p>
          {(formData.tag_ids || []).length === 0 ? (
            <p className={styles.tagEmptyHint}>No tags yet — add one below.</p>
          ) : null}
          <div className={styles.tagChips} role="list">
            {(formData.tag_ids || []).map((tid) => {
              const label = contactTagOptions.find((o) => o.value === String(tid))?.label || tid;
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

        {role === 'admin' && isNew ? (
          <section className={styles.section} aria-labelledby="contact-section-ownership">
            <h2 id="contact-section-ownership" className={styles.sectionTitle}>
              Ownership (optional)
            </h2>
            <p className={styles.sectionDesc}>
              Optionally set manager, agent, and a static campaign before saving. You can leave these empty for the unassigned pool.
            </p>
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

        {!isNew && (role === 'admin' || role === 'manager') ? (
          <section className={styles.section} aria-labelledby="contact-section-assign">
            <h2 id="contact-section-assign" className={styles.sectionTitle}>
              Assignment
            </h2>
            <p className={styles.sectionDesc}>
              {role === 'manager'
                ? 'Assign an agent on your team or leave unassigned. Assigning an agent can set ownership rules for unassigned-pool records.'
                : 'Manager controls the unassigned pool scope. Pick agent and static campaign as needed.'}
            </p>
            <div className={styles.assignGrid}>
              {role === 'admin' ? (
                <Select
                  label="Manager"
                  value={formData.manager_id}
                  onChange={(e) => setFormData((p) => ({ ...p, manager_id: e.target.value }))}
                  placeholder="— Unassigned pool —"
                  options={[{ value: '', label: '— Unassigned pool —' }, ...managerSelectOptions]}
                />
              ) : null}
              <Select
                label="Assigned agent"
                value={formData.assigned_user_id}
                onChange={(e) => setFormData((p) => ({ ...p, assigned_user_id: e.target.value }))}
                placeholder="— Unassigned —"
                options={[{ value: '', label: '— Unassigned —' }, ...agentSelectOptions]}
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

        <section className={styles.section} aria-labelledby="contact-section-phones">
          <div className={styles.sectionHeader}>
            <div className={styles.sectionHeaderText}>
              <h2 id="contact-section-phones" className={styles.sectionTitle}>
                Phone numbers
              </h2>
              <p className={`${styles.sectionDesc} ${styles.sectionDescTight}`}>
                One row per line type (e.g. mobile vs WhatsApp). Mark exactly one as primary when possible.
              </p>
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
                  phones: [...(prev.phones || []), { country_code: DEFAULT_COUNTRY_CODE, number: '', label: nextLabel, is_primary: false }],
                }));
              }}
            >
              + Add phone
            </Button>
          </div>

          <div className={styles.phoneList}>
            {(formData.phones || []).map((p, idx) => {
              const used = new Set((formData.phones || []).map((x, i) => (i === idx ? null : (x.label || 'mobile').toLowerCase())).filter(Boolean));
              const labelOptionsForRow = PHONE_LABEL_OPTIONS.filter((o) => !used.has(o.value) || o.value === (p.label || 'mobile'));
              return (
                <div key={idx} className={styles.phoneRow}>
                  <div className={styles.phoneCc}>
                    <Input
                      label={idx === 0 ? 'Country code' : undefined}
                      value={p.country_code || DEFAULT_COUNTRY_CODE}
                      onChange={(e) => {
                        const next = [...formData.phones];
                        next[idx] = { ...next[idx], country_code: e.target.value };
                        setFormData((prev) => ({ ...prev, phones: next }));
                      }}
                      placeholder="+91"
                    />
                  </div>
                  <div className={styles.phoneNum}>
                    <Input
                      label={idx === 0 ? 'Number' : undefined}
                      value={p.number || ''}
                      onChange={(e) => {
                        const next = [...formData.phones];
                        next[idx] = { ...next[idx], number: e.target.value };
                        setFormData((prev) => ({ ...prev, phones: next }));
                      }}
                      placeholder="9876543210"
                      inputMode="tel"
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

        <section className={styles.section} aria-labelledby="contact-section-custom">
          <h2 id="contact-section-custom" className={styles.sectionTitle}>
            Custom fields
            {loadingCustomFields ? <span className={styles.loadingInline}>Loading…</span> : null}
          </h2>
          <p className={styles.sectionDesc}>
            Tenant-defined fields. Leave blank to clear optional values on save.
          </p>
          {!loadingCustomFields && customFields.length === 0 ? (
            <p className={styles.customEmpty}>No custom fields configured for this tenant.</p>
          ) : null}

          <div className={styles.customFieldsGrid}>
            {customFields.map((f) => {
              const value = formData?.customValuesMap?.[f.field_id] ?? '';
              const options = normalizeOptions(f.options_json);

              if (f.type === 'select') {
                return (
                  <Select
                    key={f.field_id}
                    label={f.label}
                    value={value || ''}
                    onChange={(e) => {
                      const nextMap = { ...(formData.customValuesMap || {}) };
                      nextMap[f.field_id] = e.target.value;
                      setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                    }}
                    options={options.map((opt) => ({ value: String(opt), label: String(opt) }))}
                    placeholder="Select..."
                  />
                );
              }

              if (f.type === 'boolean') {
                return (
                  <label key={f.field_id} className={`${styles.customFieldFull} ${styles.primaryCheck} ${styles.customBooleanRow}`}>
                    <input
                      type="checkbox"
                      checked={String(value).toLowerCase() === 'true' || value === '1'}
                      onChange={(e) => {
                        const nextMap = { ...(formData.customValuesMap || {}) };
                        nextMap[f.field_id] = e.target.checked ? 'true' : 'false';
                        setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                      }}
                    />
                    <span className={styles.booleanLabel}>{f.label}</span>
                  </label>
                );
              }

              return (
                <Input
                  key={f.field_id}
                  label={f.label}
                  value={value}
                  onChange={(e) => {
                    const nextMap = { ...(formData.customValuesMap || {}) };
                    nextMap[f.field_id] = e.target.value;
                    setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                  }}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                  placeholder="Optional"
                />
              );
            })}
          </div>
        </section>
      </form>
    </div>
  );
}

