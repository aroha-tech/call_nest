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
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';

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
    phones: [{ country_code: DEFAULT_COUNTRY_CODE, number: '', label: 'mobile', is_primary: true }],
    customValuesMap: {},
    manager_id: '',
    assigned_user_id: '',
    campaign_id: '',
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
    if (role !== 'admin' && role !== 'manager') return;
    (async () => {
      try {
        const [uRes, cRes] = await Promise.all([
          tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false }),
          campaignsAPI.list().catch(() => ({ data: { data: [] } })),
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
      phones: mappedPhones,
      customValuesMap: prev.customValuesMap || {},
      manager_id: contact.manager_id != null ? String(contact.manager_id) : '',
      assigned_user_id: contact.assigned_user_id != null ? String(contact.assigned_user_id) : '',
      campaign_id: contact.campaign_id != null ? String(contact.campaign_id) : '',
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

  if (!isNew && loadingContact && !contact) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title={title} />
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (!isNew && contactError) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title={title} />
        <Alert variant="error">{contactError}</Alert>
        <Button variant="ghost" onClick={() => navigate(-1)} style={{ marginTop: 12 }}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader
        title={title}
        description={location.pathname.startsWith('/leads') ? 'Lead details' : 'Contact details'}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={createMutation.loading || updateMutation.loading}>
              Save
            </Button>
          </div>
        }
      />

      {submitError && <Alert variant="error">{submitError}</Alert>}
      {formErrors.phones && <Alert variant="warning">{formErrors.phones}</Alert>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 920 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
          />
        </div>

        {role === 'admin' && isNew ? (
          <div
            style={{
              marginTop: 8,
              paddingTop: 12,
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>Ownership (optional)</div>
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
        ) : null}

        {!isNew && (role === 'admin' || role === 'manager') ? (
          <div
            style={{
              marginTop: 8,
              paddingTop: 12,
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>Assign / unassign</div>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
              {role === 'manager'
                ? 'Assign to an agent on your team, or clear agent. Unassigned pool records get your manager id when you assign an agent.'
                : 'Set manager (or leave empty for unassigned pool), agent, and static campaign.'}
            </p>
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
        ) : null}

        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ fontWeight: 600 }}>Phone numbers</label>
            <Button
              type="button"
              size="sm"
              variant="ghost"
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {(formData.phones || []).map((p, idx) => {
              const used = new Set((formData.phones || []).map((x, i) => (i === idx ? null : (x.label || 'mobile').toLowerCase())).filter(Boolean));
              const labelOptionsForRow = PHONE_LABEL_OPTIONS.filter((o) => !used.has(o.value) || o.value === (p.label || 'mobile'));
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 180px 140px 90px', gap: 10, alignItems: 'end' }}>
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
                  <Input
                    label={idx === 0 ? 'Number' : undefined}
                    value={p.number || ''}
                    onChange={(e) => {
                      const next = [...formData.phones];
                      next[idx] = { ...next[idx], number: e.target.value };
                      setFormData((prev) => ({ ...prev, phones: next }));
                    }}
                    placeholder="9876543210"
                  />
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
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
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
                      // keep exactly one primary
                      if (next.length > 0 && !next.some((x) => x.is_primary)) {
                        next[0].is_primary = true;
                      }
                      setFormData((prev) => ({ ...prev, phones: next }));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>
            Custom fields
            {loadingCustomFields ? (
              <span style={{ marginLeft: 8, color: 'var(--color-text-muted)', fontWeight: 400 }}>(loading...)</span>
            ) : null}
          </label>
          {!loadingCustomFields && customFields.length === 0 ? (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No custom fields configured for this tenant.</div>
          ) : null}

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
                <label key={f.field_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={String(value).toLowerCase() === 'true' || value === '1'}
                    onChange={(e) => {
                      const nextMap = { ...(formData.customValuesMap || {}) };
                      nextMap[f.field_id] = e.target.checked ? 'true' : 'false';
                      setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                    }}
                  />
                  {f.label}
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
      </form>
    </div>
  );
}

