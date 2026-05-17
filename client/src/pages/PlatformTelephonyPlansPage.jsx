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
import { telephonyBillingPlansAdminAPI } from '../services/tenantTelephonyAdminAPI';
import { EMPTY_PLANS } from '../constants/emptyCollections';
import { useTelephonyBillingPlansList } from '../hooks/useTelephonyBillingPlansList';
import { TelephonyPlanTenantPreview } from '../components/telephony/TelephonyPlanTenantPreview';
import { TelephonyPlansDraggableTable } from '../components/telephony/TelephonyPlansDraggableTable';
import { CATEGORY_TO_SEGMENT } from '../utils/telephonyPlanFormUtils';
import styles from './PlatformTelephonyPlansPage.module.scss';

const LIST_LIMIT = 100;
const PREVIEW_CATALOG_LIMIT = 100;


function PlansTab({ category, title, description, creditPacksPreview = EMPTY_PLANS }) {
  const navigate = useNavigate();
  const segment = CATEGORY_TO_SEGMENT[category];

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [planTypeFilter, setPlanTypeFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const { plans, total, loading, error, setError, reload } = useTelephonyBillingPlansList({
    plan_category: category,
    plan_type: category === 'tenant_billing' ? planTypeFilter || undefined : 'credit',
    search,
    include_inactive: showInactive ? 'true' : 'false',
    page,
    limit: LIST_LIMIT,
  });

  const { plans: previewCatalogPlans, loading: previewCatalogLoading } = useTelephonyBillingPlansList(
    {
      plan_category: category,
      plan_type: category === 'tenant_billing' ? undefined : 'credit',
      include_inactive: 'false',
      page: 1,
      limit: PREVIEW_CATALOG_LIMIT,
    }
  );

  const [selected, setSelected] = useState(null);
  const [toggleItem, setToggleItem] = useState(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / LIST_LIMIT));

  const canReorder = useMemo(() => {
    if (loading || reorderBusy || !plans.length) return false;
    if (search.trim()) return false;
    if (category === 'tenant_billing' && planTypeFilter) return false;
    if (total > LIST_LIMIT) return false;
    if (page !== 1 && total > plans.length) return false;
    return true;
  }, [loading, reorderBusy, plans.length, search, category, planTypeFilter, total, page]);

  const reorderBlockedReason = useMemo(() => {
    if (search.trim()) return 'Clear search to drag and reorder plans.';
    if (category === 'tenant_billing' && planTypeFilter) {
      return 'Set billing type to “All types” to reorder the full catalog.';
    }
    if (total > LIST_LIMIT) {
      return `Too many plans (${total}). Reorder is available when the list has ${LIST_LIMIT} or fewer items.`;
    }
    return null;
  }, [search, category, planTypeFilter, total]);

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
          category === 'tenant_billing'
            ? planTypeFilter || undefined
            : category === 'credit_purchase'
              ? 'credit'
              : undefined,
        include_inactive: showInactive,
        ordered_ids: nextPlans.map((p) => p.id),
      });
      await reload();
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Failed to save order');
    } finally {
      setReorderBusy(false);
    }
  }

  return (
    <>
      <Card className={styles.listCard}>
        <header className={styles.listHead}>
          <div>
            <h3 className={styles.listTitle}>{title}</h3>
            <p className={styles.listDesc}>{description}</p>
            {canReorder ? (
              <p className={styles.reorderHint}>
                <MaterialSymbol name="drag_indicator" size="sm" />
                Drag rows to set display order on the website and tenant billing page.
              </p>
            ) : reorderBlockedReason ? (
              <p className={styles.reorderHintMuted}>{reorderBlockedReason}</p>
            ) : null}
          </div>
          <Button size="sm" onClick={openCreate}>
            <MaterialSymbol name="add" size="sm" /> Add plan
          </Button>
        </header>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className={styles.toolbar}>
          {category === 'tenant_billing' ? (
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
          <SearchInput
            value={search}
            onSearch={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Search plans… (Enter)"
            className={styles.search}
          />
        </div>

        <TelephonyPlansDraggableTable
          plans={plans}
          category={category}
          selectedId={selected?.id}
          onSelect={setSelected}
          onEdit={openEdit}
          onToggle={setToggleItem}
          onDelete={setDeleteItem}
          canReorder={canReorder}
          reorderBusy={reorderBusy}
          onReorder={handleReorder}
        />

        {!plans.length && !loading ? (
          <p className={styles.muted}>No plans yet. Add one to get started.</p>
        ) : null}

        {totalPages > 1 ? (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIST_LIMIT}
            onPageChange={(p) => {
              if (!loading && !reorderBusy) setPage(p);
            }}
            hidePageSize
          />
        ) : null}
      </Card>

      <TelephonyPlanTenantPreview
        plan={selected}
        highlightPlanId={selected?.id}
        category={category}
        subscriptionPlans={category === 'tenant_billing' ? previewCatalogPlans : EMPTY_PLANS}
        purchasePlans={category === 'credit_purchase' ? previewCatalogPlans : creditPacksPreview}
        billingPlanTypeFilter={category === 'tenant_billing' ? '' : 'credit'}
        loading={loading || previewCatalogLoading}
      />

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
    </>
  );
}

function TenantCatalogPreviewTab() {
  const { plans: subscriptionPlans, loading: subLoading } = useTelephonyBillingPlansList({
    plan_category: 'tenant_billing',
    include_inactive: 'false',
    page: 1,
    limit: PREVIEW_CATALOG_LIMIT,
  });
  const { plans: purchasePlans, loading: packLoading } = useTelephonyBillingPlansList({
    plan_category: 'credit_purchase',
    include_inactive: 'false',
    page: 1,
    limit: 50,
  });

  return (
    <Card className={styles.previewTabCard}>
      <header className={styles.previewTabHead}>
        <h3 className={styles.listTitle}>Full tenant catalog preview</h3>
        <p className={styles.listDesc}>
          Active catalog as tenants see it: one card per plan with a billing-cycle toggle, then credit
          top-up packs.
        </p>
      </header>
      <TelephonyPlanTenantPreview
        hideSectionHead
        category="tenant_billing"
        subscriptionPlans={subscriptionPlans}
        purchasePlans={purchasePlans}
        billingPlanTypeFilter=""
        loading={subLoading || packLoading}
      />
    </Card>
  );
}

export function PlatformTelephonyPlansPage() {
  const location = useLocation();
  const initialTab =
    location.state?.tab === 'purchase'
      ? 'purchase'
      : location.state?.tab === 'preview'
        ? 'preview'
        : 'billing';
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    if (!location.state?.tab) return;
    const next =
      location.state.tab === 'purchase'
        ? 'purchase'
        : location.state.tab === 'preview'
          ? 'preview'
          : 'billing';
    setTab(next);
  }, [location.state?.tab]);

  const { plans: creditPacksPreview } = useTelephonyBillingPlansList(
    {
      plan_category: 'credit_purchase',
      include_inactive: 'false',
      page: 1,
      limit: 50,
    },
    { enabled: tab === 'billing' }
  );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Telephony plans"
        subtitle="Flexible subscription plans (credit or unlimited). Each plan includes all billing cycles on one row. Credit top-up packs are separate."
      />

      <Tabs>
        <TabList>
          <Tab isActive={tab === 'billing'} onClick={() => setTab('billing')}>
            Subscription plans
          </Tab>
          <Tab isActive={tab === 'purchase'} onClick={() => setTab('purchase')}>
            Credit top-up packs
          </Tab>
          <Tab isActive={tab === 'preview'} onClick={() => setTab('preview')}>
            Tenant preview
          </Tab>
        </TabList>

        {tab === 'billing' ? (
          <PlansTab
            category="tenant_billing"
            title="Subscription plans"
            description="Add any plan name you want. Each plan holds monthly, quarterly, 6-month, and yearly prices on one row — not separate plans per cycle."
            creditPacksPreview={creditPacksPreview}
          />
        ) : tab === 'purchase' ? (
          <PlansTab
            category="credit_purchase"
            title="Credit top-up packs"
            description="Sub-plans nested under credit subscriptions. Tenants buy these to add wallet credit (separate from included subscription credits)."
          />
        ) : (
          <TenantCatalogPreviewTab />
        )}
      </Tabs>
    </div>
  );
}
