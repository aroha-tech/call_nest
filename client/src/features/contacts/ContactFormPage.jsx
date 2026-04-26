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
import { ViewIcon, EditIcon, BlacklistIcon } from '../../components/ui/ActionIcons';
import { contactsAPI } from '../../services/contactsAPI';
import { tenantIndustryFieldsAPI } from '../../services/tenantIndustryFieldsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { campaignsAPI } from '../../services/campaignsAPI';
import { contactTagsAPI } from '../../services/contactTagsAPI';
import { contactBlacklistAPI } from '../../services/contactBlacklistAPI';
import { ContactOpportunitiesSection } from './ContactOpportunitiesSection';
import { ContactCallHistorySection } from './ContactCallHistorySection';
import { useContactStatusesOptions } from '../disposition/hooks/useMasterData';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import { usePermission, usePermissions } from '../../hooks/usePermission';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import { useToast } from '../../context/ToastContext';
import { getMe as getMeAPI } from '../auth/authAPI';
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  PHONE_NATIONAL_MAX_DIGITS,
  splitE164ToParts,
  getCallingCodeOptionsForSelect,
  normalizeCallingCode,
  clampNationalDigits,
  onlyNationalDigits,
} from '../../utils/phoneInput';
import { ContactFormSectionLayout } from './ContactFormSectionLayout';
import {
  CONTACT_FORM_SECTION_IDS,
  createDefaultContactFormLayout,
  loadContactFormColumns,
  saveContactFormColumns,
  reconcileContactFormColumns,
} from './contactFormLayout';
import { createContactFormEditSectionRenderers } from './contactFormEditRenderers';
import { createContactFormViewSectionRenderers } from './contactFormViewRenderers';
import styles from './ContactFormPage.module.scss';

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

function isRequiredFlag(v) {
  return v === 1 || v === true || v === '1';
}

/** Accepts full URLs or bare domains like example.com (no https/www required). */
function isValidWebsiteLoose(raw) {
  const s = String(raw || '').trim();
  if (!s) return true;
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return !!u.host;
    } catch {
      return false;
    }
  }
  return (
    /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}([/?#].*)?$/i.test(s) || /^localhost(:\d+)?([/?#].*)?$/i.test(s)
  );
}

function formHasAnyEnteredPhone(phones) {
  for (const p of phones || []) {
    if (onlyNationalDigits(p?.number || '').length > 0) return true;
  }
  return false;
}

/** Whether value is missing/invalid for a required tenant or industry dynamic field. */
function isTypedDynamicFieldValueEmpty(fieldType, raw) {
  if (raw === undefined || raw === null) return true;
  if (fieldType === 'boolean') {
    return String(raw).trim() === '';
  }
  if (fieldType === 'multiselect' || fieldType === 'multiselect_dropdown') {
    return parseMultiselectStored(raw).length === 0;
  }
  if (fieldType === 'number') {
    const s = String(raw).trim();
    if (s === '') return true;
    return !Number.isFinite(Number(s.replace(/,/g, '')));
  }
  return String(raw).trim() === '';
}

function requiredLabelText(label, required) {
  const base = label || '';
  return required ? `${base} *` : base;
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
  const { formatDateTime } = useDateTimeDisplay();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get('mode');
  const authUser = useAppSelector(selectUser);
  const role = authUser?.role ?? 'agent';
  const { canAny } = usePermissions();
  const id = params.id;
  const isLeadRoute = location.pathname.startsWith('/leads');
  const canOpenActivity =
    !!id && (isLeadRoute ? canAny(['leads.read']) : canAny(['contacts.read']));
  const isNew = !id || id === 'new';
  const type = defaultType; // 'lead' or 'contact' from route wrapper
  const canDeleteRBAC = usePermission(type === 'lead' ? 'leads.delete' : 'contacts.delete');

  const [customFields, setCustomFields] = useState([]);
  const [industryFieldDefs, setIndustryFieldDefs] = useState([]);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [campaignList, setCampaignList] = useState([]);
  const [contactTagOptions, setContactTagOptions] = useState([]);
  const { data: contactStatuses = [], loading: contactStatusesLoading } = useContactStatusesOptions();
  const [loadingCustomFields, setLoadingCustomFields] = useState(false);
  const [loadingIndustryFields, setLoadingIndustryFields] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [convertTypeOpen, setConvertTypeOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [blacklistConfirmOpen, setBlacklistConfirmOpen] = useState(false);
  const [blacklistScope, setBlacklistScope] = useState('record');
  const [blacklistPhoneE164, setBlacklistPhoneE164] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsMenuRef = useRef(null);
  const [agentDeleteFlags, setAgentDeleteFlags] = useState(null);
  const didApplyNewStatusDefault = useRef(false);
  const editSnapshotRef = useRef(null);
  const [isEditing, setIsEditing] = useState(() => !!isNew);
  const [layoutEditMode, setLayoutEditMode] = useState(false);
  const [formColumns, setFormColumns] = useState(() => loadContactFormColumns(type));

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
    phones: [{ country_code: DEFAULT_PHONE_COUNTRY_CODE, number: '', label: 'mobile', is_primary: true }],
    customValuesMap: {},
    industryValuesMap: {},
    manager_id: '',
    assigned_user_id: '',
    campaign_id: '',
    tag_ids: [],
    status_id: '',
    notes: '',
  });

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
  const deleteMutation = useMutation((delId) => contactsAPI.remove(delId, { deleted_source: 'manual' }));
  const blacklistMutation = useMutation((payload) => contactBlacklistAPI.add(payload));

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

  const fetchIndustryFields = useCallback(async () => {
    setLoadingIndustryFields(true);
    try {
      const res = await tenantIndustryFieldsAPI.getDefinitions();
      setIndustryFieldDefs(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch {
      setIndustryFieldDefs([]);
    } finally {
      setLoadingIndustryFields(false);
    }
  }, []);

  useEffect(() => {
    fetchIndustryFields();
  }, [fetchIndustryFields]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await contactTagsAPI.list();
        if (cancelled) return;
        const rows = res?.data?.data ?? [];
        setContactTagOptions(rows.map((t) => ({ value: String(t.id), label: t.name || '—' })));
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
    if (isNew || !id) return;
    let cancelled = false;
    (async () => {
      try {
        if (role !== 'agent' || canDeleteRBAC || !authUser?.id) {
          if (!cancelled) setAgentDeleteFlags(null);
          return;
        }
        const res = await getMeAPI();
        const d = res?.data;
        if (!cancelled && d) {
          setAgentDeleteFlags({
            agent_can_delete_leads: !!d.agent_can_delete_leads,
            agent_can_delete_contacts: !!d.agent_can_delete_contacts,
          });
        } else if (!cancelled) {
          setAgentDeleteFlags(null);
        }
      } catch {
        if (!cancelled) setAgentDeleteFlags(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, id, role, canDeleteRBAC, authUser?.id]);

  const canDelete = useMemo(() => {
    if (isNew) return false;
    if (canDeleteRBAC) return true;
    if (role !== 'agent' || !agentDeleteFlags) return false;
    if (type === 'lead') return agentDeleteFlags.agent_can_delete_leads;
    return agentDeleteFlags.agent_can_delete_contacts;
  }, [isNew, canDeleteRBAC, role, agentDeleteFlags, type]);
  const isBlacklistedContact = !!contact?.is_blacklisted_contact;

  useEffect(() => {
    didApplyNewStatusDefault.current = false;
  }, [location.pathname]);

  useEffect(() => {
    editSnapshotRef.current = null;
  }, [id]);

  useEffect(() => {
    if (!actionsOpen) return;
    const onDocClick = (event) => {
      if (actionsMenuRef.current?.contains(event.target)) return;
      setActionsOpen(false);
    };
    const onEsc = (event) => {
      if (event.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [actionsOpen]);

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
      ? contactPhones.map((p) => {
          const parts = splitE164ToParts(p.phone);
          return {
            country_code: parts.country_code,
            number: parts.national,
            label: p.label || 'mobile',
            is_primary: !!p.is_primary,
            is_blacklisted: !!p.is_blacklisted_number,
          };
        })
      : [{ country_code: DEFAULT_PHONE_COUNTRY_CODE, number: '', label: 'mobile', is_primary: true }];
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
      industryValuesMap: (() => {
        const p = contact.industry_profile;
        if (!p || typeof p !== 'object') return {};
        const out = {};
        for (const [k, v] of Object.entries(p)) {
          if (v === null || v === undefined) out[k] = '';
          else if (Array.isArray(v)) out[k] = JSON.stringify(v);
          else if (typeof v === 'boolean') out[k] = v ? '1' : '0';
          else out[k] = String(v);
        }
        return out;
      })(),
      manager_id: contact.manager_id != null ? String(contact.manager_id) : '',
      assigned_user_id: contact.assigned_user_id != null ? String(contact.assigned_user_id) : '',
      campaign_id: contact.campaign_id != null ? String(contact.campaign_id) : '',
      tag_ids: Array.isArray(contact.tag_ids)
        ? contact.tag_ids.map((x) => String(x))
        : Array.isArray(contact.tags)
          ? contact.tags.map((t) => String(t.id))
          : [],
      status_id: contact.status_id != null ? String(contact.status_id) : '',
      notes: contact.notes != null ? String(contact.notes) : '',
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
        .map((u) => ({ value: String(u.id), label: u.name || u.email || '—' }))
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
      .map((u) => ({ value: String(u.id), label: u.name || u.email || '—' }))
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
          label: `${u.name || u.email || '—'} (current — not under selected manager)`,
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

  // Admin: no manager on record + pick agent → set owning manager from that agent (matches bulk assign / server rules).
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
        label: c.name || '—',
      })),
    [campaignList]
  );

  const clearDynamicFieldError = useCallback((scope, id) => {
    const key = `${scope}:${id}`;
    setFormErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const buildSubmitPayload = () => {
    const phones = (formData.phones || []).map((p) => {
      const normalizedCc = normalizeCallingCode(p.country_code || DEFAULT_PHONE_COUNTRY_CODE);
      const num = clampNationalDigits(p.number || '');
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

    let industry_profile;
    if (industryFieldDefs.length > 0) {
      const o = {};
      for (const f of industryFieldDefs) {
        const raw = formData?.industryValuesMap?.[f.field_key];
        const empty = raw === undefined || raw === null || String(raw).trim() === '';
        if (empty) continue;
        if (f.type === 'boolean') {
          const s = String(raw).toLowerCase();
          o[f.field_key] = ['1', 'true', 'yes', 'on'].includes(s);
        } else if (f.type === 'number') {
          o[f.field_key] = Number(String(raw).replace(/,/g, ''));
        } else if (f.type === 'multiselect' || f.type === 'multiselect_dropdown') {
          o[f.field_key] = parseMultiselectStored(raw);
        } else {
          o[f.field_key] = String(raw).trim();
        }
      }
      industry_profile = o;
    }

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
      notes: formData.notes?.trim() ? String(formData.notes).trim() : null,
      tag_ids: (formData.tag_ids || []).map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0),
      phones,
      custom_fields,
      ...(industry_profile !== undefined ? { industry_profile } : {}),
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
      errs.display_name = 'Display name is required';
    }
    const hasEmail = !!(formData.email && String(formData.email).trim());
    const hasPhone = formHasAnyEnteredPhone(formData.phones);
    if (!hasEmail && !hasPhone) {
      errs.contact_channel = 'Enter an email or at least one phone number';
    }
    const phoneErr = uniqueLabelError(formData.phones);
    if (phoneErr) errs.phones = phoneErr;
    // Optional: validate phone format for rows where number entered
    for (const p of formData.phones || []) {
      const digits = onlyNationalDigits(p.number);
      if (digits.length > 0 && digits.length !== PHONE_NATIONAL_MAX_DIGITS) {
        errs.phones = `Phone number must be exactly ${PHONE_NATIONAL_MAX_DIGITS} digits`;
        break;
      }
    }

    for (const f of industryFieldDefs) {
      if (!isRequiredFlag(f.is_required)) continue;
      const raw = formData?.industryValuesMap?.[f.field_key];
      if (isTypedDynamicFieldValueEmpty(f.type, raw)) {
        errs[`industry:${f.field_key}`] = `${f.label || f.field_key} is required`;
      }
    }

    for (const f of customFields) {
      if (!isRequiredFlag(f.is_required)) continue;
      const raw = formData?.customValuesMap?.[f.field_id];
      if (isTypedDynamicFieldValueEmpty(f.type, raw)) {
        errs[`custom:${f.field_id}`] = `${f.label || f.name || 'Field'} is required`;
      }
    }

    const w = formData.website?.trim();
    if (w && !isValidWebsiteLoose(w)) {
      errs.website = 'Enter a valid website or domain (e.g. example.com)';
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
    setLayoutEditMode(false);
    setSubmitError(null);
    setFormErrors({});
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('mode', 'edit');
      return p;
    }, { replace: true });
  }, [formData, setSearchParams]);

  const handleCancelEdit = useCallback(() => {
    if (editSnapshotRef.current) {
      setFormData(editSnapshotRef.current);
      editSnapshotRef.current = null;
    }
    setIsEditing(false);
    setLayoutEditMode(false);
    setSubmitError(null);
    setFormErrors({});
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('mode', 'view');
      return p;
    }, { replace: true });
  }, [setSearchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const errs = validate();
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) {
      const messages = [...new Set(Object.values(errs))];
      const summary = messages.slice(0, 4).join(' ');
      showToast(summary || 'Please fix the highlighted fields.', 'warning');
      return;
    }

    const payload = buildSubmitPayload();
    const result = isNew ? await createMutation.mutate(payload) : await updateMutation.mutate(payload);
    if (result?.success) {
      if (isNew) {
        navigate(type === 'lead' ? '/leads' : '/contacts');
      } else {
        await refetchContact();
        setIsEditing(false);
        setLayoutEditMode(false);
        editSnapshotRef.current = null;
        setSearchParams((prev) => {
          const p = new URLSearchParams(prev);
          p.set('mode', 'view');
          return p;
        }, { replace: true });
      }
    } else {
      setSubmitError(result?.error || 'Save failed');
    }
  };

  const title = isNew ? `Add ${type === 'lead' ? 'Lead' : 'Contact'}` : `Edit ${type === 'lead' ? 'Lead' : 'Contact'}`;
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
    if (!s) return '—';
    const name = s.name || '';
    const code = s.code ? ` (${s.code})` : '';
    return `${name}${code}`.trim() || '—';
  }, [contactStatuses, formData.status_id]);

  const managerDisplay = useMemo(() => {
    if (!formData.manager_id) return '—';
    return (
      managerSelectOptions.find((o) => o.value === String(formData.manager_id))?.label ??
      tenantUsers.find((u) => String(u.id) === String(formData.manager_id))?.name ??
      '—'
    );
  }, [formData.manager_id, managerSelectOptions, tenantUsers]);

  const agentDisplay = useMemo(() => {
    if (!formData.assigned_user_id) return '—';
    return (
      agentSelectOptions.find((o) => o.value === String(formData.assigned_user_id))?.label ??
      tenantUsers.find((u) => String(u.id) === String(formData.assigned_user_id))?.name ??
      '—'
    );
  }, [formData.assigned_user_id, agentSelectOptions, tenantUsers]);

  const campaignDisplay = useMemo(() => {
    if (!formData.campaign_id) return '—';
    return (
      campaignSelectOptions.find((o) => o.value === String(formData.campaign_id))?.label ??
      '—'
    );
  }, [formData.campaign_id, campaignSelectOptions]);

  const perms = authUser?.permissions ?? [];

  const canConvertRecordType = useMemo(() => {
    if (isNew || !contact) return false;
    if (String(contact.type) !== String(type)) return false;
    if (role === 'admin' || role === 'manager') return true;
    return perms.includes('leads.update') && perms.includes('contacts.update');
  }, [isNew, contact, type, role, perms]);

  const formLayoutVisibility = useMemo(() => {
    const s = new Set([
      CONTACT_FORM_SECTION_IDS.IDENTITY,
      CONTACT_FORM_SECTION_IDS.LOCATION,
      CONTACT_FORM_SECTION_IDS.TAGS_NOTES_STATUS,
      CONTACT_FORM_SECTION_IDS.PHONES,
      CONTACT_FORM_SECTION_IDS.INDUSTRY,
      CONTACT_FORM_SECTION_IDS.CUSTOM,
    ]);
    if (!isNew && contact) s.add(CONTACT_FORM_SECTION_IDS.RECORD);
    const showAssignment =
      (role === 'admin' && isNew) ||
      (role === 'manager' && isNew) ||
      (role === 'agent' && isNew && type === 'lead') ||
      (!isNew && (role === 'admin' || role === 'manager'));
    if (showAssignment) s.add(CONTACT_FORM_SECTION_IDS.ASSIGNMENT);
    return s;
  }, [isNew, contact, role, type]);

  useEffect(() => {
    const loaded = loadContactFormColumns(type);
    setFormColumns(reconcileContactFormColumns(loaded, formLayoutVisibility, type));
  }, [type, formLayoutVisibility]);

  useEffect(() => {
    saveContactFormColumns(type, formColumns);
  }, [type, formColumns]);

  const editSectionRenderers = createContactFormEditSectionRenderers({
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
    formatDateTime,
    canBlacklistPhone: !isNew && isEditing,
    onBlacklistPhone: (phoneE164) => {
      if (!phoneE164) return;
      setBlacklistPhoneE164(phoneE164);
      setBlacklistScope('number');
      setBlacklistConfirmOpen(true);
    },
    onOpenBlacklistPageForPhone: (phoneE164) => {
      if (!phoneE164) return;
      navigate(`/blacklist?search=${encodeURIComponent(phoneE164)}`);
    },
  });

  const renderEditSection = (sectionId) => editSectionRenderers[sectionId]?.() ?? null;

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

  function formatIndustryFieldForView(field) {
    const raw = formData?.industryValuesMap?.[field.field_key];
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

  const viewSectionRenderers = createContactFormViewSectionRenderers({
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
    formatDateTime,
  });
  const renderViewSection = (sectionId) => viewSectionRenderers[sectionId]?.() ?? null;

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
        <Alert variant="error" display="inline">
          {contactError}
        </Alert>
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
                    <span className={styles.viewEditToggleLabel}>
                      <ViewIcon className={styles.viewEditToggleGlyph} />
                      View
                    </span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={isEditing ? 'primary' : 'secondary'}
                    className={styles.viewEditToggleBtn}
                    onClick={!isEditing ? handleEnterEdit : undefined}
                    aria-current={isEditing ? 'true' : undefined}
                  >
                    <span className={styles.viewEditToggleLabel}>
                      <EditIcon className={styles.viewEditToggleGlyph} />
                      Edit
                    </span>
                  </Button>
                </div>
                <div className={styles.headerMenuWrap} ref={actionsMenuRef}>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setActionsOpen((v) => !v)}>
                    <span className={styles.actionsButtonInner}>
                      Actions
                      <span className={styles.actionsButtonChevron} aria-hidden>
                        ▾
                      </span>
                    </span>
                  </Button>
                  {actionsOpen ? (
                    <div className={styles.headerMenu}>
                      {canOpenActivity ? (
                        <button
                          type="button"
                          className={styles.headerMenuItem}
                          onClick={() => {
                            setActionsOpen(false);
                            navigate(
                              isLeadRoute
                                ? `/leads/${encodeURIComponent(String(id))}/activity`
                                : `/contacts/${encodeURIComponent(String(id))}/activity`
                            );
                          }}
                        >
                          <span className={styles.headerMenuItemIcon} aria-hidden>🕘</span>
                          Activity
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.headerMenuItem}
                        disabled={isBlacklistedContact}
                        onClick={() => {
                          setActionsOpen(false);
                          setBlacklistScope('record');
                          setBlacklistConfirmOpen(true);
                        }}
                      >
                        <span className={styles.headerMenuItemIcon} aria-hidden>
                          <BlacklistIcon className={styles.headerMenuGlyph} />
                        </span>
                        {isBlacklistedContact ? 'Already blacklisted' : 'Add to blacklist'}
                      </button>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            className={styles.headerMenuItem}
                            onClick={() => {
                              setActionsOpen(false);
                              setLayoutEditMode((v) => !v);
                            }}
                          >
                            <span className={styles.headerMenuItemIcon} aria-hidden>🧩</span>
                            {layoutEditMode ? 'Done arranging' : 'Arrange sections'}
                          </button>
                          {layoutEditMode ? (
                            <button
                              type="button"
                              className={styles.headerMenuItem}
                              onClick={() => {
                                setActionsOpen(false);
                                setFormColumns(
                                  reconcileContactFormColumns(
                                    createDefaultContactFormLayout(type),
                                    formLayoutVisibility,
                                    type
                                  )
                                );
                              }}
                            >
                              <span className={styles.headerMenuItemIcon} aria-hidden>↺</span>
                              Reset layout
                            </button>
                          ) : null}
                        </>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          className={`${styles.headerMenuItem} ${styles.headerMenuItemDanger}`}
                          onClick={() => {
                            setActionsOpen(false);
                            setDeleteConfirmOpen(true);
                          }}
                        >
                          <span className={styles.headerMenuItemIcon} aria-hidden>🗑</span>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ) : null}
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
                <Button type="button" variant="ghost" size="sm" onClick={() => setLayoutEditMode((v) => !v)}>
                  {layoutEditMode ? 'Done arranging' : 'Arrange sections'}
                </Button>
                {layoutEditMode ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFormColumns(
                        reconcileContactFormColumns(createDefaultContactFormLayout(type), formLayoutVisibility, type)
                      );
                    }}
                  >
                    Reset layout
                  </Button>
                ) : null}
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
      {(isNew || isEditing) && formErrors.contact_channel && !formErrors.phones && (
        <Alert variant="warning" display="inline">
          {formErrors.contact_channel}
        </Alert>
      )}

      {isNew || isEditing ? (
      <form
        id="contact-record-form"
        onSubmit={handleSubmit}
        noValidate
        className={`${styles.form} ${styles.formCompact}`}
      >
        <ContactFormSectionLayout
          layoutEditMode={layoutEditMode && (isNew || isEditing)}
          columns={formColumns}
          onColumnsChange={setFormColumns}
          renderSection={renderEditSection}
        />
      </form>
      ) : (
        <div className={`${styles.form} ${styles.formCompact} ${styles.viewShell}`} aria-live="polite">
          <ContactFormSectionLayout
            layoutEditMode={false}
            columns={formColumns}
            onColumnsChange={setFormColumns}
            renderSection={renderViewSection}
          />
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

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          if (!deleteMutation.loading) setDeleteConfirmOpen(false);
        }}
        onConfirm={async () => {
          if (!id || id === 'new') return;
          const result = await deleteMutation.mutate(id);
          if (result?.success) {
            setDeleteConfirmOpen(false);
            navigate(type === 'lead' ? '/leads' : '/contacts');
          } else if (result?.error) {
            setSubmitError(result.error);
          }
        }}
        title={`Delete ${type === 'lead' ? 'Lead' : 'Contact'}`}
        message={`Are you sure you want to delete "${contact?.display_name || formData?.display_name || formData?.first_name || formData?.email || 'this record'}"? This removes it from your workspace lists.`}
        confirmText="Delete"
        loading={deleteMutation.loading}
      />

      <ConfirmModal
        isOpen={blacklistConfirmOpen}
        onClose={() => {
          if (!blacklistMutation.loading) setBlacklistConfirmOpen(false);
        }}
        onConfirm={async () => {
          if (!id || id === 'new') return;
          const payload =
            blacklistScope === 'number'
              ? {
                  block_scope: 'number',
                  contact_id: Number(id),
                  phone_e164: blacklistPhoneE164 || null,
                  reason: 'Added from record actions',
                }
              : {
                  block_scope: contact?.type === 'lead' ? 'lead' : 'contact',
                  contact_id: Number(id),
                  reason: 'Added from record actions',
                };
          const result = await blacklistMutation.mutate(payload);
          if (result?.success) {
            setBlacklistConfirmOpen(false);
            setBlacklistPhoneE164('');
            await refetchContact();
          } else if (result?.error) {
            setSubmitError(result.error);
          }
        }}
        title={blacklistScope === 'number' ? 'Blacklist number' : `Blacklist ${type === 'lead' ? 'Lead' : 'Contact'}`}
        message={
          blacklistScope === 'number'
            ? `Blacklist "${blacklistPhoneE164 || 'this number'}" for this tenant?`
            : `Blacklist "${contact?.display_name || formData?.display_name || 'this record'}" for this tenant?`
        }
        confirmText="Add to blacklist"
        loading={blacklistMutation.loading}
      />

      {!isNew && contact ? (
        <>
          <ContactCallHistorySection key={id} contactId={id} />
          <ContactOpportunitiesSection
            contactId={id}
            contactType={contact.type || type}
            accountName={contact?.company || ''}
          />
        </>
      ) : null}
    </div>
  );
}

