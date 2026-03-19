import React, { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Spinner } from '../../components/ui/Spinner';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination, PaginationPageSize } from '../../components/ui/Pagination';
import { whatsappLogsAPI, whatsappAccountsAPI, whatsappSettingsAPI } from '../../services/whatsappAPI';
import { useAsyncData } from '../../hooks/useAsyncData';
import styles from '../../features/disposition/components/MasterCRUDPage.module.scss';
import listStyles from '../../components/admin/adminDataList.module.scss';
import { useTableLoadingState } from '../../hooks/useTableLoadingState';
import { TableDataRegion } from '../../components/admin/TableDataRegion';

const LOGS_PAGE_SIZE = 20;

export function WhatsAppLogsPage() {
  const [moduleEnabled, setModuleEnabled] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    whatsappSettingsAPI
      .getSettings()
      .then((res) => {
        if (!cancelled) {
          const enabled = res?.data?.data?.automationEnabled !== undefined ? !!res.data.data.automationEnabled : true;
          setModuleEnabled(enabled);
        }
      })
      .catch(() => {
        if (!cancelled) setModuleEnabled(true);
      })
      .finally(() => {
        if (!cancelled) setSettingsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(LOGS_PAGE_SIZE);
  const fetchLogs = useCallback(
    () =>
      !settingsLoaded || !moduleEnabled
        ? Promise.resolve({ data: { data: [], total: 0 } })
        : whatsappLogsAPI.getAll({
            search: searchQuery || undefined,
            limit,
            offset: (page - 1) * limit,
          }),
    [searchQuery, page, limit, moduleEnabled, settingsLoaded]
  );
  const { data: logsResponse, loading, error, refetch } = useAsyncData(
    fetchLogs,
    [searchQuery, page, limit, moduleEnabled, settingsLoaded],
    { transform: (res) => res?.data ?? { data: [], total: 0 } }
  );
  const logs = logsResponse?.data ?? [];
  const total = logsResponse?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const { hasCompletedInitialFetch } = useTableLoadingState(loading);
  const handleSearch = (value) => {
    setSearchQuery(value || '');
    setPage(1);
  };

  const [selectedLog, setSelectedLog] = useState(null);

  if (!settingsLoaded) {
    return (
      <div className={styles.page}>
        <PageHeader title="WhatsApp API Logs" />
        <div className={styles.loading}><Spinner size="lg" /></div>
      </div>
    );
  }

  if (!moduleEnabled) {
    return (
      <div className={styles.page}>
        <PageHeader
          title="WhatsApp API Logs"
          description="Request and response logs for WhatsApp Business API calls"
        />
        <EmptyState
          icon="🔒"
          title="API logs not available"
          description="You are not able to view API logs. The WhatsApp module is not enabled for your account. Please contact your administrator to enable the WhatsApp automation module."
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="WhatsApp API Logs"
        description="Request and response logs for WhatsApp Business API calls"
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardToolbarTop}>
          <PaginationPageSize limit={limit} onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }} />
          <SearchInput
            value={searchQuery}
            onSearch={handleSearch}
            placeholder="Search endpoint, error, request/response (press Enter)"
            className={listStyles.searchInToolbar}
          />
        </div>
        <TableDataRegion loading={loading} hasCompletedInitialFetch={hasCompletedInitialFetch}>
          {!logs?.length ? (
            <div className={listStyles.tableCardEmpty}>
              <EmptyState
                icon="📋"
                title="No API logs"
                description="Logs appear here when you send messages or sync templates."
              />
            </div>
          ) : (
            <div className={listStyles.tableCardBody}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Time</TableHeaderCell>
                  <TableHeaderCell>Direction</TableHeaderCell>
                  <TableHeaderCell>Method</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Account</TableHeaderCell>
                  <TableHeaderCell width="80px" align="center">View</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {logs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</TableCell>
                    <TableCell>{row.direction || 'outbound'}</TableCell>
                    <TableCell>{row.method || '—'}</TableCell>
                    <TableCell>
                      {row.response_status != null ? (
                        <Badge variant={row.response_status >= 400 ? 'danger' : 'success'}>
                          {row.response_status}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>{row.account_phone || '—'}</TableCell>
                    <TableCell align="center">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedLog(row)}>Details</Button>
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
            page={page}
            totalPages={Math.max(1, totalPages)}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(newLimit) => { setLimit(newLimit); setPage(1); }}
            hidePageSize
          />
        </div>
      </div>

      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="API log details"
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setSelectedLog(null)}>Close</Button>
          </ModalFooter>
        }
      >
        {selectedLog && (
          <div className={styles.form} style={{ gap: 12 }}>
            <div>
              <strong>Endpoint:</strong> {selectedLog.method} {selectedLog.endpoint}
            </div>
            <div>
              <strong>Response status:</strong> {selectedLog.response_status ?? '—'}
            </div>
            {selectedLog.error_message && (
              <div>
                <strong>Error:</strong> <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{selectedLog.error_message}</pre>
              </div>
            )}
            {selectedLog.request_body && (
              <div>
                <strong>Request body:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', margin: '4px 0 0', padding: 8, background: 'var(--color-bg-subtle)', borderRadius: 4 }}>
                  {JSON.stringify(selectedLog.request_body, null, 2)}
                </pre>
              </div>
            )}
            {selectedLog.response_body && (
              <div>
                <strong>Response body:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto', margin: '4px 0 0', padding: 8, background: 'var(--color-bg-subtle)', borderRadius: 4 }}>
                  {JSON.stringify(selectedLog.response_body, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
