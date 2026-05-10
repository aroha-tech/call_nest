import React, { useState, useCallback, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
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
import { SearchInput } from '../components/ui/SearchInput';
import { StatusBadge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/IconButton';
import { EditIcon } from '../components/ui/ActionIcons';
import { Pagination, PaginationPageSize } from '../components/ui/Pagination';
import { Alert } from '../components/ui/Alert';
import { EmptyState } from '../components/ui/EmptyState';
import listStyles from '../components/admin/adminDataList.module.scss';
import { FilterBar } from '../components/admin/FilterBar';
import { tenantsAPI } from '../services/adminAPI';
import { industriesAPI } from '../services/dispositionAPI';
import { useDateTimeDisplay } from '../hooks/useDateTimeDisplay';
import { useTableLoadingState } from '../hooks/useTableLoadingState';
import { TableDataRegion } from '../components/admin/TableDataRegion';
import { TenantWorkspaceUrlCopy } from '../components/admin/TenantWorkspaceUrlCopy';
import styles from './TenantsPage.module.scss';
import { isNoListFilter } from '../utils/listFilterNarrowing';

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
  const navigate = useNavigate();
  const { formatDateTime } = useDateTimeDisplay();
  const [searchParams] = useSearchParams();
  const qParam = searchParams.get('q') ?? '';
  const [tenants, setTenants] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState(() => qParam.trim());
  const [showDisabled, setShowDisabled] = useState(false);
  const [draftIndustryFilter, setDraftIndustryFilter] = useState('');
  const [appliedIndustryFilter, setAppliedIndustryFilter] = useState('');
  const [draftMinUsers, setDraftMinUsers] = useState('');
  const [draftMaxUsers, setDraftMaxUsers] = useState('');
  const [appliedMinUsers, setAppliedMinUsers] = useState('');
  const [appliedMaxUsers, setAppliedMaxUsers] = useState('');
  const [filterError, setFilterError] = useState(null);
  const [industryOptions, setIndustryOptions] = useState([]);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await tenantsAPI.getAll({
        search,
        includeDisabled: showDisabled,
        page: pagination.page,
        limit: pagination.limit,
        industryId: !isNoListFilter(appliedIndustryFilter) ? appliedIndustryFilter : undefined,
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

  useEffect(() => {
    const next = qParam.trim();
    setSearch(next);
    setPagination((p) => ({ ...p, page: 1 }));
  }, [qParam]);

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

  const industryFilterSelectOptions = [
    { value: '__none__', label: 'Without an industry' },
    ...industryOptions,
  ];

  const activeUserSizePresetId = getActiveUserSizePreset(draftMinUsers, draftMaxUsers);

  const hasActiveTenantFilters =
    !isNoListFilter(appliedIndustryFilter) ||
    String(appliedMinUsers || '').trim() !== '' ||
    String(appliedMaxUsers || '').trim() !== '';

  const openCreate = () => navigate('/admin/tenants/new');
  const openEdit = (row) => navigate(`/admin/tenants/${row.id}/edit`);

  return (
    <div className={styles.wrapper}>
      <div className={listStyles.page}>
        <PageHeader
          title="Tenants"
          titleIcon="apartment"
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
          fluid
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
            setDraftIndustryFilter('');
            setAppliedIndustryFilter('');
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
                allowEmpty
                aria-labelledby="tenants-filter-industry-label"
                value={draftIndustryFilter || ''}
                onChange={(e) => setDraftIndustryFilter(e.target.value)}
                options={industryFilterSelectOptions}
                className={styles.filterSelectWide}
                placeholder="All industries"
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
                label="Show inactive"
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
          <TableDataRegion
            loading={loading}
            hasCompletedInitialFetch={hasCompletedInitialFetch}
            skeletonColumns={10}
          >
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
                          <span className={styles.createdCell}>{formatDateTime(t.created_at)}</span>
                        </TableCell>
                        <TableCell>
                          <TenantWorkspaceUrlCopy tenantId={t.id} slug={t.slug} />
                        </TableCell>
                        <TableCell>
                          {industryOptions.find((o) => o.value === t.industry_id)?.label || '—'}
                        </TableCell>
                        <TableCell>
                          <Link to={`/admin/users?tenantId=${t.id}`} className={styles.userCountLink}>
                            {t.user_count ?? 0}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <StatusBadge isActive={!!t.is_enabled} />
                        </TableCell>
                        <TableCell>
                          <span
                            className={t.whatsapp_module_enabled ? styles.moduleOn : styles.moduleOff}
                          >
                            {t.whatsapp_module_enabled ? 'On' : 'Off'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={t.email_module_enabled ? styles.moduleOn : styles.moduleOff}
                          >
                            {t.email_module_enabled ? 'On' : 'Off'}
                          </span>
                        </TableCell>
                        <TableCell align="right">
                          {t.id !== 1 && (
                            <IconButton title="Edit" onClick={() => openEdit(t)} size="sm">
                              <EditIcon />
                            </IconButton>
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
    </div>
  );
}
