import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Alert } from '../components/ui/Alert';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { Tabs, TabList, Tab } from '../components/ui/Tabs';
import { SearchInput } from '../components/ui/SearchInput';
import { ConfirmModal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { telephonyBillingPlansAdminAPI } from '../services/tenantTelephonyAdminAPI';
import { EMPTY_PLANS } from '../constants/emptyCollections';
import { useTelephonyBillingPlansList } from '../hooks/useTelephonyBillingPlansList';
import { TelephonyPlanTenantPreview } from '../components/telephony/TelephonyPlanTenantPreview';
import { TelephonyPlansDraggableTable } from '../components/telephony/TelephonyPlansDraggableTable';
import { CATEGORY_TO_SEGMENT } from '../utils/telephonyPlanFormUtils';
import {
  PLAN_CATEGORY,
  PLAN_SECTION_HELP,
  PRODUCT_COPY,
  PLAN_PREVIEW_TAB_HELP,
  TENANT_CATALOG_PREVIEW_HELP,
} from '../constants/telephonyProductTypes';
import { InfoHelpIcon, infoHelpHeadingRowClassName } from '../components/ui/InfoHelpIcon';
import { SubscriptionCatalogSettingsCard } from '../components/telephony/SubscriptionCatalogSettingsCard';
import listStyles from '../components/admin/adminDataList.module.scss';
import styles from './PlatformTelephonyPlansPage.module.scss';

const LIST_LIMIT = 100;
const PREVIEW_CATALOG_LIMIT = 100;

function SectionTitleWithHelp({ title, helpMessage }) {
  return (
    <div className={`${infoHelpHeadingRowClassName} ${styles.sectionTitleRow}`.trim()}>
      <h3 className={styles.listTitle}>{title}</h3>
      <InfoHelpIcon title={`${title} info`} modalTitle={title} message={helpMessage} />
    </div>
  );
}

function PreviewToggle({ checked, onChange, disabled = false, label = 'Show tenant preview' }) {
  return (
    <label className={`${styles.previewToggle} ${disabled ? styles.previewToggleDisabled : ''}`}>
      <span className={styles.previewToggleLabel}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        aria-label={checked ? 'Hide tenant preview' : 'Show tenant preview'}
        className={`${styles.previewSwitch} ${checked ? styles.previewSwitchOn : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.previewSwitchThumb} />
      </button>
    </label>
  );
}

function TenantPreviewSection({
  showPreview,
  onShowPreviewChange,
  helpMessage,
  children,
  previewBusy = false,
}) {
  return (
    <section className={styles.previewSection} aria-label="Tenant admin preview">
      <header className={styles.previewSectionHead}>
        <MaterialSymbol name="preview" size="sm" className={styles.previewSectionIcon} />
        <div className={`${infoHelpHeadingRowClassName} ${styles.previewSectionTitleRow}`.trim()}>
          <h2 className={styles.previewSectionTitle}>Tenant admin preview</h2>
          <InfoHelpIcon
            title="Tenant admin preview info"
            modalTitle="Tenant admin preview"
            message={helpMessage}
          />
        </div>
        <PreviewToggle
          checked={showPreview}
          onChange={onShowPreviewChange}
          disabled={previewBusy && !showPreview}
        />
      </header>
      <div
        className={`${styles.previewPanel} ${showPreview ? styles.previewPanelOpen : styles.previewPanelClosed}`}
      >
        {showPreview ? (
          <div className={styles.previewBody}>{children}</div>
        ) : (
          <p className={styles.previewOffHint}>
            Turn on the preview toggle to see how tenants will view these plans on Plans &amp; billing.
          </p>
        )}
      </div>
    </section>
  );
}

function PlansTableSection({
  plans,
  category,
  selectedId,
  onSelect,
  onEdit,
  onToggle,
  onDelete,
  reorderEligible,
  reorderBusy,
  onReorder,
  loading,
  refreshing,
}) {
  if (loading && !plans.length) {
    return (
      <div className={styles.tableSkeleton} aria-busy="true" aria-label="Loading plans">
        <Skeleton height={28} />
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <div className={refreshing ? styles.tableContentDimmed : undefined}>
        <TelephonyPlansDraggableTable
          plans={plans}
          category={category}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onToggle={onToggle}
          onDelete={onDelete}
          canReorder={reorderEligible}
          reorderBusy={reorderBusy}
          onReorder={onReorder}
        />
      </div>
      {refreshing ? (
        <div className={styles.tableOverlay} aria-busy="true">
          <Spinner size="md" />
          <span>Updating plans…</span>
        </div>
      ) : null}
    </div>
  );
}

function PlansTab({ category }) {
  const navigate = useNavigate();
  const segment = CATEGORY_TO_SEGMENT[category];
  const title = PRODUCT_COPY[category].title;
  const sectionHelp = PLAN_SECTION_HELP[category];

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [planTypeFilter, setPlanTypeFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const { plans, total, loading, refreshing, error, setError, reload } = useTelephonyBillingPlansList({
    plan_category: category,
    plan_type:
      category === PLAN_CATEGORY.SUBSCRIPTION
        ? planTypeFilter || undefined
        : category === PLAN_CATEGORY.CREDIT_TOP_UP
          ? 'credit'
          : undefined,
    search,
    include_inactive: showInactive ? 'true' : 'false',
    page,
    limit: LIST_LIMIT,
  });

  const {
    plans: previewCatalogPlans,
    loading: previewLoading,
    refreshing: previewRefreshing,
  } = useTelephonyBillingPlansList(
    {
      plan_category: category,
      plan_type:
        category === PLAN_CATEGORY.SUBSCRIPTION
          ? undefined
          : category === PLAN_CATEGORY.CREDIT_TOP_UP
            ? 'credit'
            : undefined,
      include_inactive: 'false',
      page: 1,
      limit: PREVIEW_CATALOG_LIMIT,
    },
    { enabled: showPreview, keepStaleWhenDisabled: true }
  );

  const [selected, setSelected] = useState(null);
  const [toggleItem, setToggleItem] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [subscriptionCyclesVisible, setSubscriptionCyclesVisible] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / LIST_LIMIT));
  const listBusy = loading || refreshing;

  const reorderEligible = useMemo(() => {
    const totalCount = Number(total) || 0;
    if (!plans.length) return false;
    if (search.trim()) return false;
    if (totalCount > LIST_LIMIT) return false;
    if (page !== 1) return false;
    if (plans.length !== totalCount) return false;
    return true;
  }, [plans.length, search, total, page]);

  function openCreate() {
    navigate(`/admin/telephony-plans/${segment}/new`);
  }

  function openEdit(row) {
    setSelected(row);
    navigate(`/admin/telephony-plans/${segment}/${row.id}/edit`);
  }

  async function handleReorder(nextPlans) {
    setReorderBusy(true);
    setError(null);
    try {
      await telephonyBillingPlansAdminAPI.reorder({
        plan_category: category,
        plan_type:
          category === PLAN_CATEGORY.SUBSCRIPTION
            ? planTypeFilter || undefined
            : category === PLAN_CATEGORY.CREDIT_TOP_UP
              ? 'credit'
              : undefined,
        include_inactive: showInactive ? 'true' : 'false',
        ordered_ids: nextPlans.map((p) => p.id),
      });
      await reload();
    } catch (e) {
      const message = e?.response?.data?.error || e.message || 'Failed to save order';
      setError(message);
      throw new Error(message);
    } finally {
      setReorderBusy(false);
    }
  }

  const previewProps = {
    plan: selected,
    highlightPlanId: selected?.id,
    category,
    hideSectionHead: true,
    loading: previewLoading,
    refreshing: previewRefreshing,
    subscriptionPlans:
      category === PLAN_CATEGORY.SUBSCRIPTION ? previewCatalogPlans : EMPTY_PLANS,
    purchasePlans: category === PLAN_CATEGORY.CREDIT_TOP_UP ? previewCatalogPlans : EMPTY_PLANS,
    seatPlans: category === PLAN_CATEGORY.SEAT_ADD_ON ? previewCatalogPlans : EMPTY_PLANS,
    billingPlanTypeFilter: '',
    subscriptionCyclesVisible:
      category === PLAN_CATEGORY.SUBSCRIPTION ? subscriptionCyclesVisible : null,
  };

  return (
    <div className={styles.tabPanel}>
      {category === PLAN_CATEGORY.SUBSCRIPTION ? (
        <SubscriptionCatalogSettingsCard
          onError={setError}
          onCyclesChange={setSubscriptionCyclesVisible}
        />
      ) : null}
      <Card className={styles.listCard}>
        <header className={styles.listHead}>
          <SectionTitleWithHelp title={title} helpMessage={sectionHelp} />
          <Button size="sm" onClick={openCreate}>
            <MaterialSymbol name="add" size="sm" /> Add plan
          </Button>
        </header>

        {error ? (
          <div className={styles.listCardAlert}>
            <Alert variant="error">{error}</Alert>
          </div>
        ) : null}

        <div className={`${listStyles.tableCardToolbarTop} ${styles.listCardToolbar}`}>
          <div className={listStyles.tableCardToolbarLeft}>
            {category === PLAN_CATEGORY.SUBSCRIPTION ? (
              <Select
                label="Billing type"
                value={planTypeFilter}
                options={[
                  { value: '', label: 'All types' },
                  { value: 'credit', label: 'Credit only' },
                  { value: 'unlimited', label: 'Unlimited only' },
                ]}
                onChange={(e) => {
                  setPlanTypeFilter(e.target.value);
                  setPage(1);
                }}
                className={styles.toolbarBillingType}
              />
            ) : null}
            <Checkbox
              label="Show inactive"
              checked={showInactive}
              onChange={(e) => {
                setShowInactive(e.target.checked);
                setPage(1);
              }}
            />
          </div>
          <SearchInput
            value={search}
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search plans… (Enter)"
            className={listStyles.searchInToolbar}
          />
        </div>

        <div className={styles.listCardBody}>
          <PlansTableSection
            plans={plans}
            category={category}
            selectedId={selected?.id}
            onSelect={setSelected}
            onEdit={openEdit}
            onToggle={setToggleItem}
            onDelete={setDeleteItem}
            reorderEligible={reorderEligible}
            reorderBusy={reorderBusy}
            onReorder={handleReorder}
            loading={loading}
            refreshing={refreshing}
          />

          {!plans.length && !listBusy ? (
            <p className={styles.muted}>No plans yet. Add one to get started.</p>
          ) : null}

          {totalPages > 1 ? (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={LIST_LIMIT}
              onPageChange={(p) => {
                if (!listBusy && !reorderBusy) setPage(p);
              }}
              hidePageSize
            />
          ) : null}
        </div>
      </Card>

      <TenantPreviewSection
        showPreview={showPreview}
        onShowPreviewChange={setShowPreview}
        helpMessage={PLAN_PREVIEW_TAB_HELP[category]}
        previewBusy={previewLoading}
      >
        <TelephonyPlanTenantPreview {...previewProps} />
      </TenantPreviewSection>

      <ConfirmModal
        isOpen={!!toggleItem}
        onClose={() => setToggleItem(null)}
        onConfirm={async () => {
          setToggleBusy(true);
          try {
            await telephonyBillingPlansAdminAPI.toggleActive(toggleItem.id);
            setToggleItem(null);
            reload();
          } catch (e) {
            setError(e?.response?.data?.error || e.message);
          } finally {
            setToggleBusy(false);
          }
        }}
        title={toggleItem?.is_active === 1 ? 'Deactivate plan' : 'Activate plan'}
        message={`${toggleItem?.is_active === 1 ? 'Deactivate' : 'Activate'} "${toggleItem?.name}"?`}
        confirmText={toggleItem?.is_active === 1 ? 'Deactivate' : 'Activate'}
        loading={toggleBusy}
      />

      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => {
          setDeleteBusy(true);
          try {
            await telephonyBillingPlansAdminAPI.delete(deleteItem.id);
            setDeleteItem(null);
            if (selected?.id === deleteItem.id) setSelected(null);
            reload();
          } catch (e) {
            setError(e?.response?.data?.error || e.message);
          } finally {
            setDeleteBusy(false);
          }
        }}
        title="Delete plan"
        message={`Delete "${deleteItem?.name}"?`}
        confirmText="Delete"
        loading={deleteBusy}
      />
    </div>
  );
}

function TenantCatalogPreviewTab() {
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState(null);
  const [subscriptionCyclesVisible, setSubscriptionCyclesVisible] = useState(null);

  const {
    plans: subscriptionPlans,
    loading: subLoading,
    refreshing: subRefreshing,
  } = useTelephonyBillingPlansList(
    {
      plan_category: PLAN_CATEGORY.SUBSCRIPTION,
      include_inactive: 'false',
      page: 1,
      limit: PREVIEW_CATALOG_LIMIT,
    },
    { enabled: showPreview, keepStaleWhenDisabled: true }
  );
  const {
    plans: purchasePlans,
    loading: packLoading,
    refreshing: packRefreshing,
  } = useTelephonyBillingPlansList(
    {
      plan_category: PLAN_CATEGORY.CREDIT_TOP_UP,
      include_inactive: 'false',
      page: 1,
      limit: 50,
    },
    { enabled: showPreview, keepStaleWhenDisabled: true }
  );
  const {
    plans: seatPlans,
    loading: seatLoading,
    refreshing: seatRefreshing,
  } = useTelephonyBillingPlansList(
    {
      plan_category: PLAN_CATEGORY.SEAT_ADD_ON,
      include_inactive: 'false',
      page: 1,
      limit: PREVIEW_CATALOG_LIMIT,
    },
    { enabled: showPreview, keepStaleWhenDisabled: true }
  );

  const previewLoading = subLoading || packLoading || seatLoading;
  const previewRefreshing = subRefreshing || packRefreshing || seatRefreshing;

  return (
    <div className={styles.tabPanel}>
      <SubscriptionCatalogSettingsCard
        onError={setError}
        onCyclesChange={setSubscriptionCyclesVisible}
      />
      {error ? <Alert variant="error">{error}</Alert> : null}
      <Card className={styles.previewTabCard}>
        <header className={styles.previewTabHead}>
          <SectionTitleWithHelp
            title="Full tenant catalog preview"
            helpMessage={TENANT_CATALOG_PREVIEW_HELP}
          />
        </header>
      </Card>

      <TenantPreviewSection
        showPreview={showPreview}
        onShowPreviewChange={setShowPreview}
        helpMessage={TENANT_CATALOG_PREVIEW_HELP}
        previewBusy={previewLoading}
      >
        <TelephonyPlanTenantPreview
          hideSectionHead
          fullCatalog
          category={PLAN_CATEGORY.SUBSCRIPTION}
          subscriptionPlans={subscriptionPlans}
          purchasePlans={purchasePlans}
          seatPlans={seatPlans}
          billingPlanTypeFilter=""
          loading={previewLoading}
          refreshing={previewRefreshing}
          subscriptionCyclesVisible={subscriptionCyclesVisible}
        />
      </TenantPreviewSection>
    </div>
  );
}

export function PlatformTelephonyPlansPage() {
  const location = useLocation();
  const initialTab =
    location.state?.tab === 'purchase'
      ? 'purchase'
      : location.state?.tab === 'seats'
        ? 'seats'
        : location.state?.tab === 'preview'
          ? 'preview'
          : 'billing';
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (!location.state?.tab) return;
    const next =
      location.state.tab === 'purchase'
        ? 'purchase'
        : location.state.tab === 'seats'
          ? 'seats'
          : location.state.tab === 'preview'
            ? 'preview'
            : 'billing';
    setTab(next);
  }, [location.state?.tab]);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Product plans"
        subtitle="Subscription bundles (CRM + telephony + seats), one-time credit top-ups, and per-seat or channel add-ons."
      />

      <Tabs className={styles.tabs}>
        <TabList>
          <Tab isActive={tab === 'billing'} onClick={() => setTab('billing')}>
            {PRODUCT_COPY[PLAN_CATEGORY.SUBSCRIPTION].shortTitle}
          </Tab>
          <Tab isActive={tab === 'purchase'} onClick={() => setTab('purchase')}>
            {PRODUCT_COPY[PLAN_CATEGORY.CREDIT_TOP_UP].shortTitle}
          </Tab>
          <Tab isActive={tab === 'seats'} onClick={() => setTab('seats')}>
            {PRODUCT_COPY[PLAN_CATEGORY.SEAT_ADD_ON].shortTitle}
          </Tab>
          <Tab isActive={tab === 'preview'} onClick={() => setTab('preview')}>
            Tenant preview
          </Tab>
        </TabList>

        <div className={styles.tabContent}>
          <div className={tab === 'billing' ? undefined : styles.tabPaneHidden}>
            <PlansTab category={PLAN_CATEGORY.SUBSCRIPTION} />
          </div>
          <div className={tab === 'purchase' ? undefined : styles.tabPaneHidden}>
            <PlansTab category={PLAN_CATEGORY.CREDIT_TOP_UP} />
          </div>
          <div className={tab === 'seats' ? undefined : styles.tabPaneHidden}>
            <PlansTab category={PLAN_CATEGORY.SEAT_ADD_ON} />
          </div>
          <div className={tab === 'preview' ? undefined : styles.tabPaneHidden}>
            <TenantCatalogPreviewTab />
          </div>
        </div>
      </Tabs>
    </div>
  );
}
