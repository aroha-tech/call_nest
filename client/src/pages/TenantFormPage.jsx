import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { tenantsAPI } from '../services/adminAPI';
import { industriesAPI } from '../services/dispositionAPI';
import { getTenantSlugStatus } from '../features/auth/authAPI';
import {
  slugFromCompanyName,
  validateSlug,
  describeTenantSlugSourceIssue,
} from '../features/auth/utils/slugUtils';
import { useMutation } from '../hooks/useAsyncData';
import { InfoHelpIcon, infoHelpHeadingRowClassName } from '../components/ui/InfoHelpIcon';
import styles from './TenantFormPage.module.scss';

function emptyThemeFormFields() {
  return {
    theme_logo_url: '',
    theme_workspace_title: '',
    theme_radius_px: '',
    theme_font_preset: 'inter',
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
    theme_logo_url: typeof t.logoUrl === 'string' ? t.logoUrl : '',
    theme_workspace_title: typeof t.workspaceTitle === 'string' ? t.workspaceTitle : '',
    theme_radius_px: t.radiusPx != null && t.radiusPx !== '' ? String(t.radiusPx) : '',
    theme_font_preset: t.fontPreset === 'system' ? 'system' : 'inter',
  };
}

/** @returns {{ value: object|null, error?: string }} */
function themePayloadFromForm(form) {
  const o = {};
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
  reports_advanced_enabled: false,
  ...emptyThemeFormFields(),
});

const SLUG_DEBOUNCE_MS = 400;

function FormSection({ tone, icon, title, hint, headerRight, children }) {
  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHead}>
        <div className={`${styles.sectionIconWell} ${styles[`sectionIcon_${tone}`]}`.trim()}>
          <MaterialSymbol name={icon} className={styles.sectionIconGlyph} />
        </div>
        <div className={styles.sectionHeadText}>
          <div className={`${styles.sectionTitleRow} ${infoHelpHeadingRowClassName}`.trim()}>
            <h2 className={styles.sectionTitle}>{title}</h2>
            {headerRight}
          </div>
          {hint ? <p className={styles.sectionHint}>{hint}</p> : null}
        </div>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

export function TenantFormPage() {
  const navigate = useNavigate();
  const { tenantId } = useParams();
  const isCreate = !tenantId;
  const editingId = tenantId ? parseInt(tenantId, 10) : null;

  const [loadState, setLoadState] = useState(() => (isCreate ? 'ready' : 'loading'));
  const [loadError, setLoadError] = useState(null);
  const [editingRow, setEditingRow] = useState(null);

  const [form, setForm] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState({});
  const [industryOptions, setIndustryOptions] = useState([]);
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
    if (isCreate) {
      setLoadState('ready');
      setEditingRow(null);
      setForm(defaultForm());
      setFormErrors({});
      setSlugInputRaw('');
      setSlugAutoFromName(true);
      setSlugSourceError(null);
      setSlugRemote({ loading: false, available: null, message: null, suggestions: [] });
      return;
    }

    let cancelled = false;
    (async () => {
      setLoadState('loading');
      setLoadError(null);
      if (!Number.isFinite(editingId) || editingId < 1) {
        setLoadError('Invalid tenant.');
        setLoadState('error');
        return;
      }
      try {
        const res = await tenantsAPI.getById(editingId);
        const row = res.data?.data;
        if (cancelled) return;
        if (!row) {
          setLoadError('Tenant not found.');
          setLoadState('error');
          return;
        }
        if (Number(row.id) === 1) {
          setLoadError('This workspace cannot be edited here.');
          setLoadState('error');
          return;
        }
        setEditingRow(row);
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
          reports_advanced_enabled: !!row.reports_advanced_enabled,
          ...themeFieldsFromRow(row),
        });
        setFormErrors({});
        setLoadState('ready');
      } catch (err) {
        if (cancelled) return;
        setLoadError(err.response?.data?.error || err.message || 'Failed to load tenant.');
        setLoadState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isCreate, editingId]);

  useEffect(() => {
    if (!isCreate) {
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
  }, [isCreate, form.slug, slugSourceError]);

  const createMutation = useMutation((data) => tenantsAPI.create(data));
  const updateMutation = useMutation((id, data) => tenantsAPI.update(id, data));

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
      reports_advanced_enabled: form.reports_advanced_enabled ? 1 : 0,
    };
    if (isCreate) {
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
    if (isCreate) {
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
    if (!isCreate) {
      const tp = themePayloadFromForm(form);
      if (tp.error) {
        setFormErrors({ submit: tp.error });
        return;
      }
      payload.theme = tp.value;
    }
    const result = isCreate
      ? await createMutation.mutate(payload)
      : await updateMutation.mutate(editingRow.id, payload);
    if (result.success) {
      navigate('/admin/tenants');
    } else {
      const errMsg = result.error || '';
      if (isCreate && /slug|already|workspace|address/i.test(errMsg)) {
        setFormErrors({ slug: errMsg, submit: errMsg });
      } else {
        setFormErrors({ submit: errMsg });
      }
    }
  };

  const slugFormatErrCreate =
    isCreate && form.slug.trim() ? validateSlug(form.slug.trim()) : null;
  const slugDisplayError = !isCreate
    ? formErrors.slug || null
    : formErrors.slug ||
      slugSourceError ||
      slugFormatErrCreate ||
      (slugRemote.available === false && slugRemote.message ? slugRemote.message : null) ||
      null;

  const slugHintParts = [];
  if (isCreate) {
    if (!slugFormatErrCreate && !slugSourceError && slugRemote.loading) {
      slugHintParts.push('Checking availability…');
    }
    if (slugRemote.available === true) {
      slugHintParts.push('This address is available.');
    }
  }

  const showSlugSuggestions =
    isCreate &&
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

  const pageTitle = isCreate ? 'Add tenant' : 'Edit tenant';
  const pageDescription = isCreate
    ? 'Create a workspace, first admin, and module access in one place.'
    : `Update settings for ${editingRow?.name || 'this tenant'}.`;

  const breadcrumbs = useMemo(
    () => (
      <>
        <Link className={styles.breadcrumbLink} to="/admin/tenants">
          Tenants
        </Link>
        <span className={styles.breadcrumbSep} aria-hidden>
          /
        </span>
        <span className={styles.breadcrumbCurrent}>{pageTitle}</span>
      </>
    ),
    [pageTitle]
  );

  if (loadState === 'loading') {
    return (
      <div className={styles.page}>
        <PageHeader title={pageTitle} description={pageDescription} breadcrumbs={breadcrumbs} />
        <div className={styles.loadingBox}>Loading tenant…</div>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className={styles.page}>
        <PageHeader title={pageTitle} description={pageDescription} breadcrumbs={breadcrumbs} />
        <Alert variant="error">{loadError}</Alert>
        <div className={`${styles.footerBar} ${styles.footerBarStart}`.trim()}>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/tenants')}>
            Back to tenants
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader title={pageTitle} description={pageDescription} breadcrumbs={breadcrumbs} />
      <div className={styles.shell}>
        <form onSubmit={handleSubmit}>
          <div className={isCreate ? styles.gridTop : styles.gridTopSingle}>
            <FormSection
              tone="indigo"
              icon="apartment"
              title="Organization"
              hint="Company profile, industry, and whether the workspace is active."
            >
              <Input
                label="Name"
                value={form.name}
                onChange={(e) => {
                  const v = e.target.value;
                  clearFormErr('name', 'submit');
                  if (isCreate && slugAutoFromName) {
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
                  label={isCreate ? 'Workspace address (slug)' : 'Slug'}
                  value={isCreate ? slugInputRaw || form.slug : form.slug}
                  onChange={(e) => {
                    if (!isCreate) return;
                    setSlugAutoFromName(false);
                    const raw = e.target.value;
                    setSlugInputRaw(raw);
                    setSlugSourceError(describeTenantSlugSourceIssue(raw));
                    setForm((f) => ({ ...f, slug: slugFromCompanyName(raw) }));
                    clearFormErr('slug', 'submit');
                  }}
                  error={slugDisplayError}
                  hint={
                    isCreate
                      ? slugHintParts.length > 0
                        ? slugHintParts.join(' ')
                        : 'Lowercase letters and hyphens only — sign-in subdomain. No numbers.'
                      : undefined
                  }
                  required
                  placeholder="acme-corp"
                  readOnly={!isCreate}
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
            </FormSection>

            {isCreate ? (
              <FormSection
                tone="teal"
                icon="person_add"
                title="First admin user"
                hint="This account gets full access to the new workspace."
                headerRight={
                  <InfoHelpIcon
                    title="First admin user info"
                    modalTitle="First admin user"
                    message="Every tenant must have at least one admin. This user will have full access to the tenant."
                  />
                }
              >
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
              </FormSection>
            ) : null}
          </div>

          {!isCreate ? (
            <div className={styles.gridTopSingle}>
              <FormSection
                tone="violet"
                icon="palette"
                title="Workspace appearance"
                hint="Logo and typography after sign-in. Logo URL must use HTTPS."
                headerRight={
                  <InfoHelpIcon
                    title="Workspace appearance info"
                    modalTitle="Workspace appearance"
                    message="Logo and typography apply to this tenant app after sign-in. Users see updates on their next session refresh. Logo URL must use HTTPS."
                  />
                }
              >
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
              </FormSection>
            </div>
          ) : null}

          <div className={styles.gridModules}>
            <FormSection
              tone="emerald"
              icon="chat"
              title="WhatsApp"
              hint="Purchased module, automation, and how sends are triggered."
            >
              <Checkbox
                label="WhatsApp module enabled (purchased)"
                checked={form.whatsapp_module_enabled}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp_module_enabled: e.target.checked }))}
              />
              <Checkbox
                label="WhatsApp automation enabled (API send)"
                checked={form.whatsapp_automation_enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, whatsapp_automation_enabled: e.target.checked }))
                }
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
            </FormSection>

            <FormSection
              tone="blue"
              icon="mail"
              title="Email"
              hint="Communication plan, purchased module, and outbound automation."
            >
              <Checkbox
                label="Email communication plan (tracking, automation)"
                checked={form.email_communication_enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email_communication_enabled: e.target.checked }))
                }
              />
              <Checkbox
                label="Email module enabled (purchased)"
                checked={form.email_module_enabled}
                onChange={(e) => setForm((f) => ({ ...f, email_module_enabled: e.target.checked }))}
              />
              <Checkbox
                label="Email automation enabled"
                checked={form.email_automation_enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email_automation_enabled: e.target.checked }))
                }
              />
            </FormSection>
          </div>

          <div className={styles.gridTopSingle}>
            <FormSection
              tone="amber"
              icon="analytics"
              title="Reports"
              hint="Simple vs advanced analytics and exports for this tenant."
              headerRight={
                <InfoHelpIcon
                  title="Advanced reports"
                  modalTitle="Advanced reports"
                  message="When off (default), tenant users only see Simple reports: core KPI cards. When on, they can open Advanced reports: Nest Insights (AI), team rollups, leaderboards, period compare, performance detail, coaching, scoring, and CSV export."
                />
              }
            >
              <Checkbox
                label="Advanced reports enabled (AI insights, performance detail, exports)"
                checked={form.reports_advanced_enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reports_advanced_enabled: e.target.checked }))
                }
              />
            </FormSection>
          </div>

          {formErrors.submit ? <div className={styles.formError}>{formErrors.submit}</div> : null}

          <div className={styles.footerBar}>
            <Button type="button" variant="secondary" onClick={() => navigate('/admin/tenants')}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={createMutation.loading || updateMutation.loading}
            >
              {isCreate ? 'Create' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
