import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { MultiSelectDropdown } from '../../components/ui/MultiSelectDropdown';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { ConfirmModal } from '../../components/ui/Modal';
import { contactsAPI } from '../../services/contactsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { campaignsAPI } from '../../services/campaignsAPI';
import { contactTagsAPI } from '../../services/contactTagsAPI';
import { ContactOpportunitiesSection } from './ContactOpportunitiesSection';
import { useContactStatusesOptions } from '../disposition/hooks/useMasterData';
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
  if (Array.isArray(options_json)) return options_json.map((x) => String(x));
  if (typeof options_json === 'string') {
    const trimmed = options_json.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      // Plain comma / semicolon list (some exports or legacy rows)
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
    // ignore
  }
  return String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
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

function formatViewText(v) {
  if (v == null) return '—';
  const s = typeof v === 'string' ? v : String(v);
  return s.trim() ? s : '—';
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

function ViewField({ label, children, className = '' }) {
  const showDash = children == null || children === '';
  return (
    <div className={`${styles.viewField} ${className}`.trim()}>
      <div className={styles.viewLabel}>{label}</div>
      <div className={styles.viewValue}>{showDash ? '—' : children}</div>
    </div>
  );
}

export function ContactFormPage({ defaultType }) {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const authUser = useAppSelector(selectUser);
  const role = authUser?.role ?? 'agent';

  const id = params.id;
  const isNew = !id || id === 'new';
  const type = defaultType; // 'lead' or 'contact' from route wrapper

  const [customFields, setCustomFields] = useState([]);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [campaignList, setCampaignList] = useState([]);
  const [contactTagOptions, setContactTagOptions] = useState([]);
  const { data: contactStatuses = [], loading: contactStatusesLoading } = useContactStatusesOptions();
  const [loadingCustomFields, setLoadingCustomFields] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [convertTypeOpen, setConvertTypeOpen] = useState(false);
  const didApplyNewStatusDefault = useRef(false);
  const editSnapshotRef = useRef(null);
  const [isEditing, setIsEditing] = useState(() => !!isNew);

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
    status_id: '',
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

  const fetchContact = useCallback(
    () => (isNew ? Promise.resolve({ data: { data: null } }) : contactsAPI.getById(id)),
    [isNew, id, location.pathname]
  );
  const {
    data: contactResponse,
    loading: loadingContact,
    error: contactError,
    refetch: refetchContact,
  } = useAsyncData(fetchContact, [fetchContact], {
    transform: (res) => res?.data ?? { data: null },
  });
  const contact = contactResponse?.data ?? null;

  const createMutation = useMutation((payload) => contactsAPI.create(payload));
  const updateMutation = useMutation((payload) => contactsAPI.update(id, payload));
  const convertTypeMutation = useMutation((nextType) => contactsAPI.update(id, { type: nextType }));

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
    const loadUsers = role === 'admin' || role === 'manager';
    const loadCampaigns = role === 'admin' || role === 'manager' || (role === 'agent' && type === 'lead');
    if (!loadUsers && !loadCampaigns) return;
    (async () => {
      try {
        const uRes = loadUsers
          ? await tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false })
          : { data: { data: [] } };
        const cRes = loadCampaigns
          ? await campaignsAPI
              .list({ page: 1, limit: 500, show_paused: true, type: 'static' })
              .catch(() => ({ data: { data: [] } }))
          : { data: { data: [] } };
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
  }, [role, type]);

  useEffect(() => {
    didApplyNewStatusDefault.current = false;
  }, [location.pathname]);

  useEffect(() => {
    editSnapshotRef.current = null;
  }, [id]);

  useLayoutEffect(() => {
    if (isNew) {
      setIsEditing(true);
    } else {
      setIsEditing(modeParam === 'edit');
    }
  }, [isNew, id, modeParam]);

  /** New records: pre-select platform status "New" once per visit when available (matches server default). */
  useEffect(() => {
    if (!isNew || contactStatusesLoading) return;
    if (didApplyNewStatusDefault.current) return;
    const newRow = contactStatuses.find((s) => String(s.code || '').toLowerCase() === 'new');
    if (!newRow) return;
    didApplyNewStatusDefault.current = true;
    setFormData((p) => ({ ...p, status_id: newRow.id }));
  }, [isNew, contactStatusesLoading, contactStatuses]);

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
      status_id: contact.status_id != null ? String(contact.status_id) : '',
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

  /** Baseline for Cancel when opening via ?mode=edit — runs after contact + async custom values settle. */
  useEffect(() => {
    if (isNew || !contact || modeParam !== 'edit') return;
    if (editSnapshotRef.current != null) return;
    const tid = window.setTimeout(() => {
      setFormData((fd) => {
        if (editSnapshotRef.current != null) return fd;
        try {
          editSnapshotRef.current = structuredClone(fd);
        } catch {
          editSnapshotRef.current = JSON.parse(JSON.stringify(fd));
        }
        return fd;
      });
    }, 120);
    return () => window.clearTimeout(tid);
  }, [isNew, contact?.id, modeParam]);

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

    if (!isNew) {
      base.status_id = formData.status_id?.trim() || null;
    } else if (formData.status_id?.trim()) {
      base.status_id = formData.status_id.trim();
    }

    if (role === 'admin' && isNew) {
      if (formData.manager_id) base.manager_id = Number(formData.manager_id);
      if (formData.assigned_user_id) base.assigned_user_id = Number(formData.assigned_user_id);
      if (formData.campaign_id) base.campaign_id = Number(formData.campaign_id);
    }

    if (role === 'manager' && isNew) {
      if (formData.campaign_id) base.campaign_id = Number(formData.campaign_id);
      if (formData.assigned_user_id) base.assigned_user_id = Number(formData.assigned_user_id);
    }

    if (role === 'agent' && isNew && type === 'lead') {
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

  const showFormHints = isNew || isEditing;

  const handleEnterEdit = useCallback(() => {
    try {
      editSnapshotRef.current = structuredClone(formData);
    } catch {
      editSnapshotRef.current = JSON.parse(JSON.stringify(formData));
    }
    setIsEditing(true);
    setSubmitError(null);
    setFormErrors({});
    setSearchParams({ mode: 'edit' }, { replace: true });
  }, [formData, setSearchParams]);

  const handleCancelEdit = useCallback(() => {
    if (editSnapshotRef.current) {
      setFormData(editSnapshotRef.current);
      editSnapshotRef.current = null;
    }
    setIsEditing(false);
    setSubmitError(null);
    setFormErrors({});
    setSearchParams({ mode: 'view' }, { replace: true });
  }, [setSearchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const errs = validate();
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = buildSubmitPayload();
    const result = isNew ? await createMutation.mutate(payload) : await updateMutation.mutate(payload);
    if (result?.success) {
      if (isNew) {
        navigate(type === 'lead' ? '/leads' : '/contacts');
      } else {
        await refetchContact();
        setIsEditing(false);
        editSnapshotRef.current = null;
        setSearchParams({ mode: 'view' }, { replace: true });
      }
    } else {
      setSubmitError(result?.error || 'Save failed');
    }
  };

  const title = isNew ? `Add ${type === 'lead' ? 'Lead' : 'Contact'}` : `Edit ${type === 'lead' ? 'Lead' : 'Contact'}`;
  const isLeadRoute = location.pathname.startsWith('/leads');
  const recordLabel = type === 'lead' ? 'lead' : 'contact';
  const pageDescription = isNew
    ? `Create a ${recordLabel}: name, tags, phones${
        role === 'admin' ? ', and optional ownership' : ''
      }${
        role === 'manager' && type === 'lead'
          ? '. New leads default to you as manager unless you assign a team agent'
          : ''
      }${role === 'agent' && type === 'lead' ? '. Assignment defaults to you and your manager' : ''}.`
    : `Update ${recordLabel} profile, tags, assignment, and phone numbers.`;

  const pageDescriptionResolved =
    !isNew && !isEditing
      ? `View ${recordLabel} profile, tags, phones, and assignment. Use Edit to change fields you are allowed to update.`
      : pageDescription;

  const statusDisplay = useMemo(() => {
    const id = formData.status_id;
    if (!id) return '—';
    const s = contactStatuses.find((x) => String(x.id) === String(id));
    if (!s) return String(id);
    const name = s.name || '';
    const code = s.code ? ` (${s.code})` : '';
    return `${name}${code}`.trim() || '—';
  }, [contactStatuses, formData.status_id]);

  const managerDisplay = useMemo(() => {
    if (!formData.manager_id) return '—';
    return (
      managerSelectOptions.find((o) => o.value === String(formData.manager_id))?.label ??
      tenantUsers.find((u) => String(u.id) === String(formData.manager_id))?.name ??
      `User #${formData.manager_id}`
    );
  }, [formData.manager_id, managerSelectOptions, tenantUsers]);

  const agentDisplay = useMemo(() => {
    if (!formData.assigned_user_id) return '—';
    return (
      agentSelectOptions.find((o) => o.value === String(formData.assigned_user_id))?.label ??
      tenantUsers.find((u) => String(u.id) === String(formData.assigned_user_id))?.name ??
      `User #${formData.assigned_user_id}`
    );
  }, [formData.assigned_user_id, agentSelectOptions, tenantUsers]);

  const campaignDisplay = useMemo(() => {
    if (!formData.campaign_id) return '—';
    return (
      campaignSelectOptions.find((o) => o.value === String(formData.campaign_id))?.label ??
      `Campaign #${formData.campaign_id}`
    );
  }, [formData.campaign_id, campaignSelectOptions]);

  const perms = authUser?.permissions ?? [];

  const canConvertRecordType = useMemo(() => {
    if (isNew || !contact) return false;
    if (String(contact.type) !== String(type)) return false;
    if (role === 'admin' || role === 'manager') return true;
    return perms.includes('leads.update') && perms.includes('contacts.update');
  }, [isNew, contact, type, role, perms]);

  const phoneLabelText = (label) =>
    PHONE_LABEL_OPTIONS.find((o) => o.value === (label || 'mobile').toLowerCase())?.label ??
    (label || 'mobile');

  function formatCustomFieldForView(field) {
    const raw = formData?.customValuesMap?.[field.field_id];
    if (raw == null || raw === '') return '—';
    if (field.type === 'boolean') {
      return String(raw).toLowerCase() === 'true' || raw === '1' ? 'Yes' : 'No';
    }
    if (field.type === 'multiselect' || field.type === 'multiselect_dropdown') {
      const arr = parseMultiselectStored(raw);
      return arr.length ? arr.join(', ') : '—';
    }
    return formatViewText(raw);
  }

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
        description={pageDescriptionResolved}
        actions={
          <div className={styles.headerActions}>
            {!isNew ? (
              <>
                <Button variant="ghost" onClick={() => navigate(-1)}>
                  Back
                </Button>
                <div className={styles.viewEditToggle} role="group" aria-label="View or edit record">
                  <Button
                    type="button"
                    size="sm"
                    variant={!isEditing ? 'primary' : 'secondary'}
                    className={styles.viewEditToggleBtn}
                    onClick={isEditing ? handleCancelEdit : undefined}
                    aria-current={!isEditing ? 'true' : undefined}
                  >
                    View
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={isEditing ? 'primary' : 'secondary'}
                    className={styles.viewEditToggleBtn}
                    onClick={!isEditing ? handleEnterEdit : undefined}
                    aria-current={isEditing ? 'true' : undefined}
                  >
                    Edit
                  </Button>
                </div>
                {isEditing ? (
                  <>
                    <Button variant="ghost" onClick={handleCancelEdit}>
                      Cancel
                    </Button>
                    <Button type="submit" form="contact-record-form" loading={createMutation.loading || updateMutation.loading}>
                      Save
                    </Button>
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
                <Button type="submit" form="contact-record-form" loading={createMutation.loading || updateMutation.loading}>
                  Save
                </Button>
              </>
            )}
          </div>
        }
      />

      {submitError && <Alert variant="error">{submitError}</Alert>}
      {(isNew || isEditing) && formErrors.phones && <Alert variant="warning">{formErrors.phones}</Alert>}

      {isNew || isEditing ? (
      <form id="contact-record-form" onSubmit={handleSubmit} className={`${styles.form} ${styles.formCompact}`}>
        <div className={styles.formLayout}>
          <div className={styles.formLayoutCol}>
            {!isNew && contact ? (
              <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-record">
                <h2 id="contact-section-record" className={styles.sectionTitle}>
                  Record
                </h2>
                <div className={styles.recordMetaGrid}>
                  <ViewField label="Created">{formatRecordDate(contact.created_at)}</ViewField>
                  <ViewField label="Last updated">{formatRecordDate(contact.updated_at)}</ViewField>
                </div>
                {isEditing && canConvertRecordType ? (
                  <div className={styles.convertTypeRow}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setConvertTypeOpen(true)}>
                      {type === 'lead' ? 'Convert to contact' : 'Convert to lead'}
                    </Button>
                  </div>
                ) : null}
              </section>
            ) : null}
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

        <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-location">
          <h2 id="contact-section-location" className={styles.sectionTitle}>
            Location
          </h2>
          {showFormHints ? (
            <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>Street, city, and country used in lists and export.</p>
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
                label: s.name ? `${s.name}${s.code ? ` (${s.code})` : ''}` : s.code || s.id,
              }))}
            />
          </div>
        </section>
          </div>
          <div className={styles.formLayoutCol}>

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
                <div key={idx} className={`${styles.phoneRow} ${styles.phoneRowCompact}`}>
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

        <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-tags">
          <h2 id="contact-section-tags" className={styles.sectionTitle}>
            Tags
          </h2>
          {showFormHints ? (
            <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>Tenant tag catalog (Settings → Contact tags).</p>
          ) : null}
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
          <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-ownership">
            <h2 id="contact-section-ownership" className={styles.sectionTitle}>
              Ownership (optional)
            </h2>
            {showFormHints ? (
              <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>
                Optional manager, agent, and campaign; leave empty for unassigned pool.
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

        <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="contact-section-custom">
          <h2 id="contact-section-custom" className={styles.sectionTitle}>
            Custom fields
            {loadingCustomFields ? <span className={styles.loadingInline}>Loading…</span> : null}
          </h2>
          {showFormHints ? (
            <p className={`${styles.sectionDesc} ${styles.sectionDescShort}`}>Tenant-defined; blank clears on save.</p>
          ) : null}
          {!loadingCustomFields && customFields.length === 0 ? (
            <p className={styles.customEmpty}>No custom fields configured for this tenant.</p>
          ) : null}

          <div className={styles.customFieldsGridDense}>
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

              if (f.type === 'multiselect') {
                const selected = new Set(parseMultiselectStored(value).map(String));
                const setMultiselect = (nextSet) => {
                  const ordered = options.map(String).filter((o) => nextSet.has(o));
                  const nextMap = { ...(formData.customValuesMap || {}) };
                  nextMap[f.field_id] = ordered.length ? JSON.stringify(ordered) : '';
                  setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                };
                return (
                  <div key={f.field_id} className={styles.customFieldFull}>
                    <div className={styles.customMultiselectLabel}>{f.label}</div>
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
                      label={f.label}
                      options={options}
                      value={value}
                      placeholder="Select…"
                      searchable={options.length > 12}
                      onChange={(next) => {
                        const nextMap = { ...(formData.customValuesMap || {}) };
                        nextMap[f.field_id] = next;
                        setFormData((prev) => ({ ...prev, customValuesMap: nextMap }));
                      }}
                    />
                  </div>
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
          </div>
        </div>
      </form>
      ) : (
        <div className={`${styles.form} ${styles.formCompact} ${styles.viewShell}`} aria-live="polite">
          <div className={styles.formLayout}>
            <div className={styles.formLayoutCol}>
              {!isNew && contact ? (
                <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-record">
                  <h2 id="view-section-record" className={styles.sectionTitle}>
                    Record
                  </h2>
                  <div className={styles.recordMetaGrid}>
                    <ViewField label="Created">{formatRecordDate(contact.created_at)}</ViewField>
                    <ViewField label="Last updated">{formatRecordDate(contact.updated_at)}</ViewField>
                  </div>
                </section>
              ) : null}
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

              <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-status">
                <h2 id="view-section-status" className={styles.sectionTitle}>
                  Status
                </h2>
                <div className={styles.fieldGridDense}>
                  <ViewField label="Contact status">{statusDisplay}</ViewField>
                </div>
              </section>
            </div>

            <div className={styles.formLayoutCol}>
              <section className={`${styles.section} ${styles.sectionCompact}`} aria-labelledby="view-section-phones">
                <h2 id="view-section-phones" className={styles.sectionTitle}>
                  Phone numbers
                </h2>
                <ul className={styles.viewPhoneList}>
                  {(formData.phones || []).map((p, idx) => {
                    const num = String(p.number || '').trim();
                    const line = num
                      ? `${p.country_code || DEFAULT_COUNTRY_CODE} ${num} · ${phoneLabelText(p.label)}${p.is_primary ? ' · Primary' : ''}`
                      : `${p.country_code || DEFAULT_COUNTRY_CODE} (no number) · ${phoneLabelText(p.label)}`;
                    return (
                      <li key={idx} className={styles.viewPhoneItem}>
                        {line}
                      </li>
                    );
                  })}
                </ul>
              </section>

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

              {!isNew && (role === 'admin' || role === 'manager') ? (
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
              ) : null}

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
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={convertTypeOpen}
        onClose={() => {
          if (!convertTypeMutation.loading) setConvertTypeOpen(false);
        }}
        onConfirm={async () => {
          const nextType = type === 'lead' ? 'contact' : 'lead';
          const result = await convertTypeMutation.mutate(nextType);
          if (result?.success) {
            setConvertTypeOpen(false);
            navigate(nextType === 'contact' ? `/contacts/${id}?mode=view` : `/leads/${id}?mode=view`, { replace: true });
          }
        }}
        title={type === 'lead' ? 'Convert to contact?' : 'Convert to lead?'}
        message={
          type === 'lead'
            ? 'This record will be treated as a contact (same phone and details can also exist as a separate lead). Continue?'
            : 'This record will be treated as a lead. Continue?'
        }
        confirmText={type === 'lead' ? 'Convert to contact' : 'Convert to lead'}
        variant="primary"
        loading={convertTypeMutation.loading}
      />

      {!isNew && contact ? (
        <ContactOpportunitiesSection contactId={id} contactType={contact.type || type} />
      ) : null}
    </div>
  );
}

