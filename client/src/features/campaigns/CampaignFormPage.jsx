import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../../app/hooks';
import { selectUser } from '../../features/auth/authSelectors';
import { useAnyPermission } from '../../hooks/usePermission';
import { useMutation } from '../../hooks/useAsyncData';
import { campaignsAPI } from '../../services/campaignsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { contactStatusesAPI, campaignTypesAPI, campaignStatusesAPI, callScriptsAPI } from '../../services/dispositionAPI';
import { contactTagsAPI } from '../../services/contactTagsAPI';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Alert } from '../../components/ui/Alert';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableHeaderCell,
} from '../../components/ui/Table';
import { TableDataRegion } from '../../components/admin/TableDataRegion';
import { SearchInput } from '../../components/ui/SearchInput';
import { Pagination } from '../../components/ui/Pagination';
import { CampaignFormWizard, STEPS } from './CampaignFormWizard';
import { WizardPaperPlaneIcon, WizardRocketMini } from './campaignWizardVisuals';
import {
  buildEmptyCampaignForm,
  buildSettingsPayload,
  parseSettingsFromCampaign,
  rulesFromCampaign,
  sanitizeRuleForApi,
} from './campaignFormHelpers';
import { defaultRule, validateRulesForSave } from './campaignFilterConfig';
import listStyles from '../../components/admin/adminDataList.module.scss';
import pageStyles from './CampaignsPage.module.scss';
import { dealsAPI } from '../../services/dealsAPI';
import { COMMON_TIMEZONE_OPTIONS } from '../../utils/dateTimeDisplay';

function getDefaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function CampaignFormPage() {
  const navigate = useNavigate();
  const { id: editId } = useParams();
  const isNew = !editId;
  const { formatDateTime, formatDate } = useDateTimeDisplay();
  const user = useAppSelector(selectUser);
  const role = user?.role ?? 'agent';
  const isAdmin = role === 'admin';

  const canCreate = useAnyPermission(['contacts.create', 'leads.create']);
  const canUpdate = useAnyPermission(['contacts.update', 'leads.update']);

  const [form, setForm] = useState(() => buildEmptyCampaignForm());
  const [formError, setFormError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadingCampaign, setLoadingCampaign] = useState(!isNew);
  const [wizardStep, setWizardStep] = useState(0);
  const [managerMap, setManagerMap] = useState({});
  const [tenantUsers, setTenantUsers] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [tagList, setTagList] = useState([]);
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [campaignTypeRows, setCampaignTypeRows] = useState([]);
  const [campaignStatusRows, setCampaignStatusRows] = useState([]);
  const [pipelineOptions, setPipelineOptions] = useState([]);
  const [scriptSelectOptions, setScriptSelectOptions] = useState([]);
  const [audienceEstimateLoading, setAudienceEstimateLoading] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewLimit] = useState(10);
  const [previewRows, setPreviewRows] = useState([]);
  const [previewPagination, setPreviewPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  const createMut = useMutation((body) => campaignsAPI.create(body));
  const updateMut = useMutation((id, body) => campaignsAPI.update(id, body));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const needsUserDirectory = role !== 'agent';
        const [uRes, stRes, tagRes, cRes, ctRes, csRes] = await Promise.all([
          needsUserDirectory
            ? tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false })
            : Promise.resolve({ data: { data: [] } }),
          contactStatusesAPI.getOptions().catch(() => ({ data: { data: [] } })),
          contactTagsAPI.list().catch(() => ({ data: { data: [] } })),
          campaignsAPI.list({ page: 1, limit: 500, show_paused: true }).catch(() => ({ data: { data: [] } })),
          campaignTypesAPI.getOptions().catch(() => ({ data: { data: [] } })),
          campaignStatusesAPI.getOptions().catch(() => ({ data: { data: [] } })),
        ]);
        if (cancelled) return;
        const rows = uRes.data?.data ?? [];
        setTenantUsers(rows);
        const map = {};
        for (const u of rows) {
          if (u.role === 'manager') map[u.id] = u.name || u.email;
        }
        setManagerMap(map);
        setStatusOptions((stRes.data?.data ?? []).map((s) => ({ value: String(s.id), label: s.name || s.code || '—' })));
        setTagList(tagRes.data?.data ?? []);
        setAllCampaigns(cRes.data?.data ?? []);
        setCampaignTypeRows(ctRes.data?.data ?? []);
        setCampaignStatusRows(csRes.data?.data ?? []);
      } catch {
        if (!cancelled) {
          setTenantUsers([]);
          setManagerMap({});
          setStatusOptions([]);
          setTagList([]);
          setAllCampaigns([]);
          setCampaignTypeRows([]);
          setCampaignStatusRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await dealsAPI.list({ include_inactive: false });
        const rows = res.data?.data ?? [];
        if (!cancelled) setPipelineOptions(rows.map((p) => ({ value: String(p.id), label: p.name || '—' })));
      } catch {
        if (!cancelled) setPipelineOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await callScriptsAPI.getAll({ page: 1, limit: 200, includeInactive: false });
        const rows = res.data?.data ?? [];
        if (!cancelled)
          setScriptSelectOptions(
            rows.map((s) => ({
              value: String(s.id),
              label: (s.script_name || s.name || '').trim() || '—',
            }))
          );
      } catch {
        if (!cancelled) setScriptSelectOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isNew) {
      setForm({
        ...buildEmptyCampaignForm(),
        filterRules: [defaultRule()],
        audienceTab: 'filter',
        type: 'filter',
        timezone: getDefaultTimezone(),
      });
      setLoadingCampaign(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCampaign(true);
      setLoadError('');
      try {
        const res = await campaignsAPI.getById(editId);
        const row = res.data?.data;
        if (cancelled) return;
        if (!row) {
          setLoadError('Campaign not found');
          setLoadingCampaign(false);
          return;
        }
        const settings = parseSettingsFromCampaign(row);
        setForm({
          name: row.name || '',
          description: row.description || '',
          campaign_type_master_id: row.campaign_type_master_id != null ? String(row.campaign_type_master_id) : '',
          campaign_status_master_id: row.campaign_status_master_id != null ? String(row.campaign_status_master_id) : '',
          type: row.type || 'static',
          manager_id: row.manager_id != null ? String(row.manager_id) : '',
          status: row.status || 'active',
          filterRules: row.type === 'filter' ? rulesFromCampaign(row) : [defaultRule()],
          ...settings,
          audienceTab: row.type === 'static' ? 'static' : 'filter',
        });
      } catch (e) {
        if (!cancelled) setLoadError(e?.response?.data?.error || e?.message || 'Failed to load campaign');
      } finally {
        if (!cancelled) setLoadingCampaign(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, editId]);

  const managerOptions = useMemo(() => {
    return Object.entries(managerMap)
      .map(([id, name]) => {
        const n = String(name || '').trim();
        const parts = n.split(/\s+/).filter(Boolean);
        const initials =
          parts.length >= 2
            ? `${(parts[0][0] || '').toUpperCase()}${(parts[1][0] || '').toUpperCase()}`
            : (parts[0] || '?').slice(0, 2).toUpperCase();
        return { value: id, label: n, ownerInitials: initials };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [managerMap]);

  const agentOptions = useMemo(() => {
    return tenantUsers
      .filter((u) => u.role === 'agent')
      .map((u) => ({ value: String(u.id), label: u.name || u.email || '—' }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tenantUsers]);

  const staticCampaignOptions = useMemo(() => {
    return (allCampaigns || [])
      .filter((c) => c.type === 'static')
      .map((c) => ({ value: String(c.id), label: c.name || '—' }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allCampaigns]);

  const tagOptions = useMemo(() => {
    return (tagList || []).map((t) => ({ value: String(t.id), label: t.name || '—' }));
  }, [tagList]);

  const campaignTypeSelectOptions = useMemo(
    () => [
      { value: '', label: '— None —' },
      ...campaignTypeRows.map((r) => ({ value: String(r.id), label: r.name || r.code || '—' })),
    ],
    [campaignTypeRows]
  );

  const campaignStatusSelectOptions = useMemo(
    () => [
      { value: '', label: '— None —' },
      ...campaignStatusRows.map((r) => ({ value: String(r.id), label: r.name || r.code || '—' })),
    ],
    [campaignStatusRows]
  );

  const timezoneOptions = useMemo(() => {
    const tz = getDefaultTimezone();
    if (COMMON_TIMEZONE_OPTIONS.some((o) => o.value === tz)) {
      return COMMON_TIMEZONE_OPTIONS;
    }
    return [{ value: tz, label: tz }, ...COMMON_TIMEZONE_OPTIONS];
  }, []);

  const buildFiltersPayload = () => {
    const rules = (form.filterRules || []).map(sanitizeRuleForApi);
    return { version: 2, rules };
  };

  function validateWizardStep(stepIndex) {
    if (stepIndex === 0) {
      if (!form.name?.trim()) return 'Campaign name is required';
      if (!form.campaign_type_master_id) return 'Campaign type is required';
      if (!form.campaign_status_master_id) return 'Campaign status is required';
      if (form.schedule_mode === 'scheduled' && !String(form.start_date || '').trim()) {
        return 'Start date is required when using a scheduled start';
      }
    }
    if (stepIndex === 1 && form.type === 'filter') {
      return validateRulesForSave(form.filterRules || []);
    }
    return '';
  }

  const goWizardBack = () => {
    setFormError('');
    setWizardStep((s) => Math.max(0, s - 1));
  };

  const goWizardNext = () => {
    const err = validateWizardStep(wizardStep);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError('');
    setWizardStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const recalculateAudience = async () => {
    setFormError('');
    setAudienceEstimateLoading(true);
    try {
      const rules = (form.filterRules || []).map(sanitizeRuleForApi);
      const res = await campaignsAPI.preview({
        filters_json: { version: 2, rules },
        page: 1,
        limit: 1,
      });
      const total = res.data?.pagination?.total ?? 0;
      const at = new Date().toISOString();
      setForm((s) => ({ ...s, audience_estimate_total: total, audience_estimate_at: at }));
    } catch (e) {
      setFormError(e?.response?.data?.error || e?.message || 'Could not estimate audience');
    } finally {
      setAudienceEstimateLoading(false);
    }
  };

  const runPreview = () => {
    setFormError('');
    setPreviewError('');
    setPreviewPage(1);
    setPreviewSearch('');
    setPreviewOpen(true);
  };

  useEffect(() => {
    if (!previewOpen) return;
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const rules = (form.filterRules || []).map(sanitizeRuleForApi);
        const res = await campaignsAPI.preview({
          filters_json: { version: 2, rules },
          page: previewPage,
          limit: previewLimit,
          search: previewSearch || undefined,
        });
        if (cancelled) return;
        setPreviewRows(res.data?.data ?? []);
        setPreviewPagination(
          res.data?.pagination ?? { page: 1, limit: previewLimit, total: 0, totalPages: 1 }
        );
      } catch (e) {
        if (!cancelled) setPreviewError(e?.response?.data?.error || e?.message || 'Preview failed');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewOpen, previewPage, previewSearch, previewLimit, form.filterRules]);

  const persistCampaign = async ({ asDraft }) => {
    setFormError('');
    if (asDraft) {
      if (!form.name?.trim()) {
        setFormError('Name is required to save a draft');
        return;
      }
    } else {
      const err =
        validateWizardStep(0) || (form.type === 'filter' ? validateWizardStep(1) : '');
      if (err) {
        setFormError(err);
        return;
      }
    }

    let filtersPayload;
    if (form.type !== 'filter') {
      filtersPayload = null;
    } else if (asDraft) {
      const err = validateRulesForSave(form.filterRules || []);
      filtersPayload = err ? { version: 2, rules: [] } : buildFiltersPayload();
    } else {
      filtersPayload = buildFiltersPayload();
    }

    const body = {
      name: form.name.trim(),
      description: form.description?.trim() ? form.description.trim() : null,
      campaign_type_master_id: form.campaign_type_master_id || null,
      campaign_status_master_id: form.campaign_status_master_id || null,
      manager_id: form.manager_id ? Number(form.manager_id) : null,
      status: asDraft ? 'paused' : form.status,
      filters_json: filtersPayload,
      settings_json: buildSettingsPayload(form),
      draft: asDraft,
    };
    if (isNew) {
      body.type = form.type;
    }

    let result;
    if (isNew) {
      result = await createMut.mutate(body);
    } else {
      result = await updateMut.mutate(editId, body);
    }
    if (result?.success) {
      navigate('/campaigns');
    } else {
      setFormError(result?.error || 'Save failed');
    }
  };

  const handleSaveDraft = () => persistCampaign({ asDraft: true });
  const handleLaunchOrSave = () => persistCampaign({ asDraft: false });

  const allowed = isNew ? isAdmin && canCreate : isAdmin && canUpdate;
  if (!allowed) {
    return (
      <div className={listStyles.page}>
        <PageHeader title="Campaigns" />
        <Alert variant="error" display="inline">
          You do not have permission to {isNew ? 'create' : 'edit'} campaigns.
        </Alert>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={listStyles.page}>
        <Alert variant="error">{loadError}</Alert>
        <Button style={{ marginTop: 12 }} onClick={() => navigate('/campaigns')}>
          Back to campaigns
        </Button>
      </div>
    );
  }

  return (
    <div className={`${listStyles.page} ${pageStyles.campaignFormPage}`.trim()}>
      <div className={`${pageStyles.campaignWizardLightRoot} ${pageStyles.campaignWizardPageShell}`.trim()}>
        <header className={pageStyles.campaignWizardPageHeader}>
          <div className={pageStyles.campaignWizardPageInner}>
            <div className={pageStyles.campaignWizardPageHeaderRow}>
              <div className={pageStyles.campaignWizardCardHeaderIcon}>
                <WizardPaperPlaneIcon />
              </div>
              <div className={pageStyles.campaignWizardCardHeaderText}>
                <h1 className={pageStyles.campaignWizardCardTitle}>
                  {isNew ? 'Create Campaign' : 'Edit Campaign'}
                </h1>
                <p className={pageStyles.campaignWizardCardSubtitle}>
                  Setup your campaign and start reaching your audience.
                </p>
              </div>
              <button
                type="button"
                className={pageStyles.campaignWizardClose}
                onClick={() => navigate('/campaigns')}
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </header>

        <div className={pageStyles.campaignWizardPageBody}>
          <div className={pageStyles.campaignWizardPageInner}>
            {loadingCampaign ? (
              <p className={pageStyles.wizardMuted}>Loading…</p>
            ) : (
              <>
                {formError ? (
                  <Alert variant="error" style={{ marginBottom: 12 }}>
                    {formError}
                  </Alert>
                ) : null}
                <CampaignFormWizard
                  step={wizardStep}
                  form={form}
                  setForm={setForm}
                  editing={isNew ? null : { id: editId }}
                  statusOptions={statusOptions}
                  tagOptions={tagOptions}
                  managerOptions={managerOptions}
                  agentOptions={agentOptions}
                  staticCampaignOptions={staticCampaignOptions}
                  campaignTypeSelectOptions={campaignTypeSelectOptions.filter((o) => o.value !== '')}
                  campaignStatusSelectOptions={campaignStatusSelectOptions.filter((o) => o.value !== '')}
                  pipelineOptions={pipelineOptions}
                  timezoneOptions={timezoneOptions}
                  scriptSelectOptions={scriptSelectOptions}
                  onRecalculateAudience={recalculateAudience}
                  audienceEstimateLoading={audienceEstimateLoading}
                  formatDateTime={formatDateTime}
                  formatDate={formatDate}
                  launchBusy={createMut.loading || updateMut.loading}
                  onReviewLaunch={handleLaunchOrSave}
                />
              </>
            )}
          </div>
        </div>

        {!loadingCampaign ? (
          <footer className={pageStyles.campaignFormFooter}>
            <div className={pageStyles.campaignWizardPageInner}>
              <div className={pageStyles.campaignFormFooterInner}>
                {wizardStep > 0 ? (
                  <div className={pageStyles.campaignFormFooterLeft}>
                    <Button type="button" variant="secondary" onClick={goWizardBack}>
                      Back
                    </Button>
                  </div>
                ) : (
                  <div className={pageStyles.campaignFormFooterLeft}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSaveDraft}
                      disabled={createMut.loading || updateMut.loading}
                    >
                      Save as draft
                    </Button>
                  </div>
                )}
                <div className={pageStyles.campaignFormFooterRight}>
                  {wizardStep > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleSaveDraft}
                      disabled={createMut.loading || updateMut.loading}
                    >
                      Save as draft
                    </Button>
                  ) : null}
                  {wizardStep === 0 ? (
                    <Button type="button" variant="secondary" onClick={() => navigate('/campaigns')}>
                      Cancel
                    </Button>
                  ) : null}
                  {wizardStep === 1 && form.type === 'filter' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={runPreview}
                      disabled={previewLoading || createMut.loading || updateMut.loading}
                    >
                      {previewLoading ? 'Preview…' : 'Preview leads'}
                    </Button>
                  ) : null}
                  {wizardStep < STEPS.length - 1 ? (
                    <Button type="button" onClick={goWizardNext}>
                      <span className={pageStyles.footerBtnArrow}>
                        Next: {STEPS[wizardStep + 1]?.label ?? 'Continue'}
                        <span className={pageStyles.footerBtnArrowIcon} aria-hidden>
                          →
                        </span>
                      </span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleLaunchOrSave}
                      disabled={createMut.loading || updateMut.loading}
                    >
                      <span className={pageStyles.footerLaunchRow}>
                        {createMut.loading || updateMut.loading ? (
                          'Saving…'
                        ) : (
                          <>
                            <WizardRocketMini className={pageStyles.footerLaunchRocket} aria-hidden />
                            Launch Campaign
                          </>
                        )}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </footer>
        ) : null}
      </div>

      <Modal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview matching leads"
        size="lg"
        footer={
          <ModalFooter>
            <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
          </ModalFooter>
        }
      >
        {previewError ? <Alert variant="error">{previewError}</Alert> : null}
        <div style={{ marginBottom: 12 }}>
          <SearchInput
            value={previewSearch}
            onSearch={(v) => {
              setPreviewSearch(v || '');
              setPreviewPage(1);
            }}
            placeholder="Search preview… (press Enter)"
          />
        </div>
        <TableDataRegion
          loading={previewLoading}
          hasCompletedInitialFetch={!previewLoading}
          skeletonColumns={5}
        >
          <Table variant="adminList">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Tag</TableHeaderCell>
                <TableHeaderCell>Phone</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!previewRows?.length ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    {previewLoading ? 'Loading…' : 'No matching leads for these rules.'}
                  </TableCell>
                </TableRow>
              ) : (
                previewRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.display_name || '—'}</TableCell>
                    <TableCell>{r.email || '—'}</TableCell>
                    <TableCell>{r.tag_names || '—'}</TableCell>
                    <TableCell>{r.primary_phone || '—'}</TableCell>
                    <TableCell>{r.status_name || r.status_id || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableDataRegion>
        <Pagination
          page={previewPagination.page || 1}
          totalPages={Math.max(1, previewPagination.totalPages || 1)}
          total={previewPagination.total ?? 0}
          limit={previewPagination.limit ?? previewLimit}
          onPageChange={(p) => setPreviewPage(p)}
          hidePageSize
        />
      </Modal>
    </div>
  );
}
