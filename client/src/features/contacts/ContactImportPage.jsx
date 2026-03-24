import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { contactsAPI } from '../../services/contactsAPI';
import listStyles from '../../components/admin/adminDataList.module.scss';
import styles from './ContactImportPage.module.scss';

/** Match server default (5 MB); set VITE_CSV_IMPORT_MAX_MB in client .env if server uses CSV_IMPORT_MAX_FILE_BYTES */
const CSV_IMPORT_MAX_BYTES =
  import.meta.env.VITE_CSV_IMPORT_MAX_MB != null && import.meta.env.VITE_CSV_IMPORT_MAX_MB !== ''
    ? Number(import.meta.env.VITE_CSV_IMPORT_MAX_MB) * 1024 * 1024
    : 5 * 1024 * 1024;
const CSV_IMPORT_MAX_MB = Math.round(CSV_IMPORT_MAX_BYTES / 1024 / 1024);

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
  const title = useMemo(() => (type === 'lead' ? 'Import Leads' : 'Import Contacts'), [type]);
  const historyPath = type === 'lead' ? '/leads/import/history' : '/contacts/import/history';

  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('skip'); // skip | update
  const [defaultCountryCode, setDefaultCountryCode] = useState('+91');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [reviewData, setReviewData] = useState(null);

  const hasPreview = !!preview && Array.isArray(preview.columns);
  const canPreview = !!file && !loading;
  const hasReview = !!reviewData && Array.isArray(reviewData.sampleRows);
  const canSubmit = !!file && hasPreview && hasReview && !loading;

  const fieldOptions = useMemo(() => {
    const base = [
      { value: 'ignore', label: 'Ignore' },
      { value: 'first_name', label: 'First Name' },
      { value: 'last_name', label: 'Last Name' },
      { value: 'full_name', label: 'Full name (split to first/last)' },
      { value: 'display_name', label: 'Display name' },
      { value: 'email', label: 'Email' },
      { value: 'primary_phone', label: 'Primary Phone' },
      { value: 'source', label: 'Lead Source' },
      { value: 'status', label: 'Lead Status' },
      { value: 'property', label: 'Property (saved as custom field)' },
      { value: 'budget', label: 'Budget (saved as custom field)' },
      { value: 'city', label: 'City (default contact field)' },
      { value: 'state', label: 'State (default contact field)' },
      { value: 'country', label: 'Country (default contact field)' },
      { value: 'address', label: 'Address / street (default contact field)' },
      { value: 'address_line_2', label: 'Address line 2 / landmark (default contact field)' },
      { value: 'pin_code', label: 'Pin code (default contact field)' },
      { value: 'company', label: 'Company / organization (default contact field)' },
      { value: 'job_title', label: 'Job title / designation (default contact field)' },
      { value: 'website', label: 'Website / LinkedIn (default contact field)' },
      { value: 'industry', label: 'Industry / sector (default contact field)' },
      { value: 'date_of_birth', label: 'Date of birth (default contact field)' },
      { value: 'tax_id', label: 'GST / PAN / Tax ID (default contact field)' },
      { value: 'services', label: 'Services (saved as custom field)' },
      { value: 'remark', label: 'Remark (saved as custom field)' },
      { value: 'remark_status', label: 'Remark Status (saved as custom field)' },
      { value: 'assign_date', label: 'Assign Date (saved as custom field)' },
      { value: 'lead_date', label: 'Lead Date (saved as custom field)' },
      { value: 'lead_timestamp', label: 'Time Stamp (saved as custom field)' },
      { value: 'assign_status', label: 'Assign / assignment (saved as custom field)' },
    ];

    const custom =
      preview?.customFields?.map((cf) => ({
        value: `custom:${cf.id}`,
        label: `Custom: ${cf.label || cf.name}`,
      })) || [];

    return [...base, ...custom];
  }, [preview]);

  const assertFileSize = () => {
    if (file && file.size > CSV_IMPORT_MAX_BYTES) {
      setError(`File is too large (max ${CSV_IMPORT_MAX_MB} MB). Split the file or ask your admin to raise the limit.`);
      return false;
    }
    return true;
  };

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

      const initial = {};
      (data.columns || []).forEach((col) => {
        const suggested = col.suggested || 'ignore';
        if (suggested && suggested !== 'ignore') {
          if (suggested.startsWith('custom:')) {
            initial[col.normalized] = {
              target: 'custom',
              customFieldId: Number(suggested.split(':')[1]),
            };
          } else {
            initial[col.normalized] = { target: suggested };
          }
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

  const handleLoadReview = async () => {
    if (!file || !hasPreview || loading) return;
    if (!assertFileSize()) return;
    setLoading(true);
    setError('');
    try {
      const res = await contactsAPI.resolveImportPreview({
        file,
        mode,
        default_country_code: defaultCountryCode || '+91',
        mapping,
        limit: 12,
      });
      setReviewData(res?.data || null);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to build review';
      setError(String(msg));
      setReviewData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !hasPreview || !hasReview || loading) return;
    if (!assertFileSize()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await contactsAPI.importCsv({
        file,
        type,
        mode,
        default_country_code: defaultCountryCode || '+91',
        mapping,
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
        description="Upload CSV or Excel (.xlsx) exports from Meta, Google, IndiaMART, JustDial, 99acres, MagicBricks, NoBroker, etc. Column names are auto-mapped; adjust in Step 3 if needed. Duplicates match on primary phone. You can upload a real .xlsx file — renaming .xlsx to .csv is not needed."
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

      <div className={listStyles.tableCard}>
        <div className={styles.cardBody}>
          <div className={styles.wrap}>
            <div className={styles.stepCard}>
              <div className={styles.stepTitle}>
                <div className={styles.stepTitleText}>Step 1 — Upload file</div>
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
                  <b>Max file size:</b> {CSV_IMPORT_MAX_MB} MB · <b>Max rows per run:</b> 2000 (split larger files).
                </div>
              </div>
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepTitle}>
                <div className={styles.stepTitleText}>Step 2 — Import settings</div>
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
                <Input
                  label="Default country code"
                  value={defaultCountryCode}
                  onChange={(e) => {
                    setDefaultCountryCode(e.target.value);
                    setReviewData(null);
                  }}
                  placeholder="+91"
                />
              </div>

              {!hasPreview && (
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button onClick={handlePreview} disabled={!canPreview} loading={loading}>
                    Next: Preview &amp; map columns
                  </Button>
                </div>
              )}
            </div>

            {hasPreview && (
              <div className={styles.stepCard}>
                <div className={styles.stepTitle}>
                  <div className={styles.stepTitleText}>Step 3 — Column mapping</div>
                  <div className={styles.stepHint}>Auto-selected based on column names. Change if needed.</div>
                </div>
                <div className={styles.footerNote} style={{ marginBottom: 10 }}>
                  We auto-selected fields based on column names. Adjust any mapping before review.
                </div>
                <div className={styles.mappingBox}>
                  <div className={styles.mappingScroll}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Column</th>
                          <th>Sample values</th>
                          <th style={{ width: 260 }}>Map to</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.columns.map((col) => {
                          const key = col.normalized;
                          const current = mapping[key];
                          let currentValue = 'ignore';
                          if (current?.target === 'custom' && current.customFieldId) {
                            currentValue = `custom:${current.customFieldId}`;
                          } else if (current?.target) {
                            currentValue = current.target;
                          } else if (col.suggested) {
                            currentValue = col.suggested;
                          }

                          const samplesText =
                            col.samples && col.samples.length > 0 ? col.samples.slice(0, 3).join(', ') : '—';

                          return (
                            <tr key={col.header}>
                              <td>{col.header}</td>
                              <td className={styles.samples}>{samplesText}</td>
                              <td>
                                <select
                                  value={currentValue}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setReviewData(null);
                                    setMapping((prev) => {
                                      const next = { ...prev };
                                      if (value === 'ignore') {
                                        delete next[key];
                                        return next;
                                      }
                                      if (value.startsWith('custom:')) {
                                        next[key] = {
                                          target: 'custom',
                                          customFieldId: Number(value.split(':')[1]),
                                        };
                                      } else {
                                        next[key] = { target: value };
                                      }
                                      return next;
                                    });
                                  }}
                                  className={styles.selectCompact}
                                >
                                  {fieldOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPreview(null);
                      setMapping({});
                      setReviewData(null);
                    }}
                    disabled={loading}
                  >
                    Reset upload
                  </Button>
                  <Button onClick={handleLoadReview} disabled={!canPreview || loading} loading={loading}>
                    Next: Review import ({preview.totalRows ?? 0} rows)
                  </Button>
                </div>
              </div>
            )}

            {hasReview && (
              <div className={styles.stepCard}>
                <div className={styles.stepTitle}>
                  <div className={styles.stepTitleText}>Step 4 — Review (before import)</div>
                  <div className={styles.stepHint}>First {reviewData.sampleRows?.length ?? 0} rows as the system will save them</div>
                </div>
                <div className={styles.footerNote} style={{ marginBottom: 10 }}>
                  Total rows in file: <b>{reviewData.totalRows}</b>. Mode: <b>{reviewData.mode}</b>.{' '}
                  <b>New</b> = new contact; <b>Skip dup</b> / <b>Update dup</b> = existing primary phone found.
                </div>
                <div className={styles.reviewScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Outcome</th>
                        <th>Display name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Source</th>
                        <th>Status</th>
                        <th>Custom fields</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewData.sampleRows.map((row) => (
                        <tr key={row.row}>
                          <td>{row.row}</td>
                          <td>
                            {row.error ? (
                              <span style={{ color: 'var(--color-danger)' }}>{row.error}</span>
                            ) : (
                              <>
                                {duplicateBadge(row.duplicate_action)}
                              </>
                            )}
                          </td>
                          <td>{row.display_name ?? '—'}</td>
                          <td>{row.primary_phone ?? '—'}</td>
                          <td>{row.email ?? '—'}</td>
                          <td>{row.source ?? '—'}</td>
                          <td>{row.status ?? '—'}</td>
                          <td className={styles.samples}>
                            {row.custom_fields_preview?.length
                              ? row.custom_fields_preview.map((c) => `${c.label}: ${c.value}`).join('; ')
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="secondary" onClick={() => setReviewData(null)} disabled={loading}>
                    Back to mapping
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
                  <b>Auto-detected synonyms</b>: name / customer_name / lead_name → full name; mobile / phone /
                  contact_number / whatsapp → primary phone; lead_source / utm_source / campaign → source; lead_status /
                  stage → status; property_type / bhk / configuration → property; budget / price_range → budget; city /
                  locality → city; state / region → state.
                </div>
                <div style={{ marginTop: 6 }}>
                  <b>Also supported</b>: first_name, last_name, email, campaign_id, manager_id, assigned_user_id,
                  status_id
                </div>
                <div style={{ marginTop: 6 }}>
                  <b>Multiple phones</b>: phone:mobile, phone:work (or phone_mobile / phone_work), plus extra columns
                  like phone_2 / landline
                </div>
                <div style={{ marginTop: 6 }}>
                  <b>Custom fields</b>: cf:&lt;field_name&gt; headers, or map to your custom fields in Step 3.
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
