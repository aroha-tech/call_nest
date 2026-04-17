import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { tenantCompanyAPI } from '../../services/tenantCompanyAPI';
import { resolveImportSamplesForTenantIndustry } from './importSampleByIndustry';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { MultiSelectDropdown } from '../../components/ui/MultiSelectDropdown';
import { contactsAPI } from '../../services/contactsAPI';
import { contactTagsAPI } from '../../services/contactTagsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  getCallingCodeOptionsForSelect,
  normalizeCallingCode,
} from '../../utils/phoneInput';
import listStyles from '../../components/admin/adminDataList.module.scss';
import styles from './ContactImportPage.module.scss';

/** Match server default (5 MB); set VITE_CSV_IMPORT_MAX_MB in client .env if server uses CSV_IMPORT_MAX_FILE_BYTES */
const CSV_IMPORT_MAX_BYTES =
  import.meta.env.VITE_CSV_IMPORT_MAX_MB != null && import.meta.env.VITE_CSV_IMPORT_MAX_MB !== ''
    ? Number(import.meta.env.VITE_CSV_IMPORT_MAX_MB) * 1024 * 1024
    : 5 * 1024 * 1024;
const CSV_IMPORT_MAX_MB = Math.round(CSV_IMPORT_MAX_BYTES / 1024 / 1024);

/** Public folder — `client/public/import-samples/` */
function importSampleHref(filename) {
  const base = import.meta.env.BASE_URL || '/';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}import-samples/${filename}`;
}

const NEW_CUSTOM_VALUE = '__new_custom__';

/** New column → tenant custom field: user picks storage / parsing type (no Auto). */
const VALUE_TYPES_NEW_CUSTOM_FIELD = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select (checkboxes)' },
  { value: 'multiselect_dropdown', label: 'Multi-select (dropdown)' },
];

/** How to read cell values for an existing custom field — default is the field’s DB type (no separate “Auto”). */
const VALUE_TYPES_CUSTOM_IMPORT = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select (checkboxes)' },
  { value: 'multiselect_dropdown', label: 'Multi-select (dropdown)' },
];

function defaultImportValueTypeFromField(cf) {
  const t = cf?.type;
  if (
    t === 'text' ||
    t === 'number' ||
    t === 'date' ||
    t === 'boolean' ||
    t === 'select' ||
    t === 'multiselect' ||
    t === 'multiselect_dropdown'
  ) {
    return t;
  }
  return 'text';
}

/** Resolves legacy `auto` / missing to the field definition type for the dropdown. */
function effectiveCustomImportValueType(entry, cf) {
  const iv = entry?.importValueType;
  if (iv && iv !== 'auto') return iv;
  return defaultImportValueTypeFromField(cf);
}

function isCustomFieldValueTypeMapping(m) {
  if (!m?.target) return false;
  if (m.target === 'new_custom') return true;
  return m.target === 'custom' && !!m.customFieldId;
}

function duplicateBadge(dup) {
  if (dup === 'create') {
    return <span className={`${styles.duplicateBadge} ${styles.duplicateCreate}`}>New</span>;
  }
  if (dup === 'skip') {
    return <span className={`${styles.duplicateBadge} ${styles.duplicateSkip}`}>Skip dup</span>;
  }
  if (dup === 'update') {
    return <span className={`${styles.duplicateBadge} ${styles.duplicateUpdate}`}>Update dup</span>;
  }
  return null;
}

export function ContactImportPage({ type }) {
  const navigate = useNavigate();
  const user = useAppSelector(selectUser);
  const title = useMemo(() => (type === 'lead' ? 'Import Leads' : 'Import Contacts'), [type]);
  const historyPath = type === 'lead' ? '/leads/import/history' : '/contacts/import/history';

  const canSetImportOwnership = user?.role === 'admin' || user?.role === 'manager';

  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('skip'); // skip | update
  const [defaultCountryCode, setDefaultCountryCode] = useState(DEFAULT_PHONE_COUNTRY_CODE);
  const [tagOptions, setTagOptions] = useState([]);
  const [tenantUsers, setTenantUsers] = useState([]);
  const [importTagsJson, setImportTagsJson] = useState('');
  const [importManagerId, setImportManagerId] = useState('');
  const [importAssignedUserId, setImportAssignedUserId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [reviewData, setReviewData] = useState(null);
  const [resolvingPreview, setResolvingPreview] = useState(false);
  const previewDebounceRef = useRef(null);

  /** From GET /api/tenant/company — drives which sample CSV we offer */
  const [workspaceIndustry, setWorkspaceIndustry] = useState(null);
  const [workspaceIndustryLoading, setWorkspaceIndustryLoading] = useState(true);

  useEffect(() => {
    if (!user || user.isPlatformAdmin) {
      setWorkspaceIndustry(null);
      setWorkspaceIndustryLoading(false);
      return;
    }
    let cancelled = false;
    setWorkspaceIndustryLoading(true);
    (async () => {
      try {
        const res = await tenantCompanyAPI.get();
        const t = res?.data?.data?.tenant;
        if (!cancelled) {
          setWorkspaceIndustry(
            t
              ? {
                  industryCode: t.industry_code ?? null,
                  industryName: t.industry_name ?? null,
                }
              : null
          );
        }
      } catch {
        if (!cancelled) setWorkspaceIndustry(null);
      } finally {
        if (!cancelled) setWorkspaceIndustryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isPlatformAdmin]);

  const importSampleBundle = useMemo(
    () =>
      resolveImportSamplesForTenantIndustry({
        industryCode: workspaceIndustry?.industryCode,
        industryName: workspaceIndustry?.industryName,
      }),
    [workspaceIndustry?.industryCode, workspaceIndustry?.industryName]
  );

  const importSampleLinks = useMemo(() => {
    const { tailored, minimal } = importSampleBundle;
    const links = [];
    if (tailored) links.push(tailored);
    links.push(minimal);
    return links;
  }, [importSampleBundle]);

  const importSampleIntro = useMemo(() => {
    if (user?.isPlatformAdmin) {
      return 'Signed in as platform admin — use the minimal template below, or open Import from a tenant workspace for an industry-matched example.';
    }
    if (workspaceIndustryLoading) return 'Loading sample for your workspace…';
    const { tailored } = importSampleBundle;
    const named = workspaceIndustry?.industryName?.trim();
    if (tailored) {
      return named
        ? `Example headers for ${named}. Replace phone numbers with your data; map extra columns in step 3.`
        : 'Example headers for your industry. Replace phone numbers with your data; map extra columns in step 3.';
    }
    if (workspaceIndustry?.industryCode || named) {
      return 'No tailored example for this industry code yet — use the minimal template below or map your file in step 3.';
    }
    return 'Set your industry under Company settings to get a tailored example. The minimal template works for any import.';
  }, [
    importSampleBundle,
    user?.isPlatformAdmin,
    workspaceIndustry?.industryCode,
    workspaceIndustry?.industryName,
    workspaceIndustryLoading,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tRes, uRes] = await Promise.all([
          contactTagsAPI.list(),
          tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false }),
        ]);
        if (cancelled) return;
        setTagOptions(
          (tRes?.data?.data ?? []).map((t) => ({
            value: String(t.id),
            label: t.name,
          }))
        );
        setTenantUsers(uRes?.data?.data ?? []);
      } catch {
        if (!cancelled) {
          setTagOptions([]);
          setTenantUsers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const managerSelectOptions = useMemo(() => {
    const base = [{ value: '', label: '— Not set (use normal rules) —' }];
    let mgrs = tenantUsers.filter((u) => u.role === 'manager');
    if (user?.role === 'manager' && user?.id) {
      mgrs = mgrs.filter((u) => Number(u.id) === Number(user.id));
    }
    return [
      ...base,
           ...mgrs
        .map((u) => ({
          value: String(u.id),
          label: u.name || u.email || '—',
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [tenantUsers, user]);

  const agentSelectOptions = useMemo(() => {
    const base = [{ value: '', label: '— Not set (use normal rules) —' }];
    let agents = tenantUsers.filter((u) => u.role === 'agent');
    if (user?.role === 'manager' && user?.id) {
      agents = agents.filter((u) => Number(u.manager_id) === Number(user.id));
    } else if (importManagerId && user?.role === 'admin') {
      agents = agents.filter((u) => Number(u.manager_id) === Number(importManagerId));
    }
    return [
      ...base,
      ...agents
        .map((u) => ({
          value: String(u.id),
          label: u.name || u.email || '—',
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [tenantUsers, user, importManagerId]);

  const hasPreview = !!preview && Array.isArray(preview.columns);
  const canPreview = !!file && !loading;
  const canSubmit = !!file && hasPreview && !!reviewData && !loading && !resolvingPreview;

  const importStepper = useMemo(() => {
    const step1Done = !!file;
    const step2Done = hasPreview || !!result;
    const step3Done = !!result;
    const current = !file ? 1 : !hasPreview ? 2 : 3;
    const step1Current = current === 1;
    const step2Current = current === 2;
    const step3Current = current === 3 && !result;
    return { step1Done, step2Done, step3Done, step1Current, step2Current, step3Current };
  }, [file, hasPreview, result]);

  const resetFileAndPreview = () => {
    setPreview(null);
    setMapping({});
    setReviewData(null);
  };

  /** Built-in contact columns + tenant custom fields from API — not hardcoded on the client. */
  const fieldOptions = useMemo(() => {
    const core =
      preview?.coreFields?.map((c) => ({
        value: c.key,
        label: c.label,
      })) || [];

    const custom =
      preview?.customFields
        ?.map((cf) => ({
          value: `custom:${cf.id}`,
          label: cf.label || cf.name,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)) || [];

    const known = new Set([
      'ignore',
      NEW_CUSTOM_VALUE,
      ...core.map((o) => o.value),
      ...custom.map((o) => o.value),
    ]);

    const orphan = [];
    const seen = new Set();
    for (const m of Object.values(mapping)) {
      const t = m?.target;
      if (!t || t === 'ignore' || t === 'new_custom') continue;
      if (t === 'custom' && m.customFieldId) {
        const v = `custom:${m.customFieldId}`;
        if (!known.has(v) && !seen.has(v)) {
          seen.add(v);
          orphan.push({ value: v, label: 'Custom field' });
        }
        continue;
      }
      if (!known.has(t) && !seen.has(t)) {
        seen.add(t);
        orphan.push({ value: t, label: `${t} (legacy mapping)` });
      }
    }

    return [
      { value: 'ignore', label: '-- unmapped --' },
      {
        value: NEW_CUSTOM_VALUE,
        label: 'Add new custom field',
      },
      ...core,
      ...custom,
      ...orphan,
    ];
  }, [preview, mapping]);

  /** If the current mapping/suggestion isn’t in the dropdown, the browser shows a blank &lt;select&gt; — coerce to unmapped. */
  const fieldOptionValues = useMemo(() => new Set(fieldOptions.map((o) => o.value)), [fieldOptions]);

  const assertFileSize = () => {
    if (file && file.size > CSV_IMPORT_MAX_BYTES) {
      setError(`File is too large (max ${CSV_IMPORT_MAX_MB} MB). Split the file or ask your admin to raise the limit.`);
      return false;
    }
    return true;
  };

  const fetchResolvedPreview = useCallback(async () => {
    if (!file || !hasPreview) return;
    if (file.size > CSV_IMPORT_MAX_BYTES) {
      setReviewData(null);
      return;
    }
    setResolvingPreview(true);
    setError('');
    try {
      const res = await contactsAPI.resolveImportPreview({
        file,
        type,
        mode,
        default_country_code: normalizeCallingCode(defaultCountryCode || DEFAULT_PHONE_COUNTRY_CODE),
        mapping,
        limit: 12,
      });
      setReviewData(res?.data || null);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to build contact preview';
      setError(String(msg));
      setReviewData(null);
    } finally {
      setResolvingPreview(false);
    }
  }, [file, hasPreview, type, mode, defaultCountryCode, mapping]);

  useEffect(() => {
    if (!file || !hasPreview) return undefined;
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => {
      fetchResolvedPreview();
    }, 420);
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    };
  }, [file, hasPreview, mapping, mode, type, defaultCountryCode, fetchResolvedPreview]);

  const handlePreview = async () => {
    if (!file || loading) return;
    if (!assertFileSize()) return;
    setLoading(true);
    setError('');
    setResult(null);
    setReviewData(null);
    try {
      const res = await contactsAPI.previewImport(file);
      const data = res?.data || {};
      setPreview(data);

      const coreKeys = new Set((data.coreFields || []).map((c) => c.key));
      const initial = {};
      (data.columns || []).forEach((col) => {
        const suggested = col.suggested || 'ignore';
        if (!suggested || suggested === 'ignore') return;
        if (suggested.startsWith('custom:')) {
          const cid = Number(suggested.split(':')[1]);
          const cf = data.customFields?.find((c) => Number(c.id) === cid);
          if (!cf) return;
          initial[col.normalized] = {
            target: 'custom',
            customFieldId: cid,
            importValueType: defaultImportValueTypeFromField(cf),
          };
          return;
        }
        if (coreKeys.has(suggested)) {
          initial[col.normalized] = { target: suggested };
        }
      });
      setMapping(initial);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to load preview';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  const excelSampleRowCount = useMemo(() => {
    if (!preview?.columns?.length) return 0;
    const lens = preview.columns.map((c) => (Array.isArray(c.samples) ? c.samples.length : 0));
    const max = lens.length === 0 ? 0 : Math.max(...lens);
    return Math.min(8, Math.max(max, 3));
  }, [preview]);

  /** Core `contacts` extras (city, state, …) as real columns — only keys that have a value in at least one preview row. */
  const previewStandardExtraColumns = useMemo(() => {
    const meta = reviewData?.standardExtraFieldColumns ?? preview?.standardExtraFieldColumns ?? [];
    const rows = reviewData?.sampleRows;
    if (!meta.length || !rows?.length) return [];
    const keysWithData = new Set();
    for (const row of rows) {
      if (row.error) continue;
      for (const { key } of meta) {
        const v = row[key];
        if (v !== undefined && v !== null && String(v).trim() !== '') keysWithData.add(key);
      }
    }
    return meta.filter((c) => keysWithData.has(c.key));
  }, [reviewData, preview]);

  const previewTableColCount = 8 + previewStandardExtraColumns.length;

  function getColumnMapValueForState(m, col) {
    const key = col.normalized;
    const current = m[key];
    let currentValue = 'ignore';
    if (current?.target === 'new_custom') {
      currentValue = NEW_CUSTOM_VALUE;
    } else if (current?.target === 'custom' && current.customFieldId) {
      currentValue = `custom:${current.customFieldId}`;
    } else if (current?.target) {
      currentValue = current.target;
    } else if (col.suggested) {
      currentValue = col.suggested;
    }
    return currentValue;
  }

  function getColumnMapValue(col) {
    return getColumnMapValueForState(mapping, col);
  }

  /** Drop mapping entries that no longer match any dropdown option (fixes blank selects & bad imports). */
  useEffect(() => {
    if (!hasPreview || !preview?.columns?.length || fieldOptionValues.size === 0) return;
    setMapping((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const col of preview.columns) {
        const raw = getColumnMapValueForState(prev, col);
        if (!fieldOptionValues.has(raw) && next[col.normalized]) {
          delete next[col.normalized];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [hasPreview, preview?.columns, fieldOptionValues]);

  function setColumnMapping(col, value) {
    const key = col.normalized;
    setReviewData(null);
    setMapping((prev) => {
      const next = { ...prev };
      if (value === 'ignore') {
        next[key] = { target: 'ignore' };
        return next;
      }
      if (value === NEW_CUSTOM_VALUE) {
        const suggested = col.suggestedFieldType || 'text';
        next[key] = {
          target: 'new_custom',
          fieldType: suggested,
          fieldLabel: col.header,
          selectOptions: '',
        };
        return next;
      }
      if (value.startsWith('custom:')) {
        const id = Number(value.split(':')[1]);
        const cf = preview?.customFields?.find((c) => Number(c.id) === id);
        next[key] = {
          target: 'custom',
          customFieldId: id,
          importValueType: defaultImportValueTypeFromField(cf),
        };
      } else {
        next[key] = { target: value };
      }
      return next;
    });
  }

  const handleImport = async () => {
    if (!file || !hasPreview || !reviewData || loading) return;
    if (!assertFileSize()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      let tag_ids = [];
      try {
        if (importTagsJson && String(importTagsJson).trim()) {
          const parsed = JSON.parse(importTagsJson);
          if (Array.isArray(parsed)) tag_ids = parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
        }
      } catch {
        tag_ids = [];
      }

      const res = await contactsAPI.importCsv({
        file,
        type,
        mode,
        default_country_code: normalizeCallingCode(defaultCountryCode || DEFAULT_PHONE_COUNTRY_CODE),
        mapping,
        tag_ids: tag_ids.length > 0 ? tag_ids : undefined,
        import_manager_id: canSetImportOwnership && importManagerId ? importManagerId : undefined,
        import_assigned_user_id:
          canSetImportOwnership && importAssignedUserId ? importAssignedUserId : undefined,
      });
      setResult(res?.data || null);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Import failed';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={listStyles.page}>
      <PageHeader
        title={title}
        description="Upload CSV or Excel (.xlsx) exports from Meta, Google, IndiaMART, JustDial, 99acres, MagicBricks, NoBroker, etc. Column names are auto-mapped; adjust below if needed. Duplicates match on primary phone. You can upload a real .xlsx file — renaming .xlsx to .csv is not needed."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => navigate(historyPath)}>
              Import history
            </Button>
            <Button variant="secondary" onClick={() => navigate(type === 'lead' ? '/leads' : '/contacts')}>
              Back
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={`${listStyles.tableCard} ${styles.importTableCard}`}>
        <div className={styles.cardBody}>
          <div className={styles.wrap}>
            <nav className={styles.stepper} aria-label="Import steps">
              <div className={styles.stepperList} role="list">
                <div
                  role="listitem"
                  className={`${styles.stepperItem} ${
                    importStepper.step1Done ? styles.stepperItemDone : ''
                  } ${importStepper.step1Current ? styles.stepperItemCurrent : ''}`}
                >
                  <span className={styles.stepperTrack}>
                    <span className={styles.stepperCircle} aria-hidden="true">
                      {importStepper.step1Done ? '✓' : '1'}
                    </span>
                  </span>
                  <span className={styles.stepperLabel}>Select file</span>
                </div>
                <div className={styles.stepperConnector} aria-hidden="true">
                  <span
                    className={`${styles.stepperLine} ${importStepper.step1Done ? styles.stepperLineDone : ''}`}
                  />
                </div>
                <div
                  role="listitem"
                  className={`${styles.stepperItem} ${
                    importStepper.step2Done ? styles.stepperItemDone : ''
                  } ${importStepper.step2Current ? styles.stepperItemCurrent : ''}`}
                >
                  <span className={styles.stepperTrack}>
                    <span className={styles.stepperCircle} aria-hidden="true">
                      {importStepper.step2Done ? '✓' : '2'}
                    </span>
                  </span>
                  <span className={styles.stepperLabel}>Import settings</span>
                </div>
                <div className={styles.stepperConnector} aria-hidden="true">
                  <span
                    className={`${styles.stepperLine} ${importStepper.step2Done ? styles.stepperLineDone : ''}`}
                  />
                </div>
                <div
                  role="listitem"
                  className={`${styles.stepperItem} ${
                    importStepper.step3Done ? styles.stepperItemDone : ''
                  } ${importStepper.step3Current ? styles.stepperItemCurrent : ''}`}
                >
                  <span className={styles.stepperTrack}>
                    <span className={styles.stepperCircle} aria-hidden="true">
                      {importStepper.step3Done ? '✓' : '3'}
                    </span>
                  </span>
                  <span className={styles.stepperLabel}>Map &amp; import</span>
                </div>
              </div>
            </nav>

            {!hasPreview ? (
              <div className={styles.stepsRow}>
                <div className={styles.stepCard}>
                  <div className={styles.stepTitle}>
                    <div className={styles.stepTitleText}>Upload file</div>
                    {file ? <div className={styles.stepHint}>{file.name}</div> : null}
                  </div>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] || null);
                      setPreview(null);
                      setMapping({});
                      setReviewData(null);
                      setResult(null);
                      setError('');
                    }}
                    className={styles.fileInput}
                  />
                    <div className={styles.footerNote} style={{ marginTop: 8 }}>
                      Each row needs a <b>name</b> (full name, first+last, or display name) and <b>first name or email</b>.
                      Phone columns like mobile / contact_number / whatsapp are detected automatically.
                      <div style={{ marginTop: 6 }}>
                        <b>Duplicates:</b> same primary phone within this import type ({type}) — Skip mode leaves the
                        existing row unchanged; Update mode refreshes it. Leads and contacts are separate: the same
                        number can exist as both a lead and a contact without merging or changing type.
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <b>Max file size:</b> {CSV_IMPORT_MAX_MB} MB · <b>Max rows per run:</b> 2000 (split larger files).
                      </div>
                      <div className={styles.sampleCsvBlock}>
                        <div className={styles.sampleCsvTitle}>Sample CSV (download)</div>
                        <p className={styles.sampleCsvIntro}>{importSampleIntro}</p>
                        <ul className={styles.sampleCsvList}>
                          {importSampleLinks.map(({ filename, label }) => (
                            <li key={filename}>
                              <a
                                href={importSampleHref(filename)}
                                download={filename}
                                className={styles.sampleCsvLink}
                                title={filename}
                              >
                                {label}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                </div>

                <div className={styles.stepCard}>
                  <div className={styles.stepTitle}>
                    <div className={styles.stepTitleText}>Import settings</div>
                    <div className={styles.stepHint}>Duplicates are checked by primary phone</div>
                  </div>

                  <div className={styles.grid2}>
                    <Select
                      label="Mode"
                      value={mode}
                      onChange={(e) => {
                        setMode(e.target.value);
                        setReviewData(null);
                      }}
                      options={[
                        { value: 'skip', label: 'Skip duplicates (by primary phone)' },
                        { value: 'update', label: 'Update duplicates (by primary phone)' },
                      ]}
                      placeholder="Select mode..."
                    />
                    <Select
                      label="Default country code"
                      value={normalizeCallingCode(defaultCountryCode)}
                      onChange={(e) => {
                        setDefaultCountryCode(e.target.value);
                        setReviewData(null);
                      }}
                      options={getCallingCodeOptionsForSelect(defaultCountryCode)}
                    />
                  </div>

                  <div className={styles.importBulkOptions}>
                    <MultiSelectDropdown
                      label="Tags (optional — add to every imported row)"
                      options={tagOptions}
                      value={importTagsJson}
                      onChange={(v) => {
                        setImportTagsJson(v);
                      }}
                      placeholder="Select tags…"
                    />
                    {canSetImportOwnership ? (
                      <div className={styles.grid2}>
                        <Select
                          label="Default manager (optional)"
                          value={importManagerId}
                          onChange={(e) => {
                            setImportManagerId(e.target.value);
                            setImportAssignedUserId('');
                          }}
                          options={managerSelectOptions}
                        />
                        <Select
                          label="Default assigned agent (optional)"
                          value={importAssignedUserId}
                          onChange={(e) => setImportAssignedUserId(e.target.value)}
                          options={agentSelectOptions}
                        />
                      </div>
                    ) : null}
                    <div className={styles.importBulkHint}>
                      Manager and agent columns in the file override these defaults. For rows that already exist,
                      selected tags are added alongside existing tags (nothing is removed).
                    </div>
                  </div>

                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button onClick={handlePreview} disabled={!canPreview} loading={loading}>
                      Next: Preview &amp; map columns
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.importSummaryBar}>
                <div className={styles.importSummaryItems}>
                  <span>
                    <strong>File:</strong> {file?.name ?? '—'}
                  </span>
                  <span className={styles.importSummarySep} aria-hidden="true">
                    ·
                  </span>
                  <span>
                    <strong>Mode:</strong>{' '}
                    {mode === 'skip' ? 'Skip duplicates' : 'Update duplicates'}
                  </span>
                  <span className={styles.importSummarySep} aria-hidden="true">
                    ·
                  </span>
                  <span>
                    <strong>Country:</strong> {normalizeCallingCode(defaultCountryCode || DEFAULT_PHONE_COUNTRY_CODE)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    resetFileAndPreview();
                  }}
                  disabled={loading}
                >
                  Change file &amp; settings
                </Button>
              </div>
            )}

            {hasPreview && (
              <div className={styles.stepCard}>
                <div className={styles.stepTitle}>
                  <div className={styles.stepTitleText}>Match columns &amp; preview contacts</div>
                  <div className={styles.stepHint}>
                    One column from your file per column below. Pick what to save each as, check the header and samples,
                    then review the contact preview — it updates as you change mappings.
                  </div>
                </div>
                <div className={styles.footerNote} style={{ marginBottom: 10 }}>
                  For each column, choose where it should be saved. <b>Unmapped</b> skips that column. Standard
                  contact fields (name, phone, city, …) and your existing extra fields are in the list. Pick{' '}
                  <b>Add new custom field</b> when you need a new extra field — values import into it. Use{' '}
                  <b>Data type</b> only if the values in the file don&apos;t match the usual format. Sample rows are from
                  your file.
                </div>
                <div className={styles.dataMappingTitle}>Match your file columns</div>
                <div className={styles.excelWrap}>
                  <div className={styles.excelScroll}>
                    <table className={styles.excelGrid}>
                      <thead>
                        <tr>
                          <th className={styles.excelCorner} scope="col" />
                          {preview.columns.map((col, idx) => (
                            <th key={col.normalized} className={styles.excelColHead} scope="col">
                              Column {idx + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className={styles.excelMapRow}>
                          <th className={styles.excelRowHead} scope="row">
                            Save as
                          </th>
                          {preview.columns.map((col) => {
                            const key = col.normalized;
                            const current = mapping[key];
                            const rawMapValue = getColumnMapValue(col);
                            const selectValue = fieldOptionValues.has(rawMapValue)
                              ? rawMapValue
                              : 'ignore';
                            return (
                              <td key={col.normalized} className={styles.excelMapCell}>
                                <select
                                  value={selectValue}
                                  onChange={(e) => setColumnMapping(col, e.target.value)}
                                  className={styles.selectExcel}
                                  aria-label={`Save column ${col.header} as`}
                                >
                                  {fieldOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                {isCustomFieldValueTypeMapping(current) ? (
                                  <div className={styles.newCustomExtras}>
                                    <span className={styles.subLabel}>Data type</span>
                                    {current.target === 'new_custom' ? (
                                      <select
                                        className={styles.selectExcel}
                                        value={current.fieldType || col.suggestedFieldType || 'text'}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          setReviewData(null);
                                          setMapping((prev) => {
                                            const cur = prev[key];
                                            if (cur?.target !== 'new_custom') return prev;
                                            return {
                                              ...prev,
                                              [key]: {
                                                ...cur,
                                                fieldType: v,
                                                fieldLabel: cur.fieldLabel || col.header,
                                              },
                                            };
                                          });
                                        }}
                                        aria-label={`Data type for new field ${col.header}`}
                                      >
                                        {VALUE_TYPES_NEW_CUSTOM_FIELD.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      (() => {
                                        const cf = preview?.customFields?.find(
                                          (c) => Number(c.id) === Number(current.customFieldId)
                                        );
                                        const selectVal = effectiveCustomImportValueType(current, cf);
                                        return (
                                          <select
                                            className={styles.selectExcel}
                                            value={selectVal}
                                            onChange={(e) => {
                                              const v = e.target.value;
                                              setReviewData(null);
                                              setMapping((prev) => {
                                                const cur = prev[key];
                                                if (
                                                  !isCustomFieldValueTypeMapping(cur) ||
                                                  cur?.target === 'new_custom'
                                                )
                                                  return prev;
                                                return {
                                                  ...prev,
                                                  [key]: {
                                                    ...cur,
                                                    importValueType: v,
                                                  },
                                                };
                                              });
                                            }}
                                            aria-label={`Data type for ${col.header}`}
                                          >
                                            {VALUE_TYPES_CUSTOM_IMPORT.map((opt) => (
                                              <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                              </option>
                                            ))}
                                          </select>
                                        );
                                      })()
                                    )}
                                    {current.target === 'new_custom' ? (
                                      <span className={styles.fieldTypeHint}>
                                        Suggested <b>{col.suggestedFieldType || 'text'}</b> from your header and samples
                                        — change <b>Data type</b> if that doesn&apos;t fit. The new field uses this
                                        column&apos;s header as its name.
                                      </span>
                                    ) : current.target === 'custom' && current.customFieldId ? (
                                      (() => {
                                        const cf = preview?.customFields?.find(
                                          (c) => Number(c.id) === Number(current.customFieldId)
                                        );
                                        return cf?.type ? (
                                          <span className={styles.fieldTypeHint}>
                                            This field is usually <b>{cf.type}</b>. The list above starts there — change{' '}
                                            <b>Data type</b> only if this file uses a different format.
                                          </span>
                                        ) : null;
                                      })()
                                    ) : null}
                                    {current.target === 'new_custom' &&
                                    ((current.fieldType || col.suggestedFieldType || 'text') === 'select' ||
                                      (current.fieldType || col.suggestedFieldType || 'text') === 'multiselect' ||
                                      (current.fieldType || col.suggestedFieldType || 'text') ===
                                        'multiselect_dropdown') ? (
                                      <input
                                        type="text"
                                        className={styles.selectOptionsInput}
                                        placeholder="Options: Hot, Warm, Cold"
                                        value={current.selectOptions ?? ''}
                                        onChange={(e) => {
                                          setReviewData(null);
                                          setMapping((prev) => ({
                                            ...prev,
                                            [key]: {
                                              ...prev[key],
                                              target: 'new_custom',
                                              selectOptions: e.target.value,
                                              fieldLabel: prev[key]?.fieldLabel || col.header,
                                            },
                                          }));
                                        }}
                                      />
                                    ) : null}
                                  </div>
                                ) : null}
                              </td>
                            );
                          })}
                        </tr>
                        <tr className={styles.excelHeaderRow}>
                          <th className={styles.excelRowHead} scope="row">
                            Header
                          </th>
                          {preview.columns.map((col) => (
                            <td key={`h-${col.normalized}`} className={styles.excelDataCell}>
                              {col.header || '—'}
                            </td>
                          ))}
                        </tr>
                        {Array.from({ length: excelSampleRowCount }, (_, ri) => (
                          <tr key={`sample-${ri}`} className={styles.excelDataRow}>
                            <th className={styles.excelRowHead} scope="row">
                              {ri + 1}
                            </th>
                            {preview.columns.map((col) => {
                              const v =
                                col.samples && col.samples[ri] !== undefined && col.samples[ri] !== null
                                  ? String(col.samples[ri])
                                  : '';
                              return (
                                <td key={`${col.normalized}-${ri}`} className={styles.excelDataCell}>
                                  {v || <span className={styles.excelEmptyCell}>—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={styles.previewSection}>
                  <div className={styles.previewTitleRow}>
                    <div className={styles.stepTitleText}>Contact preview (first rows)</div>
                    {resolvingPreview ? (
                      <span className={styles.previewStatus}>
                        <Spinner size="sm" /> Updating…
                      </span>
                    ) : reviewData ? (
                      <span className={styles.previewStatusMuted}>
                        {reviewData.totalRows} rows · mode: {reviewData.mode}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.footerNote} style={{ marginBottom: 10 }}>
                    <b>New</b> = new row for this import type. <b>Skip dup</b> / <b>Update dup</b> = that primary phone
                    already exists as a <b>{type}</b>. If it exists only as the other type (lead vs contact), preview
                    shows <b>New</b> — a second record is created. Fix mapping errors before importing. Extra contact
                    details (city,
                    state, …) and your own extra fields show as separate columns when filled. <b>Sample</b> is the
                    preview row number; errors use the real file row.
                  </div>
                  <div className={styles.reviewScroll}>
                    <table className={`${styles.table} ${styles.previewTable}`}>
                      <thead>
                        <tr>
                          <th>Sample</th>
                          <th>Outcome</th>
                          <th>Display name</th>
                          <th>Phone</th>
                          <th>Email</th>
                          <th>Source</th>
                          <th>Status</th>
                          {previewStandardExtraColumns.map((col) => (
                            <th key={col.key}>{col.label}</th>
                          ))}
                          <th>Custom fields</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewData?.sampleRows?.length ? (
                          reviewData.sampleRows.map((row) => (
                            <tr key={`${row.sample_row ?? row.row}-${row.row}`}>
                              <td>{row.sample_row ?? row.row}</td>
                              <td>
                                {row.error ? (
                                  <span style={{ color: 'var(--color-danger)' }}>{row.error}</span>
                                ) : (
                                  <>{duplicateBadge(row.duplicate_action)}</>
                                )}
                              </td>
                              <td>{row.display_name ?? '—'}</td>
                              <td>{row.primary_phone ?? '—'}</td>
                              <td>{row.email ?? '—'}</td>
                              <td>{row.source ?? '—'}</td>
                              <td>{row.status ?? '—'}</td>
                              {previewStandardExtraColumns.map((col) => (
                                <td key={col.key} className={styles.samples}>
                                  {row[col.key] != null && String(row[col.key]).trim() !== ''
                                    ? String(row[col.key])
                                    : '—'}
                                </td>
                              ))}
                              <td className={styles.samples}>
                                {row.custom_fields_preview?.length
                                  ? row.custom_fields_preview.map((c) => `${c.label}: ${c.value}`).join('; ')
                                  : '—'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={previewTableColCount} className={styles.samples}>
                              {resolvingPreview ? 'Loading preview…' : 'Preview will appear after mappings load.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      resetFileAndPreview();
                    }}
                    disabled={loading}
                  >
                    Reset upload
                  </Button>
                  <Button onClick={handleImport} disabled={!canSubmit} loading={loading}>
                    Start import
                  </Button>
                </div>
              </div>
            )}

            <div className={styles.stepCard}>
              <div className={styles.stepTitle}>
                <div className={styles.stepTitleText}>Help</div>
                <div className={styles.stepHint}>What columns can the import understand?</div>
              </div>
                <div className={styles.footerNote}>
                <div>
                  <b>We match common header names</b> (e.g. name, mobile, email, city, source, status) to the right
                  field when you load the file. You can always change the <b>Save as</b> dropdown.
                </div>
                <div style={{ marginTop: 6 }}>
                  <b>Extra fields</b>: pick an existing one from the list, or <b>Add new custom field</b> and set{' '}
                  <b>Data type</b> (text, numbers, dates, yes/no, lists, etc.).
                </div>
                <div style={{ marginTop: 6 }}>
                  <b>Multiple phones</b>: use columns like phone_mobile, phone_work, or phone:mobile in the header.
                </div>
                <div style={{ marginTop: 6 }}>
                  <b>Sample CSV</b>: the <b>Upload file</b> panel offers a template for your workspace industry (when set)
                  plus a minimal template.
                </div>
              </div>
            </div>

            {loading && !result && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Spinner size="sm" /> Working…
              </div>
            )}

            {result && (
              <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Result</div>
                <div>
                  Rows in file: <b>{result.rowCount ?? '—'}</b> | Created: <b>{result.created ?? 0}</b> | Updated:{' '}
                  <b>{result.updated ?? 0}</b> | Skipped: <b>{result.skipped ?? 0}</b> | Failed: <b>{result.failed ?? 0}</b>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="secondary" onClick={() => navigate(historyPath)}>
                    View import history
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => navigate(type === 'lead' ? '/leads' : '/contacts')}
                  >
                    Back to {type === 'lead' ? 'Leads' : 'Contacts'}
                  </Button>
                </div>

                {Array.isArray(result.errors) && result.errors.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>Errors (first {result.errors.length})</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {result.errors.slice(0, 50).map((er, idx) => (
                        <div key={idx} style={{ padding: 10, background: 'rgba(255,0,0,0.05)', borderRadius: 8 }}>
                          <b>Row {er.row}</b>: {er.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
