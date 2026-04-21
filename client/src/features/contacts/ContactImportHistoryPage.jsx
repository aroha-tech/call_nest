import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { Pagination } from '../../components/ui/Pagination';
import { contactsAPI } from '../../services/contactsAPI';
import listStyles from '../../components/admin/adminDataList.module.scss';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import styles from './ContactImportPage.module.scss';

function formatErrorsJson(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function ContactImportHistoryPage({ type }) {
  const { formatDateTime } = useDateTimeDisplay();
  const navigate = useNavigate();
  const title = type === 'lead' ? 'Lead import history' : 'Contact import history';
  const importPath = type === 'lead' ? '/leads/import' : '/contacts/import';

  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await contactsAPI.listImportHistory({ page, limit, type });
      setPayload(res?.data || null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load history');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [page, limit, type]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = payload?.data || [];
  const total = payload?.total ?? 0;
  const totalPages = payload?.totalPages ?? 1;

  return (
    <div className={listStyles.page}>
      <PageHeader
        title={title}
        description="One row per import run: file, counts, and sample errors if any."
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => navigate(importPath)}>
              Back to import
            </Button>
            <Button variant="secondary" onClick={() => navigate(type === 'lead' ? '/leads' : '/contacts')}>
              {type === 'lead' ? 'Leads' : 'Contacts'}
            </Button>
          </div>
        }
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={styles.cardBody}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Spinner size="sm" /> Loading…
            </div>
          )}

          {!loading && rows.length === 0 && (
            <div className={styles.footerNote}>No imports recorded yet. Run an import from the import page.</div>
          )}

          {!loading && rows.length > 0 && (
            <>
              <div className={styles.mappingScroll} style={{ maxHeight: 'none' }}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>File</th>
                      <th>Mode</th>
                      <th>Rows</th>
                      <th>Created</th>
                      <th>Updated</th>
                      <th>Skipped</th>
                      <th>Failed</th>
                      <th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const errs = formatErrorsJson(r.error_sample_json);
                      return (
                        <tr key={r.id}>
                          <td>{r.created_at ? formatDateTime(r.created_at) : '—'}</td>
                          <td>{r.original_filename || '—'}</td>
                          <td>{r.mode}</td>
                          <td>{r.row_count}</td>
                          <td>{r.created_count}</td>
                          <td>{r.updated_count}</td>
                          <td>{r.skipped_count}</td>
                          <td>
                            {r.failed_count}
                            {errs && errs.length > 0 ? (
                              <div className={styles.errorHint} title={errs.map((e) => `Row ${e.row}: ${e.error}`).join('\n')}>
                                ({errs.length} err sample)
                              </div>
                            ) : null}
                          </td>
                          <td>{r.created_by_name || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16 }}>
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  limit={limit}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
