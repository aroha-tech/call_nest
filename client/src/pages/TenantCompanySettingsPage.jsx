import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
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
import styles from './TenantCompanySettingsPage.module.scss';

const SLUG_DEBOUNCE_MS = 400;
const NO_INDUSTRY = '__none__';

export function TenantCompanySettingsPage() {
  const dispatch = useDispatch();

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
  const [optionalIndustryLoading, setOptionalIndustryLoading] = useState(false);
  const [optionalIndustrySaving, setOptionalIndustrySaving] = useState(false);
  const [optionalIndustryError, setOptionalIndustryError] = useState(null);

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
      const res = await tenantIndustryFieldsAPI.getOptionalSettings();
      const rows = res?.data?.data?.fields ?? [];
      setOptionalIndustryFields(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setOptionalIndustryFields([]);
      setOptionalIndustryError(err.response?.data?.error || err.message || 'Failed to load industry field options');
    } finally {
      setOptionalIndustryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (bundle?.tenant?.id) loadOptionalIndustryFields();
  }, [bundle?.tenant?.id, loadOptionalIndustryFields]);

  const tenant = bundle?.tenant;
  const industryOptionsRaw = bundle?.industry_options ?? [];

  useEffect(() => {
    if (!tenant) return;
    setName(tenant.name ?? '');
    setSlugInput(tenant.slug ?? '');
    setIndustryId(tenant.industry_id || NO_INDUSTRY);
    setSlugChangedNotice(false);
    setFieldErrors({});
    setSaveError(null);
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

  const industrySelectOptions = [
    { value: NO_INDUSTRY, label: 'Not set' },
    ...industryOptionsRaw.map((i) => ({ value: i.id, label: i.name })),
  ];

  const slugSourceError = describeTenantSlugSourceIssue(slugInput);
  const slugFormatError = validateSlug(slugNormalized);

  const slugFieldError =
    fieldErrors.slug ||
    (slugSourceError || slugFormatError) ||
    (slugRemote.available === false && slugRemote.message) ||
    null;

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

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeader title="Company settings" description="Manage your organization profile." />
        <p className={styles.muted}>Loading…</p>
      </div>
    );
  }

  if (loadError || !bundle?.tenant) {
    return (
      <div className={styles.page}>
        <PageHeader title="Company settings" description="Manage your organization profile." />
        <Alert variant="error">{loadError || 'Could not load settings'}</Alert>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Company settings"
        description="Your company name, workspace address, and industry. Workspace address is used in your team’s sign-in URL."
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
            hint={
              slugRemote.loading
                ? 'Checking availability…'
                : slugRemote.available === true && slugNormalized !== tenant.slug
                  ? 'This address is available.'
                  : 'Lowercase letters and hyphens only — used in your sign-in URL.'
            }
            disabled={saving}
            autoComplete="off"
          />

          <Select
            label="Industry"
            value={industryId}
            onChange={(e) => setIndustryId(e.target.value)}
            options={industrySelectOptions}
            disabled={saving}
            placeholder="Select industry"
          />

          <div className={styles.actions}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>

      {tenant?.industry_id ? (
        <Card className={styles.card}>
          <h2 className={styles.sectionTitle}>Industry field packs</h2>
          <p className={styles.muted}>
            Optional fields defined for your industry can be turned on here. Required industry fields are always shown on
            leads and contacts.
          </p>
          {optionalIndustryError ? (
            <Alert variant="error" className={styles.alert}>
              {optionalIndustryError}
            </Alert>
          ) : null}
          {optionalIndustryLoading ? (
            <p className={styles.muted}>Loading…</p>
          ) : optionalIndustryFields.length === 0 ? (
            <p className={styles.muted}>No optional industry fields are available.</p>
          ) : (
            <>
              <div className={styles.optionalIndustryList}>
                {optionalIndustryFields.map((f) => (
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
              <div className={styles.actions}>
                <Button type="button" onClick={handleSaveOptionalIndustryFields} disabled={optionalIndustrySaving}>
                  {optionalIndustrySaving ? 'Saving…' : 'Save industry fields'}
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}
