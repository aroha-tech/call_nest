import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { InfoHelpIcon, infoHelpHeadingRowClassName } from '../components/ui/InfoHelpIcon';
import { useMutation } from '../hooks/useAsyncData';
import { tenantCompanyAPI } from '../services/tenantCompanyAPI';
import { tenantIndustryFieldsAPI } from '../services/tenantIndustryFieldsAPI';
import { getTenantSlugStatus } from '../features/auth/authAPI';
import { workspaceCompanyUpdated } from '../features/auth/authSlice';
import {
  slugFromCompanyName,
  validateSlug,
  describeTenantSlugSourceIssue,
} from '../features/auth/utils/slugUtils';
import { getTenantWorkspaceUrl } from '../config/tenantWorkspaceUrl';
import { PRODUCT_DISPLAY_NAME } from '../config/productBrand';
import styles from './TenantCompanySettingsPage.module.scss';

const SLUG_DEBOUNCE_MS = 400;
const NO_INDUSTRY = '__none__';
const INDUSTRY_TIP_STORAGE_KEY = 'cn_company_industry_experience_tip_dismissed';
const SUCCESS_BAR_DISMISS_PREFIX = 'cn_company_industry_success_dismissed:';
const INDUSTRY_SELECT_INPUT_ID = 'company-settings-industry-select';
/** Sticky topbar (~52px) + padding */
const SCROLL_MAIN_TOP_OFFSET = 80;

function scrollPageToElement(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  const rect = el.getBoundingClientRect();
  const y = rect.top + window.scrollY - SCROLL_MAIN_TOP_OFFSET;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

const MODULE_PILLS = [
  { icon: 'person_search', label: 'Leads' },
  { icon: 'contacts', label: 'Contacts' },
  { icon: 'handshake', label: 'Deals' },
  { icon: 'event', label: 'Meetings' },
  { icon: 'outgoing_mail', label: 'Email' },
  { icon: 'campaign', label: 'Campaigns' },
];

function sortIndustryFieldRows(a, b) {
  const sa = Number(a.sort_order) || 0;
  const sb = Number(b.sort_order) || 0;
  if (sa !== sb) return sa - sb;
  return String(a.label || '').localeCompare(String(b.label || ''));
}

function industryIconFromIndustry(row) {
  if (!row) return 'domain';
  const n = String(row.name || '').toLowerCase();
  const code = String(row.code || '').toLowerCase();
  if (n.includes('education') || code.includes('edu')) return 'school';
  if (n.includes('health') || n.includes('medical') || code.includes('health')) return 'cardiology';
  if (n.includes('real estate') || n.includes('property')) return 'real_estate_agent';
  if (n.includes('finance') || n.includes('bank') || code.includes('fin')) return 'account_balance';
  if (n.includes('tech') || n.includes('software') || code.includes('tech')) return 'code';
  return 'storefront';
}

function fieldTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'text') return 'Text';
  if (t === 'number') return 'Number';
  if (t === 'date') return 'Date';
  if (t === 'boolean') return 'Yes / No';
  if (t === 'select') return 'Dropdown';
  if (t === 'multiselect' || t === 'multiselect_dropdown') return 'Multi-select';
  return t ? t.replace(/_/g, ' ') : 'Field';
}

function fieldRowIcon(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'date') return 'calendar_today';
  if (t === 'number') return 'numbers';
  if (t === 'boolean') return 'toggle_on';
  if (t === 'select' || t === 'multiselect' || t === 'multiselect_dropdown') return 'list';
  if (t === 'text' && String(type).includes('phone')) return 'call';
  return 'text_fields';
}

export function TenantCompanySettingsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [name, setName] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [industryId, setIndustryId] = useState(NO_INDUSTRY);
  const [slugRemote, setSlugRemote] = useState({
    loading: false,
    available: null,
    message: null,
  });
  const slugReqId = useRef(0);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [slugChangedNotice, setSlugChangedNotice] = useState(false);

  const [optionalIndustryFields, setOptionalIndustryFields] = useState([]);
  const [coreIndustryFields, setCoreIndustryFields] = useState([]);
  const [optionalIndustryLoading, setOptionalIndustryLoading] = useState(false);
  const [optionalIndustrySaving, setOptionalIndustrySaving] = useState(false);
  const [optionalIndustryError, setOptionalIndustryError] = useState(null);

  const [industryTipDismissed, setIndustryTipDismissed] = useState(() => {
    try {
      return localStorage.getItem(INDUSTRY_TIP_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [successBarDismissed, setSuccessBarDismissed] = useState(false);
  const [modulesExpanded, setModulesExpanded] = useState(false);
  const [activeSetupGlow, setActiveSetupGlow] = useState(false);

  const industryBlockRef = useRef(null);
  const fieldPacksCardRef = useRef(null);
  const fieldPacksSetupRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await tenantCompanyAPI.get();
      setBundle(res.data?.data ?? null);
    } catch (err) {
      setLoadError(err.response?.data?.error || err.message || 'Failed to load');
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadOptionalIndustryFields = useCallback(async () => {
    setOptionalIndustryLoading(true);
    setOptionalIndustryError(null);
    try {
      const [optRes, defRes] = await Promise.all([
        tenantIndustryFieldsAPI.getOptionalSettings(),
        tenantIndustryFieldsAPI.getDefinitions(),
      ]);
      const rows = optRes?.data?.data?.fields ?? [];
      setOptionalIndustryFields(Array.isArray(rows) ? rows : []);
      const defs = Array.isArray(defRes?.data?.data) ? defRes.data.data : [];
      setCoreIndustryFields(defs.filter((d) => Number(d.is_optional) !== 1));
    } catch (err) {
      setOptionalIndustryFields([]);
      setCoreIndustryFields([]);
      setOptionalIndustryError(err.response?.data?.error || err.message || 'Failed to load industry field options');
    } finally {
      setOptionalIndustryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!bundle?.tenant?.id || !bundle?.tenant?.industry_id) {
      setOptionalIndustryFields([]);
      setCoreIndustryFields([]);
      return;
    }
    loadOptionalIndustryFields();
  }, [bundle?.tenant?.id, bundle?.tenant?.industry_id, loadOptionalIndustryFields]);

  const tenant = bundle?.tenant;
  const industryOptionsRaw = bundle?.industry_options ?? [];

  const sortedCoreIndustryFields = useMemo(
    () => [...coreIndustryFields].sort(sortIndustryFieldRows),
    [coreIndustryFields]
  );
  const selectedOptionalIndustryFields = useMemo(
    () => [...optionalIndustryFields].filter((f) => f.is_enabled).sort(sortIndustryFieldRows),
    [optionalIndustryFields]
  );
  const availableOptionalIndustryFields = useMemo(
    () => [...optionalIndustryFields].filter((f) => !f.is_enabled).sort(sortIndustryFieldRows),
    [optionalIndustryFields]
  );

  const savedIndustryId =
    tenant?.industry_id != null && tenant.industry_id !== '' ? String(tenant.industry_id) : '';
  const formIndustryId = industryId !== NO_INDUSTRY ? String(industryId) : '';
  const industryMatchesSaved = savedIndustryId === formIndustryId;
  const showEmptyOnboarding = !savedIndustryId && !formIndustryId;
  const showPendingIndustrySave = !industryMatchesSaved && (savedIndustryId || formIndustryId);
  const showFieldPackContent = Boolean(savedIndustryId) && industryMatchesSaved;

  const activeIndustryRow = useMemo(() => {
    const id = showFieldPackContent ? savedIndustryId : formIndustryId || savedIndustryId;
    if (!id) return null;
    return industryOptionsRaw.find((i) => String(i.id) === String(id));
  }, [industryOptionsRaw, savedIndustryId, formIndustryId, showFieldPackContent]);

  const formIndustryRowOnly = useMemo(
    () => (formIndustryId ? industryOptionsRaw.find((i) => String(i.id) === formIndustryId) : null),
    [industryOptionsRaw, formIndustryId]
  );

  const industrySelectOptions = useMemo(() => {
    const base = [
      { value: NO_INDUSTRY, label: 'Not set', iconName: 'block' },
      ...industryOptionsRaw.map((i) => ({
        value: String(i.id),
        label: i.name,
        iconName: industryIconFromIndustry(i),
      })),
    ];
    return base;
  }, [industryOptionsRaw]);

  const formatIndustryOption = useCallback((option) => {
    const icon = option.iconName;
    return (
      <span className={styles.industryOptionRow}>
        {icon ? (
          <span className={styles.industryOptionIcon} aria-hidden>
            <MaterialSymbol name={icon} size="sm" />
          </span>
        ) : null}
        <span>{option.label}</span>
      </span>
    );
  }, []);

  const sampleFieldRows = useMemo(() => {
    const merged = [
      ...sortedCoreIndustryFields.map((f) => ({ ...f, _src: 'core' })),
      ...selectedOptionalIndustryFields.map((f) => ({ ...f, _src: 'opt' })),
    ].sort(sortIndustryFieldRows);
    return merged.slice(0, 24);
  }, [sortedCoreIndustryFields, selectedOptionalIndustryFields]);

  const totalFieldCount = sortedCoreIndustryFields.length + selectedOptionalIndustryFields.length;

  const visibleModulePills = modulesExpanded ? MODULE_PILLS : MODULE_PILLS.slice(0, 5);
  const moduleOverflowCollapsed = Math.max(0, MODULE_PILLS.length - 5);

  const successDismissStorageKey = useMemo(() => {
    if (!tenant?.id || !savedIndustryId) return null;
    return `${SUCCESS_BAR_DISMISS_PREFIX}${tenant.id}:${savedIndustryId}`;
  }, [tenant?.id, savedIndustryId]);

  useEffect(() => {
    if (!successDismissStorageKey) {
      setSuccessBarDismissed(false);
      return;
    }
    try {
      setSuccessBarDismissed(localStorage.getItem(successDismissStorageKey) === '1');
    } catch {
      setSuccessBarDismissed(false);
    }
  }, [successDismissStorageKey]);

  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name ?? '');
    setSlugInput(tenant.slug ?? '');
    setIndustryId(tenant.industry_id || NO_INDUSTRY);
    setSlugChangedNotice(false);
    setFieldErrors({});
    setSaveError(null);
    setModulesExpanded(false);
  }, [tenant]);

  const slugNormalized = slugFromCompanyName(slugInput);

  useEffect(() => {
    if (!tenant) return undefined;

    const s = slugNormalized;
    if (!s || s === tenant.slug) {
      setSlugRemote({ loading: false, available: true, message: null });
      return undefined;
    }

    const sourceErr = describeTenantSlugSourceIssue(slugInput);
    const fmtErr = validateSlug(s);
    if (sourceErr || fmtErr) {
      setSlugRemote({ loading: false, available: false, message: null });
      return undefined;
    }

    const reqId = ++slugReqId.current;
    setSlugRemote((prev) => ({ ...prev, loading: true }));
    const t = setTimeout(async () => {
      try {
        const data = await getTenantSlugStatus(s, { excludeTenantId: tenant.id });
        if (slugReqId.current !== reqId) return;
        if (!data.valid || !data.available) {
          setSlugRemote({
            loading: false,
            available: false,
            message: data.error || 'This address is not available',
          });
          return;
        }
        setSlugRemote({ loading: false, available: true, message: null });
      } catch {
        if (slugReqId.current !== reqId) return;
        setSlugRemote({ loading: false, available: null, message: null });
      }
    }, SLUG_DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [slugInput, slugNormalized, tenant]);

  const slugSourceError = describeTenantSlugSourceIssue(slugInput);
  const slugFormatError = validateSlug(slugNormalized);

  const slugFieldError =
    fieldErrors.slug ||
    (slugSourceError || slugFormatError) ||
    (slugRemote.available === false && slugRemote.message) ||
    null;

  const previewWorkspaceUrl = useMemo(() => {
    if (!tenant) return '';
    const candidate =
      slugNormalized && !slugSourceError && !slugFormatError && slugRemote.available !== false
        ? slugNormalized
        : tenant.slug;
    return getTenantWorkspaceUrl(candidate);
  }, [tenant, slugNormalized, slugSourceError, slugFormatError, slugRemote.available]);

  const slugReadyUrl =
    slugNormalized &&
    !slugSourceError &&
    !slugFormatError &&
    !slugRemote.loading &&
    slugRemote.available === true
      ? getTenantWorkspaceUrl(slugNormalized)
      : '';

  const industryExperienceActive = Boolean(formIndustryId);

  const dismissIndustryTip = useCallback(() => {
    setIndustryTipDismissed(true);
    try {
      localStorage.setItem(INDUSTRY_TIP_STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const saveRequest = useCallback((payload) => tenantCompanyAPI.update(payload), []);
  const { mutate: saveMutate, loading: saving } = useMutation(saveRequest);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError(null);
    setFieldErrors({});

    const nameTrim = name.trim();
    if (!nameTrim) {
      setFieldErrors({ name: 'Company name is required' });
      return;
    }

    if (!tenant) return;

    const nextSlug = slugNormalized;
    if (nextSlug !== tenant.slug) {
      if (slugSourceError || slugFormatError) {
        setFieldErrors({ slug: slugSourceError || slugFormatError });
        return;
      }
      if (slugRemote.loading || slugRemote.available !== true) {
        setFieldErrors({ slug: slugRemote.message || 'Check workspace address availability' });
        return;
      }
    }

    const prevSlug = tenant.slug;
    const result = await saveMutate({
      name: nameTrim,
      slug: nextSlug,
      industry_id: industryId === NO_INDUSTRY ? null : industryId,
    });

    if (!result.success) {
      setSaveError(result.error);
      return;
    }

    const updated = result.data?.data?.tenant;
    if (updated) {
      dispatch(
        workspaceCompanyUpdated({
          name: updated.name,
          slug: updated.slug,
        })
      );
      if (updated.slug && updated.slug !== prevSlug) {
        setSlugChangedNotice(true);
      }
    }
    await load();
    await loadOptionalIndustryFields();
  };

  const handleSaveOptionalIndustryFields = async () => {
    setOptionalIndustrySaving(true);
    setOptionalIndustryError(null);
    try {
      const enabled_field_ids = optionalIndustryFields.filter((f) => f.is_enabled).map((f) => f.id);
      const res = await tenantIndustryFieldsAPI.putOptionalSettings(enabled_field_ids);
      const rows = res?.data?.data?.fields ?? [];
      setOptionalIndustryFields(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setOptionalIndustryError(err.response?.data?.error || err.message || 'Save failed');
    } finally {
      setOptionalIndustrySaving(false);
    }
  };

  const handleResetForm = useCallback(async () => {
    if (!tenant) return;
    setName(tenant.name ?? '');
    setSlugInput(tenant.slug ?? '');
    setIndustryId(tenant.industry_id || NO_INDUSTRY);
    setFieldErrors({});
    setSaveError(null);
    setSlugChangedNotice(false);
    setModulesExpanded(false);
    if (tenant.industry_id) {
      await loadOptionalIndustryFields();
    }
  }, [tenant, loadOptionalIndustryFields]);

  const openPreviewCrm = () => {
    const url = previewWorkspaceUrl;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  const focusIndustrySelect = useCallback(() => {
    const tryFocus = () => {
      const input = document.getElementById(INDUSTRY_SELECT_INPUT_ID);
      if (input && typeof input.focus === 'function') {
        input.focus({ preventScroll: true });
        return true;
      }
      return false;
    };
    if (tryFocus()) return;
    window.setTimeout(() => {
      if (tryFocus()) return;
      const control = industryBlockRef.current?.querySelector('.cn-select__control');
      if (control && typeof control.click === 'function') control.click();
    }, 50);
  }, []);

  const scrollToIndustry = useCallback(() => {
    scrollPageToElement(industryBlockRef.current);
    window.setTimeout(() => focusIndustrySelect(), 280);
  }, [focusIndustrySelect]);

  const scrollToFieldPacks = useCallback(() => {
    const el = fieldPacksSetupRef.current || fieldPacksCardRef.current;
    scrollPageToElement(el);
    setActiveSetupGlow(true);
    window.setTimeout(() => setActiveSetupGlow(false), 2400);
  }, []);

  const dismissSuccessBar = useCallback(() => {
    setSuccessBarDismissed(true);
    if (!successDismissStorageKey) return;
    try {
      localStorage.setItem(successDismissStorageKey, '1');
    } catch {
      /* ignore */
    }
  }, [successDismissStorageKey]);

  const pageHeaderActions = (
    <Button type="button" variant="secondary" size="sm" onClick={openPreviewCrm} disabled={!previewWorkspaceUrl}>
      <MaterialSymbol name="visibility" size="sm" className={styles.btnLeadingIcon} />
      Preview CRM
    </Button>
  );

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeader
          title="Company settings"
          subtitle="Manage your company details, workspace and industry configuration."
          description="Set your company name, workspace sign-in address (subdomain), and industry. Industry controls which catalog fields and defaults apply to your tenant."
          actions={pageHeaderActions}
        />
        <div className={`${styles.layout} ${styles.layoutSplit}`} aria-busy="true" aria-label="Loading settings">
          <Card className={styles.card}>
            <div className={styles.form}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={`skel-f-${i}`} style={{ display: 'grid', gap: 8 }}>
                  <Skeleton width={120} height={12} />
                  <Skeleton height={44} width="100%" />
                </div>
              ))}
              <Skeleton height={120} width="100%" style={{ borderRadius: 10 }} />
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <Skeleton width={120} height={40} style={{ borderRadius: 8 }} />
              </div>
            </div>
          </Card>
          <Card className={`${styles.card} ${styles.cardAside}`}>
            <div className={styles.cardHeadingRow}>
              <Skeleton width="48%" height={18} />
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <Skeleton height={36} width="100%" />
              <Skeleton height={36} width="100%" />
              <Skeleton height={140} width="100%" style={{ borderRadius: 10 }} />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (loadError || !bundle?.tenant) {
    return (
      <div className={styles.page}>
        <PageHeader
          title="Company settings"
          subtitle="Manage your company details, workspace and industry configuration."
          description="Set your company name, workspace sign-in address (subdomain), and industry."
          actions={pageHeaderActions}
        />
        <Alert variant="error" display="inline">
          {loadError || 'Could not load settings'}
        </Alert>
      </div>
    );
  }

  const showSuccessBar = Boolean(savedIndustryId) && industryMatchesSaved && !successBarDismissed;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Company settings"
        subtitle="Manage your company details, workspace and industry configuration."
        description="Set your company name, workspace sign-in address (subdomain), and industry. Industry controls which catalog fields and optional packs apply to leads and contacts."
        actions={pageHeaderActions}
      />

      {slugChangedNotice && (
        <Alert variant="warning" className={styles.alert}>
          Workspace address was updated. Your team should use the new sign-in URL (subdomain). You may need to sign in
          again on the new address.
        </Alert>
      )}

      {saveError && (
        <Alert variant="error" className={styles.alert}>
          {saveError}
        </Alert>
      )}

      <div className={`${styles.layout} ${styles.layoutSplit}`}>
        <Card className={styles.card}>
          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <Input
              label="Company name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFieldErrors((p) => {
                  const n = { ...p };
                  delete n.name;
                  return n;
                });
              }}
              error={fieldErrors.name}
              disabled={saving}
              autoComplete="organization"
            />

            <div>
              <Input
                label="Workspace address (slug)"
                value={slugInput}
                onChange={(e) => {
                  setSlugInput(e.target.value);
                  setFieldErrors((p) => {
                    const n = { ...p };
                    delete n.slug;
                    return n;
                  });
                }}
                error={slugFieldError}
                hint="Used in your team’s sign-in URL (subdomain). Lowercase letters and hyphens only."
                disabled={saving}
                autoComplete="off"
              />
              {slugReadyUrl ? (
                <p className={styles.slugUrlOk} role="status">
                  <MaterialSymbol name="check_circle" size="sm" className={styles.slugUrlOkIcon} />
                  <span>{slugReadyUrl}</span>
                </p>
              ) : slugRemote.loading ? (
                <p className={styles.slugUrlMuted}>Checking availability…</p>
              ) : null}
            </div>

            <div ref={industryBlockRef}>
              <Select
                id={INDUSTRY_SELECT_INPUT_ID}
                label="Industry"
                value={industryId}
                onChange={(e) => setIndustryId(e.target.value)}
                options={industrySelectOptions}
                disabled={saving}
                placeholder="Select industry"
                hint="Choosing an industry applies the matching field catalog and optional packs for your workspace."
                formatOptionLabel={formatIndustryOption}
              />
            </div>

            {!industryTipDismissed ? (
              <div className={styles.industryTip}>
                <MaterialSymbol name="auto_awesome" size="sm" className={styles.industryTipIcon} aria-hidden />
                <div className={styles.industryTipBody}>
                  <p className={styles.industryTipTitle}>Industry based experience</p>
                  <p className={styles.industryTipText}>
                    Selecting an industry automatically loads relevant fields, pipelines, templates, and automations
                    tailored for your business (within your platform configuration).
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.industryTipClose}
                  onClick={dismissIndustryTip}
                  aria-label="Dismiss"
                >
                  <MaterialSymbol name="close" size="sm" />
                </button>
              </div>
            ) : null}

            <div className={styles.optionChecklist}>
              <p className={styles.optionChecklistTitle}>Additional options</p>
              <Checkbox
                label="Enable industry specific fields & modules"
                checked={industryExperienceActive}
                disabled
              />
              <Checkbox label="Load industry based pipelines" checked={industryExperienceActive} disabled />
              <Checkbox label="Apply industry based email & SMS templates" checked={industryExperienceActive} disabled />
              <div className={styles.checkboxWithHint} title={`${PRODUCT_DISPLAY_NAME} never bulk-deletes your data when you change industry.`}>
                <Checkbox label="Reset existing data when changing industry" checked={false} disabled />
              </div>
            </div>

            <div className={styles.formFooter}>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleResetForm} disabled={saving}>
                Reset to default
              </Button>
            </div>
          </form>
        </Card>

        <div ref={fieldPacksCardRef} className={styles.asideColumn}>
          <Card className={`${styles.card} ${styles.cardAside}`}>
            <div className={styles.asideHeaderBlock}>
              <div className={`${infoHelpHeadingRowClassName} ${styles.asideTitleRow}`.trim()}>
                <h2 className={styles.sectionTitle}>Industry field packs</h2>
                <InfoHelpIcon
                  title="Industry field packs info"
                  modalTitle="Industry field packs"
                  message="Core fields are always on your forms. Optional packs can be toggled below; use Contact fields for fully custom properties."
                />
              </div>
              <p className={styles.asideSubtitle}>
                Manage and preview the fields that will be available for the selected industry.
              </p>
              <div className={styles.asideToolbar}>
                <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/settings/contact-fields')}>
                  <MaterialSymbol name="tune" size="sm" className={styles.btnLeadingIcon} />
                  Manage fields
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/settings/contact-fields')}>
                  <MaterialSymbol name="add" size="sm" className={styles.btnLeadingIcon} />
                  Add custom field
                </Button>
              </div>
            </div>

            {showEmptyOnboarding ? (
              <div className={styles.emptyIndustry}>
                <MaterialSymbol name="category" size="lg" className={styles.emptyIndustryIcon} />
                <p className={styles.emptyIndustryTitle}>Select an industry</p>
                <p className={styles.emptyIndustryText}>
                  Choose an industry on the left to preview active field packs, modules, and sample fields for your
                  workspace.
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={scrollToIndustry}>
                  Go to industry
                </Button>
              </div>
            ) : showPendingIndustrySave ? (
              <div className={styles.pendingIndustry}>
                <MaterialSymbol name="save" size="md" className={styles.pendingIndustryIcon} aria-hidden />
                <p className={styles.pendingIndustryTitle}>Save to apply</p>
                <p className={styles.pendingIndustryText}>
                  {formIndustryId
                    ? `You’ve selected “${formIndustryRowOnly?.name || 'an industry'}”. Click Save changes on the left to load its field catalog and packs.`
                    : 'You’ve cleared industry. Click Save changes on the left to update your workspace defaults.'}
                </p>
                <Button type="button" variant="secondary" size="sm" onClick={scrollToIndustry}>
                  Back to company form
                </Button>
              </div>
            ) : (
              <>
                {optionalIndustryError ? (
                  <Alert variant="error" className={styles.alert}>
                    {optionalIndustryError}
                  </Alert>
                ) : null}

                <div
                  ref={fieldPacksSetupRef}
                  className={`${styles.activeIndustryBanner} ${activeSetupGlow ? styles.activeSetupGlow : ''}`.trim()}
                >
                  <div className={styles.activeIndustryIconWrap} aria-hidden>
                    <MaterialSymbol
                      name={industryIconFromIndustry(activeIndustryRow)}
                      size="md"
                      className={styles.industryBannerSymbol}
                    />
                  </div>
                <div className={styles.activeIndustryMain}>
                  <div className={styles.activeIndustryTitleRow}>
                    <span className={styles.activeIndustryName}>{activeIndustryRow?.name || 'Industry'}</span>
                    <span className={styles.activeBadge}>Active</span>
                  </div>
                  <p className={styles.activeIndustryCaption}>
                    {(activeIndustryRow?.name || 'This') + ' CRM field pack is active for your workspace.'}
                  </p>
                </div>
                <div className={styles.activeIndustryStats}>
                  {totalFieldCount} Fields · {MODULE_PILLS.length} Modules
                </div>
              </div>

              <div className={styles.modulesBlock}>
                <h3 className={styles.modulesTitle}>Included modules</h3>
                <div className={styles.modulePills}>
                  {visibleModulePills.map((m) => (
                    <span key={m.label} className={styles.modulePill}>
                      <MaterialSymbol name={m.icon} size="sm" className={styles.modulePillIcon} aria-hidden />
                      {m.label}
                    </span>
                  ))}
                  {moduleOverflowCollapsed > 0 && !modulesExpanded ? (
                    <button
                      type="button"
                      className={styles.modulePillMore}
                      onClick={() => setModulesExpanded(true)}
                    >
                      + {moduleOverflowCollapsed} more
                    </button>
                  ) : MODULE_PILLS.length > 5 && modulesExpanded ? (
                    <button type="button" className={styles.modulePillMore} onClick={() => setModulesExpanded(false)}>
                      Show less
                    </button>
                  ) : null}
                </div>
              </div>

              {optionalIndustryLoading ? (
                <p className={styles.muted}>Loading fields…</p>
              ) : (
                <>
                  <div className={styles.sampleFieldsHead}>
                    <h3 className={styles.sampleFieldsTitle}>Sample of active fields ({totalFieldCount})</h3>
                  </div>
                  {sampleFieldRows.length === 0 ? (
                    <p className={styles.muted}>No catalog fields are configured for this industry yet.</p>
                  ) : (
                    <ul className={styles.sampleFieldGrid}>
                      {sampleFieldRows.map((f) => (
                        <li key={f.id} className={styles.sampleFieldRow}>
                          <span className={styles.sampleFieldIcon} aria-hidden>
                            <MaterialSymbol name={fieldRowIcon(f.type)} size="sm" />
                          </span>
                          <span className={styles.sampleFieldLabel}>{f.label}</span>
                          <span className={styles.sampleFieldType}>{fieldTypeLabel(f.type)}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className={styles.asideFootnote}>
                    Want a different setup? You can switch to another industry at any time. Your existing data stays in{' '}
                    {PRODUCT_DISPLAY_NAME} unless you remove it elsewhere.
                  </p>
                  <div className={styles.asideFootActions}>
                    <Button type="button" variant="secondary" size="sm" onClick={scrollToIndustry}>
                      <MaterialSymbol name="sync" size="sm" className={styles.btnLeadingIcon} />
                      Change industry
                    </Button>
                  </div>

                  {sortedCoreIndustryFields.length > 0 ? (
                    <div className={`${styles.fieldGroup} ${styles.fieldGroupTop}`}>
                      <div className={`${infoHelpHeadingRowClassName} ${styles.fieldGroupHeadingRow}`.trim()}>
                        <h3 className={styles.fieldGroupTitle}>Always on your forms</h3>
                        <InfoHelpIcon
                          title="Always on fields info"
                          modalTitle="Always on your forms"
                          message="Shown on every lead and contact and not controlled by optional packs below."
                        />
                      </div>
                      <ul className={styles.fieldChipList}>
                        {sortedCoreIndustryFields.map((f) => (
                          <li key={f.id} className={styles.fieldChip}>
                            <span className={styles.fieldChipLabel}>{f.label}</span>
                            <span className={styles.fieldChipMeta}>{fieldTypeLabel(f.type)}</span>
                            {Number(f.is_required) === 1 ? (
                              <span className={styles.fieldChipBadge}>Required</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {optionalIndustryFields.length === 0 ? (
                    sortedCoreIndustryFields.length > 0 ? (
                      <p className={styles.muted}>No optional field packs exist for this industry.</p>
                    ) : null
                  ) : (
                    <div className={styles.optionalPacksBlock}>
                      <div className={styles.optionalPacksHeading}>
                        <h3 className={styles.optionalPacksTitle}>Optional field packs</h3>
                        <InfoHelpIcon
                          title="Optional packs info"
                          modalTitle="Optional field packs"
                          message="Enable packs on the right, disable on the left, then save."
                        />
                      </div>
                      <div className={styles.optionalPacksRow}>
                        <div
                          className={`${styles.optionalPackPane} ${styles.optionalPackPaneAvailable}`}
                          aria-labelledby="optional-packs-available-heading"
                        >
                          <div className={styles.optionalPackPaneHeader}>
                            <div className={styles.optionalPackPaneTitleGroup}>
                              <h4 className={styles.optionalPackPaneTitle} id="optional-packs-available-heading">
                                Not using yet
                              </h4>
                              <InfoHelpIcon
                                title="Not using yet info"
                                modalTitle="Not using yet"
                                message="Check a box to show this field on leads and contacts."
                              />
                            </div>
                            <span className={styles.optionalPackPaneBadge} aria-hidden>
                              {availableOptionalIndustryFields.length}
                            </span>
                          </div>
                          {availableOptionalIndustryFields.length === 0 ? (
                            <p className={styles.optionalPackPaneEmpty}>All optional packs are turned on.</p>
                          ) : (
                            <div className={styles.optionalIndustryList}>
                              {availableOptionalIndustryFields.map((f) => (
                                <Checkbox
                                  key={f.id}
                                  label={`${f.label} (${f.field_key})`}
                                  checked={!!f.is_enabled}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setOptionalIndustryFields((prev) =>
                                      prev.map((row) => (row.id === f.id ? { ...row, is_enabled: checked } : row))
                                    );
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div
                          className={`${styles.optionalPackPane} ${styles.optionalPackPaneActive}`}
                          aria-labelledby="optional-packs-active-heading"
                        >
                          <div className={styles.optionalPackPaneHeader}>
                            <div className={styles.optionalPackPaneTitleGroup}>
                              <h4 className={styles.optionalPackPaneTitle} id="optional-packs-active-heading">
                                Active for your workspace
                              </h4>
                              <InfoHelpIcon
                                title="Active packs info"
                                modalTitle="Active for your workspace"
                                message="Uncheck to hide from forms (after save)."
                              />
                            </div>
                            <span className={styles.optionalPackPaneBadge} aria-hidden>
                              {selectedOptionalIndustryFields.length}
                            </span>
                          </div>
                          {selectedOptionalIndustryFields.length === 0 ? (
                            <p className={styles.optionalPackPaneEmpty}>
                              None yet — turn on packs from “Not using yet.”
                            </p>
                          ) : (
                            <div className={styles.optionalIndustryList}>
                              {selectedOptionalIndustryFields.map((f) => (
                                <Checkbox
                                  key={f.id}
                                  label={`${f.label} (${f.field_key})`}
                                  checked={!!f.is_enabled}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setOptionalIndustryFields((prev) =>
                                      prev.map((row) => (row.id === f.id ? { ...row, is_enabled: checked } : row))
                                    );
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={styles.actions}>
                        <Button type="button" onClick={handleSaveOptionalIndustryFields} disabled={optionalIndustrySaving}>
                          {optionalIndustrySaving ? 'Saving…' : 'Save industry fields'}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
              </>
            )}
          </Card>
        </div>
      </div>

      {showSuccessBar ? (
        <div className={styles.successBar} role="status">
          <div className={styles.successBarInner}>
            <MaterialSymbol name="check_circle" size="sm" className={styles.successBarIcon} aria-hidden />
            <p className={styles.successBarText}>
              <strong>{activeIndustryRow?.name || 'Your'} industry</strong> is active. Core fields and enabled packs are
              ready on leads and contacts.
            </p>
            <div className={styles.successBarActions}>
              <Button type="button" variant="secondary" size="sm" onClick={scrollToFieldPacks}>
                View active setup
                <MaterialSymbol name="chevron_right" size="sm" className={styles.btnTrailingIcon} />
              </Button>
              <button type="button" className={styles.successBarDismiss} onClick={dismissSuccessBar}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
