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

export function ContactImportPage({ type }) {
  const navigate = useNavigate();
  const title = useMemo(() => (type === 'lead' ? 'Import Leads' : 'Import Contacts'), [type]);

  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('skip'); // skip | update
  const [defaultCountryCode, setDefaultCountryCode] = useState('+91');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});

  const hasPreview = !!preview && Array.isArray(preview.columns);
  const canPreview = !!file && !loading;
  const canSubmit = !!file && hasPreview && !loading;

  const fieldOptions = useMemo(() => {
    const base = [
      { value: 'ignore', label: 'Ignore' },
      { value: 'first_name', label: 'First Name' },
      { value: 'last_name', label: 'Last Name' },
      { value: 'email', label: 'Email' },
      { value: 'primary_phone', label: 'Primary Phone' },
      { value: 'source', label: 'Lead Source' },
      { value: 'status', label: 'Lead Status' },
    ];

    const custom =
      preview?.customFields?.map((cf) => ({
        value: `custom:${cf.id}`,
        label: `Custom: ${cf.label || cf.name}`,
      })) || [];

    return [...base, ...custom];
  }, [preview]);

  const handlePreview = async () => {
    if (!file || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
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

  const handleImport = async () => {
    if (!file || !hasPreview || loading) return;
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
        description="Upload a CSV file, map columns (optional), then import. Duplicates are detected by primary phone."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => navigate(type === 'lead' ? '/leads' : '/contacts')}>
              Back
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        {/* Don't use admin table fixed-height body here (it clamps height). */}
        <div className={styles.cardBody}>
          <div className={styles.wrap}>
            <div className={styles.stepCard}>
              <div className={styles.stepTitle}>
                <div className={styles.stepTitleText}>Step 1 — Upload CSV</div>
                {file ? <div className={styles.stepHint}>{file.name}</div> : null}
              </div>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setPreview(null);
                  setMapping({});
                  setResult(null);
                  setError('');
                }}
                className={styles.fileInput}
              />
              <div className={styles.footerNote} style={{ marginTop: 8 }}>
                Required rules: <b>display_name</b> (or first_name/last_name/email), and <b>first_name or email</b>.
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
                  onChange={(e) => setMode(e.target.value)}
                  options={[
                    { value: 'skip', label: 'Skip duplicates (by primary phone)' },
                    { value: 'update', label: 'Update duplicates (by primary phone)' },
                  ]}
                  placeholder="Select mode..."
                />
                <Input
                  label="Default country code"
                  value={defaultCountryCode}
                  onChange={(e) => setDefaultCountryCode(e.target.value)}
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
                  We auto-selected fields based on column names. Adjust any mapping before running the import.
                </div>
                <div className={styles.mappingBox}>
                  <div className={styles.mappingScroll}>
                    <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>CSV column</th>
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
              </div>
            )}

            <div className={styles.stepCard}>
              <div className={styles.stepTitle}>
                <div className={styles.stepTitleText}>Help</div>
                <div className={styles.stepHint}>What columns can the import understand?</div>
              </div>
              <div className={styles.footerNote}>
                <div>
                  <b>Base</b>: display_name, first_name, last_name, email, phone (or primary_phone), source (or lead
                  source), lead status / status_id, campaign_id, manager_id, assigned_user_id
                </div>
                <div style={{ marginTop: 6 }}>
                  <b>Multiple phones</b>: phone:mobile, phone:work, phone:home (or phone_mobile / phone_work)
                </div>
                <div style={{ marginTop: 6 }}>
                  <b>Custom fields</b>: use cf:&lt;field_name&gt; (example: cf:property_type) or map manually in Step 3.
                </div>

              {hasPreview && (
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  {result ? (
                    <Button
                      variant="secondary"
                      onClick={() => navigate(type === 'lead' ? '/leads' : '/contacts')}
                      disabled={loading}
                    >
                      Back to {type === 'lead' ? 'Leads' : 'Contacts'}
                    </Button>
                  ) : (
                    <Button onClick={handleImport} disabled={!canSubmit} loading={loading}>
                      Start import
                    </Button>
                  )}
                </div>
              )}
              </div>
            </div>

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Spinner size="sm" /> Import running…
              </div>
            )}

            {result && (
              <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Result</div>
                <div>
                  Created: <b>{result.created ?? 0}</b> | Updated: <b>{result.updated ?? 0}</b> | Skipped:{' '}
                  <b>{result.skipped ?? 0}</b> | Failed: <b>{result.failed ?? 0}</b>
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

