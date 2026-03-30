import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../components/ui/Table';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { SearchInput } from '../components/ui/SearchInput';
import { StatusBadge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/IconButton';
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import listStyles from '../components/admin/adminDataList.module.scss';
import { FilterBar } from '../components/admin/FilterBar';
import { tenantsAPI } from '../services/adminAPI';
import { industriesAPI } from '../services/dispositionAPI';
import { getTenantSlugStatus } from '../features/auth/authAPI';
import {
  slugFromCompanyName,
  validateSlug,
  describeTenantSlugSourceIssue,
} from '../features/auth/utils/slugUtils';
import { useMutation } from '../hooks/useAsyncData';
import { useTableLoadingState } from '../hooks/useTableLoadingState';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import { TenantWorkspaceUrlCopy } from '../components/admin/TenantWorkspaceUrlCopy';
import styles from './TenantsPage.module.scss';

function emptyThemeFormFields() {
  return {
    theme_primary: '',
    theme_logo_url: '',
    theme_workspace_title: '',
    theme_radius_px: '',
    theme_font_preset: 'inter',
    theme_gradient_start: '',
    theme_gradient_end: '',
  };
}

function themeFieldsFromRow(row) {
  let t = row?.theme_json;
  if (typeof t === 'string') {
    try {
      t = JSON.parse(t);
    } catch {
      t = null;
    }
  }
  if (!t || typeof t !== 'object') {
    return emptyThemeFormFields();
  }
  return {
    theme_primary: typeof t.primary === 'string' ? t.primary : '',
    theme_logo_url: typeof t.logoUrl === 'string' ? t.logoUrl : '',
    theme_workspace_title: typeof t.workspaceTitle === 'string' ? t.workspaceTitle : '',
    theme_radius_px: t.radiusPx != null && t.radiusPx !== '' ? String(t.radiusPx) : '',
    theme_font_preset: t.fontPreset === 'system' ? 'system' : 'inter',
    theme_gradient_start: typeof t.gradientStart === 'string' ? t.gradientStart : '',
    theme_gradient_end: typeof t.gradientEnd === 'string' ? t.gradientEnd : '',
  };
}

/** @returns {{ value: object|null, error?: string }} */
function themePayloadFromForm(form) {
  const o = {};
  const p = form.theme_primary?.trim();
  if (p) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(p)) {
      return { value: null, error: 'Brand color must be #RRGGBB (six hex digits).' };
    }
    o.primary = p.toLowerCase();
  }
  const logo = form.theme_logo_url?.trim();
  if (logo) {
    try {
      const u = new URL(logo);
      if (u.protocol !== 'https:') {
        return { value: null, error: 'Logo URL must use https://' };
      }
    } catch {
      return { value: null, error: 'Logo URL must be a valid https URL.' };
    }
    o.logoUrl = logo;
  }
  const wt = form.theme_workspace_title?.trim();
  if (wt) o.workspaceTitle = wt.slice(0, 120);
  const gs = form.theme_gradient_start?.trim();
  if (gs) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(gs)) {
      return { value: null, error: 'Gradient start must be #RRGGBB.' };
    }
    o.gradientStart = gs.toLowerCase();
  }
  const ge = form.theme_gradient_end?.trim();
  if (ge) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(ge)) {
      return { value: null, error: 'Gradient end must be #RRGGBB.' };
    }
    o.gradientEnd = ge.toLowerCase();
  }
  if (form.theme_font_preset === 'system') o.fontPreset = 'system';
  const rp = form.theme_radius_px;
  if (rp !== '' && rp != null && String(rp).trim() !== '') {
    const n = parseInt(String(rp).trim(), 10);
    if (Number.isNaN(n) || n < 4 || n > 24) {
      return { value: null, error: 'Corner radius must be between 4 and 24 (pixels).' };
    }
    o.radiusPx = n;
  }
  if (Object.keys(o).length === 0) return { value: null };
  return { value: o };
}

const defaultForm = () => ({
  name: '',
  slug: '',
  industry_id: '',
  is_enabled: true,
  admin_email: '',
  admin_password: '',
  admin_name: '',
  whatsapp_send_mode: 'manual',
  whatsapp_module_enabled: false,
  whatsapp_automation_enabled: false,
  email_communication_enabled: false,
  email_module_enabled: false,
  email_automation_enabled: false,
  ...emptyThemeFormFields(),
});

const SLUG_DEBOUNCE_MS = 400;

const FILTER_ALL = '__all__';

function formatTenantDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString(undefined, { dateStyle: 'medium' }) +
      ' ' +
      d.toLocaleTimeString(undefined, { timeStyle: 'short' })
    );
  } catch {
    return '—';
  }
}

/** Parsed non-negative int, or undefined if empty/invalid */
function parseUsersFilterInt(s) {
  if (s == null || String(s).trim() === '') return undefined;
  const n = parseInt(String(s).trim(), 10);
  if (Number.isNaN(n) || n < 0) return undefined;
  return n;
}

function normRangeStr(s) {
  return String(s ?? '').trim();
}

/** Quick presets + custom min/max; values match API draft strings */
const USER_SIZE_PRESETS = [
  { id: 'any', label: 'Any', min: '', max: '' },
  { id: 'zero', label: '0', min: '0', max: '0' },
  { id: 's1_5', label: '1–5', min: '1', max: '5' },
  { id: 's6_20', label: '6–20', min: '6', max: '20' },
  { id: 's21p', label: '21+', min: '21', max: '' },
];

function getActiveUserSizePreset(minS, maxS) {
  const m = normRangeStr(minS);
  const x = normRangeStr(maxS);
  for (const p of USER_SIZE_PRESETS) {
    if (normRangeStr(p.min) === m && normRangeStr(p.max) === x) {
      return p.id;
    }
  }
  return null;
}

export function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [draftIndustryFilter, setDraftIndustryFilter] = useState(FILTER_ALL);
  const [appliedIndustryFilter, setAppliedIndustryFilter] = useState(FILTER_ALL);
  const [draftMinUsers, setDraftMinUsers] = useState('');
  const [draftMaxUsers, setDraftMaxUsers] = useState('');
  const [appliedMinUsers, setAppliedMinUsers] = useState('');
  const [appliedMaxUsers, setAppliedMaxUsers] = useState('');
  const [filterError, setFilterError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState({});
  const [industryOptions, setIndustryOptions] = useState([]);
  /** Create modal: slug field mirrors registration rules + availability API */
  const [slugInputRaw, setSlugInputRaw] = useState('');
  const [slugAutoFromName, setSlugAutoFromName] = useState(true);
  const [slugSourceError, setSlugSourceError] = useState(null);
  const [slugRemote, setSlugRemote] = useState({
    loading: false,
    available: null,
    message: null,
    suggestions: [],
  });
  const slugReqId = useRef(0);

  const clearFormErr = useCallback((...keys) => {
    setFormErrors((prev) => {
      let next = prev;
      let changed = false;
      for (const key of keys) {
        if (next[key]) {
          if (!changed) {
            next = { ...prev };
            changed = true;
          }
          delete next[key];
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tenantsAPI.getAll({
        search,
        includeDisabled: showDisabled,
        page: pagination.page,
        limit: pagination.limit,
        industryId: appliedIndustryFilter,
        minUsers: appliedMinUsers,
        maxUsers: appliedMaxUsers,
      });
      setTenants(res.data?.data || []);
      setPagination(res.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [
    search,
    showDisabled,
    pagination.page,
    pagination.limit,
    appliedIndustryFilter,
    appliedMinUsers,
    appliedMaxUsers,
  ]);

  const { hasCompletedInitialFetch } = useTableLoadingState(loading);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const handleSearch = useCallback((value) => {
    setSearch(value);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const handlePageChange = useCallback((next) => {
    setPagination((p) => ({ ...p, page: next }));
  }, []);

  const handleLimitChange = useCallback((next) => {
    setPagination((p) => ({ ...p, limit: next, page: 1 }));
  }, []);

  useEffect(() => {
    industriesAPI
      .getOptions()
      .then((res) => {
        const list = res.data?.data || [];
        setIndustryOptions(list.map((i) => ({ value: i.id, label: i.name })));
      })
      .catch(() => setIndustryOptions([]));
  }, []);

  useEffect(() => {
    if (!modalOpen || editing) {
      return;
    }
    const localErr = validateSlug(form.slug);
    if (localErr || slugSourceError) {
      setSlugRemote({ loading: false, available: null, message: null, suggestions: [] });
      return;
    }
    const trimmed = form.slug.trim();
    if (!trimmed) {
      setSlugRemote({ loading: false, available: null, message: null, suggestions: [] });
      return;
    }
    const reqId = ++slugReqId.current;
    setSlugRemote((s) => ({ ...s, loading: true }));
    const t = setTimeout(async () => {
      try {
        const data = await getTenantSlugStatus(trimmed);
        if (slugReqId.current !== reqId) return;
        if (!data.valid) {
          setSlugRemote({
            loading: false,
            available: false,
            message: data.error,
            suggestions: data.suggestions || [],
          });
          return;
        }
        if (!data.available) {
          setSlugRemote({
            loading: false,
            available: false,
            message: data.error,
            suggestions: data.suggestions || [],
          });
          return;
        }
        setSlugRemote({ loading: false, available: true, message: null, suggestions: [] });
      } catch {
        if (slugReqId.current !== reqId) return;
        setSlugRemote({ loading: false, available: null, message: null, suggestions: [] });
      }
    }, SLUG_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [modalOpen, editing, form.slug, slugSourceError]);

  const createMutation = useMutation((data) => tenantsAPI.create(data));
  const updateMutation = useMutation((id, data) => tenantsAPI.update(id, data));

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm());
    setFormErrors({});
    setSlugInputRaw('');
    setSlugAutoFromName(true);
    setSlugSourceError(null);
    setSlugRemote({ loading: false, available: null, message: null, suggestions: [] });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setSlugInputRaw(row.slug || '');
    setSlugAutoFromName(false);
    setSlugSourceError(null);
    setSlugRemote({ loading: false, available: null, message: null, suggestions: [] });
    setForm({
      name: row.name || '',
      slug: row.slug || '',
      industry_id: row.industry_id || '',
      is_enabled: !!row.is_enabled,
      whatsapp_send_mode: row.whatsapp_send_mode === 'automatic' ? 'automatic' : 'manual',
      whatsapp_module_enabled: !!row.whatsapp_module_enabled,
      whatsapp_automation_enabled: !!row.whatsapp_automation_enabled,
      email_communication_enabled: !!row.email_communication_enabled,
      email_module_enabled: !!row.email_module_enabled,
      email_automation_enabled: !!row.email_automation_enabled,
      ...themeFieldsFromRow(row),
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const payloadFromForm = () => {
    const base = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      industry_id: form.industry_id || null,
      is_enabled: form.is_enabled ? 1 : 0,
      whatsapp_send_mode: form.whatsapp_send_mode,
      whatsapp_module_enabled: form.whatsapp_module_enabled ? 1 : 0,
      whatsapp_automation_enabled: form.whatsapp_automation_enabled ? 1 : 0,
      email_communication_enabled: form.email_communication_enabled ? 1 : 0,
      email_module_enabled: form.email_module_enabled ? 1 : 0,
      email_automation_enabled: form.email_automation_enabled ? 1 : 0,
    };
    if (!editing) {
      base.admin_email = form.admin_email?.trim() || '';
      base.admin_password = form.admin_password || '';
      base.admin_name = form.admin_name?.trim() || null;
    }
    return base;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    if (!form.name?.trim()) {
      setFormErrors({ name: 'Name is required' });
      return;
    }
    if (!form.slug?.trim()) {
      setFormErrors({ slug: 'Slug is required' });
      return;
    }
    if (!editing) {
      const srcErr = describeTenantSlugSourceIssue(slugInputRaw || form.slug);
      const fmtErr = validateSlug(form.slug.trim());
      if (srcErr) {
        setFormErrors({ slug: srcErr });
        return;
      }
      if (fmtErr) {
        setFormErrors({ slug: fmtErr });
        return;
      }
      if (slugRemote.loading) {
        setFormErrors({ slug: 'Please wait while we check availability.' });
        return;
      }
      if (slugRemote.available === false) {
        setFormErrors({
          slug: slugRemote.message || 'This workspace address is already in use.',
        });
        return;
      }
      if (!form.admin_email?.trim()) {
        setFormErrors({ admin_email: 'Admin email is required' });
        return;
      }
      if (!form.admin_password) {
        setFormErrors({ admin_password: 'Password is required for the first admin' });
        return;
      }
    }
    const payload = payloadFromForm();
    if (editing) {
      const tp = themePayloadFromForm(form);
      if (tp.error) {
        setFormErrors({ submit: tp.error });
        return;
      }
      payload.theme = tp.value;
    }
    const result = editing
      ? await updateMutation.mutate(editing.id, payload)
      : await createMutation.mutate(payload);
    if (result.success) {
      setModalOpen(false);
      fetchTenants();
    } else {
      const errMsg = result.error || '';
      if (!editing && /slug|already|workspace|address/i.test(errMsg)) {
        setFormErrors({ slug: errMsg, submit: errMsg });
      } else {
        setFormErrors({ submit: errMsg });
      }
    }
  };

  const slugFormatErrCreate =
    !editing && form.slug.trim() ? validateSlug(form.slug.trim()) : null;
  const slugDisplayError = editing
    ? formErrors.slug || null
    : formErrors.slug ||
      slugSourceError ||
      slugFormatErrCreate ||
      (slugRemote.available === false && slugRemote.message ? slugRemote.message : null) ||
      null;

  const slugHintParts = [];
  if (!editing) {
    if (!slugFormatErrCreate && !slugSourceError && slugRemote.loading) {
      slugHintParts.push('Checking availability…');
    }
    if (slugRemote.available === true) {
      slugHintParts.push('This address is available.');
    }
  }

  const showSlugSuggestions =
    !editing &&
    Array.isArray(slugRemote.suggestions) &&
    slugRemote.suggestions.length > 0 &&
    !slugRemote.loading;

  const applySuggestedSlug = (s) => {
    setSlugAutoFromName(false);
    setSlugInputRaw(s);
    setSlugSourceError(null);
    setForm((f) => ({ ...f, slug: s }));
    clearFormErr('slug', 'submit');
  };

  const industryFilterSelectOptions = [
    { value: FILTER_ALL, label: 'All industries' },
    { value: '__none__', label: 'No industry' },
    ...industryOptions,
  ];

  const activeUserSizePresetId = getActiveUserSizePreset(draftMinUsers, draftMaxUsers);

  const hasActiveTenantFilters =
    appliedIndustryFilter !== FILTER_ALL ||
    String(appliedMinUsers || '').trim() !== '' ||
    String(appliedMaxUsers || '').trim() !== '';

  return (
    <div className={styles.wrapper}>
      <div className={listStyles.page}>
        <PageHeader
          title="Tenants"
          description="Manage platform tenants and module access"
          actions={
            <Button variant="primary" onClick={openCreate}>
              Add Tenant
            </Button>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}
        {filterError && <Alert variant="error">{filterError}</Alert>}

        <FilterBar
          onApply={() => {
            const minP = parseUsersFilterInt(draftMinUsers);
            const maxP = parseUsersFilterInt(draftMaxUsers);
            if (minP !== undefined && maxP !== undefined && minP > maxP) {
              setFilterError('Min users cannot be greater than max users.');
              return;
            }
            setFilterError(null);
            setAppliedIndustryFilter(draftIndustryFilter);
            setAppliedMinUsers(draftMinUsers.trim());
            setAppliedMaxUsers(draftMaxUsers.trim());
            setPagination((p) => ({ ...p, page: 1 }));
          }}
          onReset={() => {
            setDraftIndustryFilter(FILTER_ALL);
            setAppliedIndustryFilter(FILTER_ALL);
            setDraftMinUsers('');
            setDraftMaxUsers('');
            setAppliedMinUsers('');
            setAppliedMaxUsers('');
            setFilterError(null);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
        >
          <div className={styles.tenantsFilterPanel}>
            <div className={styles.filterSection}>
              <span className={styles.filterSectionLabel} id="tenants-filter-industry-label">
                Industry
              </span>
              <Select
                aria-labelledby="tenants-filter-industry-label"
                value={draftIndustryFilter}
                onChange={(e) => setDraftIndustryFilter(e.target.value)}
                options={industryFilterSelectOptions}
                className={styles.filterSelectWide}
                placeholder="Choose industry…"
              />
            </div>
            <div className={styles.filterSectionGrow}>
              <span className={styles.filterSectionLabel} id="tenants-filter-team-label">
                Team size (users)
              </span>
              <div className={styles.teamSizeRow}>
                <div
                  className={styles.segmentGroup}
                  role="group"
                  aria-labelledby="tenants-filter-team-label"
                >
                  {USER_SIZE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`${styles.segment} ${
                        activeUserSizePresetId === p.id ? styles.segmentActive : ''
                      }`}
                      onClick={() => {
                        setDraftMinUsers(p.min);
                        setDraftMaxUsers(p.max);
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className={styles.customRange}>
                  <span className={styles.customRangeLabel}>Custom</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={styles.customRangeInput}
                    value={draftMinUsers}
                    onChange={(e) => setDraftMinUsers(e.target.value)}
                    aria-label="Custom minimum users"
                    placeholder="Min"
                  />
                  <span className={styles.customRangeDash} aria-hidden>
                    –
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={styles.customRangeInput}
                    value={draftMaxUsers}
                    onChange={(e) => setDraftMaxUsers(e.target.value)}
                    aria-label="Custom maximum users"
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>
          </div>
        </FilterBar>

        <div className={listStyles.tableCard}>
          <div className={listStyles.tableCardToolbarTop}>
            <div className={listStyles.tableCardToolbarLeft}>
              <PaginationPageSize limit={pagination.limit} onLimitChange={handleLimitChange} />
              <Checkbox
                label="Include disabled"
                checked={showDisabled}
                onChange={(e) => {
                  setShowDisabled(e.target.checked);
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
              />
            </div>
            <SearchInput
              value={search}
              onSearch={handleSearch}
              placeholder="Search tenants... (press Enter)"
              className={listStyles.searchInToolbar}
            />
          </div>
          <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
            {tenants.length === 0 ? (
              <div className={listStyles.tableCardEmpty}>
                <EmptyState
                  icon="🏢"
                  title={
                    search || showDisabled || hasActiveTenantFilters
                      ? 'No tenants found'
                      : 'No tenants yet'
                  }
                  description={
                    search || showDisabled || hasActiveTenantFilters
                      ? 'Try a different search, adjust filters (Apply), or reset filters.'
                      : 'Add a tenant to onboard a new organization.'
                  }
                  action={!search && !showDisabled && !hasActiveTenantFilters ? openCreate : undefined}
                  actionLabel="Add Tenant"
                />
              </div>
            ) : (
              <div className={listStyles.tableCardBody}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Slug</TableHeaderCell>
                <TableHeaderCell width="160px">Created</TableHeaderCell>
                <TableHeaderCell width="200px">Sign-in URL</TableHeaderCell>
                <TableHeaderCell>Industry</TableHeaderCell>
                <TableHeaderCell width="90px">Users</TableHeaderCell>
                <TableHeaderCell width="90px">Status</TableHeaderCell>
                <TableHeaderCell width="90px">WhatsApp</TableHeaderCell>
                <TableHeaderCell width="90px">Email</TableHeaderCell>
                <TableHeaderCell width="80px" align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.slug}</TableCell>
                  <TableCell>
                    <span className={styles.createdCell}>{formatTenantDate(t.created_at)}</span>
                  </TableCell>
                  <TableCell>
                    <TenantWorkspaceUrlCopy tenantId={t.id} slug={t.slug} />
                  </TableCell>
                  <TableCell>{industryOptions.find((o) => o.value === t.industry_id)?.label || '—'}</TableCell>
                  <TableCell>
                    <Link to={`/admin/users?tenantId=${t.id}`} className={styles.userCountLink}>
                      {t.user_count ?? 0}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge isActive={!!t.is_enabled} />
                  </TableCell>
                  <TableCell>
                    <span className={t.whatsapp_module_enabled ? styles.moduleOn : styles.moduleOff}>
                      {t.whatsapp_module_enabled ? 'On' : 'Off'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={t.email_module_enabled ? styles.moduleOn : styles.moduleOff}>
                      {t.email_module_enabled ? 'On' : 'Off'}
                    </span>
                  </TableCell>
                  <TableCell align="right">
                    {t.id !== 1 && (
                      <IconButton title="Edit" onClick={() => openEdit(t)} size="sm">✏️</IconButton>
                    )}
                  </TableCell>
                </TableRow>
            ))}
          </TableBody>
        </Table>
              </div>
            )}
          </TableDataRegion>
          <div className={listStyles.tableCardFooterPagination}>
            <Pagination
              page={pagination.page}
              totalPages={Math.max(1, pagination.totalPages || 1)}
              total={pagination.total}
              limit={pagination.limit}
              onPageChange={handlePageChange}
              onLimitChange={handleLimitChange}
              hidePageSize
            />
          </div>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Tenant' : 'Add Tenant'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>Basic</h3>
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => {
                const v = e.target.value;
                clearFormErr('name', 'submit');
                if (!editing && slugAutoFromName) {
                  const s = slugFromCompanyName(v);
                  setSlugInputRaw(s);
                  setSlugSourceError(
                    describeTenantSlugSourceIssue(v) || describeTenantSlugSourceIssue(s)
                  );
                  clearFormErr('slug');
                  setForm((f) => ({ ...f, name: v, slug: s }));
                } else {
                  setForm((f) => ({ ...f, name: v }));
                }
              }}
              error={formErrors.name}
              required
              placeholder="Company name"
            />
            <div className={styles.slugFieldWrap}>
              <Input
                label={editing ? 'Slug' : 'Workspace address (slug)'}
                value={editing ? form.slug : slugInputRaw || form.slug}
                onChange={(e) => {
                  if (editing) return;
                  setSlugAutoFromName(false);
                  const raw = e.target.value;
                  setSlugInputRaw(raw);
                  setSlugSourceError(describeTenantSlugSourceIssue(raw));
                  setForm((f) => ({ ...f, slug: slugFromCompanyName(raw) }));
                  clearFormErr('slug', 'submit');
                }}
                error={slugDisplayError}
                hint={
                  editing
                    ? undefined
                    : slugHintParts.length > 0
                      ? slugHintParts.join(' ')
                      : 'Lowercase letters and hyphens only — sign-in subdomain. No numbers.'
                }
                required
                placeholder="acme-corp"
                readOnly={!!editing}
              />
              {showSlugSuggestions && (
                <div className={styles.slugSuggestions}>
                  <span className={styles.slugSuggestionsLabel}>Available ideas:</span>
                  <div className={styles.slugSuggestionChips}>
                    {slugRemote.suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={styles.slugSuggestionChip}
                        onClick={() => applySuggestedSlug(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Select
              label="Industry"
              options={industryOptions}
              value={form.industry_id}
              onChange={(e) => setForm((f) => ({ ...f, industry_id: e.target.value }))}
              placeholder="Select industry"
            />
            <Checkbox
              label="Tenant enabled"
              checked={form.is_enabled}
              onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))}
            />
          </div>

          {editing && (
            <div className={styles.formSection}>
              <h3 className={styles.formSectionTitle}>Workspace appearance</h3>
              <p className={styles.formSectionHint}>
                Colors and logo apply to this tenant&apos;s app after sign-in. Users see updates on their
                next session refresh. Logo URL must use HTTPS.
              </p>
              <div className={styles.themeColorRow}>
                <label className={styles.colorPickerLabel}>
                  <span className={styles.colorPickerLabelText}>Swatch</span>
                  <input
                    type="color"
                    className={styles.colorPicker}
                    aria-label="Pick brand color"
                    value={
                      /^#[0-9A-Fa-f]{6}$/.test(form.theme_primary || '')
                        ? form.theme_primary
                        : '#6366f1'
                    }
                    onChange={(e) =>
                      setForm((f) => ({ ...f, theme_primary: e.target.value.toLowerCase() }))
                    }
                  />
                </label>
                <div className={styles.themeColorInputGrow}>
                  <Input
                    label="Brand color"
                    value={form.theme_primary}
                    onChange={(e) => {
                      clearFormErr('submit');
                      setForm((f) => ({ ...f, theme_primary: e.target.value }));
                    }}
                    placeholder="#8A3FFC"
                    hint="Six-digit hex. Drives buttons, focus rings, and accent UI."
                  />
                </div>
              </div>
              <Input
                label="Logo URL (HTTPS)"
                value={form.theme_logo_url}
                onChange={(e) => {
                  clearFormErr('submit');
                  setForm((f) => ({ ...f, theme_logo_url: e.target.value }));
                }}
                placeholder="https://cdn.example.com/logo.png"
              />
              <Input
                label="Sidebar title (optional)"
                value={form.theme_workspace_title}
                onChange={(e) => setForm((f) => ({ ...f, theme_workspace_title: e.target.value }))}
                placeholder="Defaults to company name if empty"
              />
              <div className={styles.themeSplitRow}>
                <Input
                  label="Corner radius (px)"
                  type="number"
                  min={4}
                  max={24}
                  step={1}
                  value={form.theme_radius_px}
                  onChange={(e) => {
                    clearFormErr('submit');
                    setForm((f) => ({ ...f, theme_radius_px: e.target.value }));
                  }}
                  placeholder="e.g. 12"
                  hint="4–24. Leave empty for default."
                  className={styles.themeRadiusInput}
                />
                <Select
                  label="Font"
                  className={styles.themeFontSelect}
                  options={[
                    { value: 'inter', label: 'Inter' },
                    { value: 'system', label: 'System UI' },
                  ]}
                  value={form.theme_font_preset}
                  onChange={(e) => setForm((f) => ({ ...f, theme_font_preset: e.target.value }))}
                />
              </div>
              <div className={styles.themeSplitRow}>
                <Input
                  label="Gradient start (optional)"
                  value={form.theme_gradient_start}
                  onChange={(e) => {
                    clearFormErr('submit');
                    setForm((f) => ({ ...f, theme_gradient_start: e.target.value }));
                  }}
                  placeholder="#4c1d95"
                  hint="For future dashboard cards; exposed as CSS variables."
                />
                <Input
                  label="Gradient end (optional)"
                  value={form.theme_gradient_end}
                  onChange={(e) => {
                    clearFormErr('submit');
                    setForm((f) => ({ ...f, theme_gradient_end: e.target.value }));
                  }}
                  placeholder="#7c3aed"
                />
              </div>
            </div>
          )}

          {!editing && (
            <div className={styles.formSection}>
              <h3 className={styles.formSectionTitle}>First admin user</h3>
              <p className={styles.formSectionHint}>Every tenant must have at least one admin. This user will have full access to the tenant.</p>
              <Input
                label="Admin email"
                type="email"
                value={form.admin_email}
                onChange={(e) => {
                  clearFormErr('admin_email', 'submit');
                  setForm((f) => ({ ...f, admin_email: e.target.value }));
                }}
                error={formErrors.admin_email}
                required
                placeholder="admin@company.com"
              />
              <Input
                label="Admin password"
                type="password"
                value={form.admin_password}
                onChange={(e) => {
                  clearFormErr('admin_password', 'submit');
                  setForm((f) => ({ ...f, admin_password: e.target.value }));
                }}
                error={formErrors.admin_password}
                required
                placeholder="••••••••"
              />
              <Input
                label="Admin name"
                value={form.admin_name}
                onChange={(e) => setForm((f) => ({ ...f, admin_name: e.target.value }))}
                placeholder="Display name"
              />
            </div>
          )}

          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>WhatsApp</h3>
            <Checkbox
              label="WhatsApp module enabled (purchased)"
              checked={form.whatsapp_module_enabled}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_module_enabled: e.target.checked }))}
            />
            <Checkbox
              label="WhatsApp automation enabled (API send)"
              checked={form.whatsapp_automation_enabled}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_automation_enabled: e.target.checked }))}
            />
            <Select
              label="WhatsApp send mode"
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'automatic', label: 'Automatic' },
              ]}
              value={form.whatsapp_send_mode}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp_send_mode: e.target.value }))}
            />
          </div>

          <div className={styles.formSection}>
            <h3 className={styles.formSectionTitle}>Email</h3>
            <Checkbox
              label="Email communication plan (tracking, automation)"
              checked={form.email_communication_enabled}
              onChange={(e) => setForm((f) => ({ ...f, email_communication_enabled: e.target.checked }))}
            />
            <Checkbox
              label="Email module enabled (purchased)"
              checked={form.email_module_enabled}
              onChange={(e) => setForm((f) => ({ ...f, email_module_enabled: e.target.checked }))}
            />
            <Checkbox
              label="Email automation enabled"
              checked={form.email_automation_enabled}
              onChange={(e) => setForm((f) => ({ ...f, email_automation_enabled: e.target.checked }))}
            />
          </div>

          {formErrors.submit && <div className={styles.formError}>{formErrors.submit}</div>}
          <ModalFooter>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={createMutation.loading || updateMutation.loading}>
              {editing ? 'Save' : 'Create'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
