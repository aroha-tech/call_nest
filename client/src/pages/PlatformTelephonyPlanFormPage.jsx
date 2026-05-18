import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { MaterialSymbol } from '../components/ui/MaterialSymbol';
import { SubscriptionPlanFormFields } from '../components/telephony/SubscriptionPlanFormFields';
import { CreditPackFormFields } from '../components/telephony/CreditPackFormFields';
import { SeatPlanFormFields } from '../components/telephony/SeatPlanFormFields';
import { PLAN_CATEGORY, PRODUCT_COPY } from '../constants/telephonyProductTypes';
import { TelephonyPlanSinglePreview } from '../components/telephony/TelephonyPlanSinglePreview';
import { telephonyBillingPlansAdminAPI } from '../services/tenantTelephonyAdminAPI';
import {
  SEGMENT_TO_CATEGORY,
  blankForm,
  formToBody,
  formToPreviewPlan,
  planToForm,
} from '../utils/telephonyPlanFormUtils';
import styles from './PlatformTelephonyPlanFormPage.module.scss';

const LIST_PATH = '/admin/telephony-plans';

function segmentLabel(segment) {
  if (segment === 'top-up') return PRODUCT_COPY[PLAN_CATEGORY.CREDIT_TOP_UP].shortTitle;
  if (segment === 'seat-plans') return PRODUCT_COPY[PLAN_CATEGORY.SEAT_ADD_ON].shortTitle;
  return PRODUCT_COPY[PLAN_CATEGORY.SUBSCRIPTION].shortTitle;
}

export function PlatformTelephonyPlanFormPage() {
  const { segment, planId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const category = SEGMENT_TO_CATEGORY[segment];
  const isEdit = Boolean(planId);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => blankForm(category || PLAN_CATEGORY.SUBSCRIPTION));
  const [loadError, setLoadError] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const isSubscription = category === PLAN_CATEGORY.SUBSCRIPTION;
  const isSeatPlan = category === PLAN_CATEGORY.SEAT_ADD_ON;
  const isTopUp = category === PLAN_CATEGORY.CREDIT_TOP_UP;

  useEffect(() => {
    if (!category) {
      navigate(LIST_PATH, { replace: true });
    }
  }, [category, navigate]);

  useEffect(() => {
    if (!isEdit && category) {
      const base = blankForm(category);
      if (category === PLAN_CATEGORY.SUBSCRIPTION) {
        const planType = searchParams.get('plan_type');
        if (planType === 'credit' || planType === 'unlimited') base.plan_type = planType;
      }
      setForm(base);
      setEditing(null);
    }
  }, [category, isEdit, searchParams]);

  useEffect(() => {
    if (!isEdit || !planId) return;
    let cancelled = false;
    setLoadingPlan(true);
    setLoadError(null);
    telephonyBillingPlansAdminAPI
      .getById(planId)
      .then((res) => {
        if (cancelled) return;
        const row = res.data?.data;
        if (!row) {
          setLoadError('Plan not found');
          return;
        }
        setEditing(row);
        setForm(planToForm(row, row.plan_category || category));
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e?.response?.data?.error || e.message || 'Failed to load plan');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPlan(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planId, isEdit, category]);

  const previewPlan = useMemo(() => formToPreviewPlan(form, editing), [form, editing]);

  async function save(e) {
    e?.preventDefault?.();
    setSaving(true);
    setSubmitError(null);
    try {
      const body = formToBody(form, { isEdit });
      if (isEdit) {
        await telephonyBillingPlansAdminAPI.update(editing.id, body);
      } else {
        await telephonyBillingPlansAdminAPI.create(body);
      }
      navigate(LIST_PATH, {
        state: {
          tab: isSubscription ? 'billing' : isSeatPlan ? 'seats' : 'purchase',
        },
      });
    } catch (e) {
      setSubmitError(e?.response?.data?.error || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (!category) return null;

  const title = isEdit ? 'Edit plan' : 'Create plan';
  const hint = isSubscription
    ? PRODUCT_COPY[PLAN_CATEGORY.SUBSCRIPTION].description
    : isSeatPlan
      ? PRODUCT_COPY[PLAN_CATEGORY.SEAT_ADD_ON].description
      : PRODUCT_COPY[PLAN_CATEGORY.CREDIT_TOP_UP].description;

  return (
    <div className={styles.page}>
      <Link to={LIST_PATH} className={styles.backLink}>
        <MaterialSymbol name="arrow_back" size="sm" />
        Product plans
      </Link>

      <PageHeader title={title} subtitle={`${segmentLabel(segment)} · ${hint}`} />

      {loadError ? <Alert variant="error">{loadError}</Alert> : null}

      {loadingPlan ? (
        <p className={styles.loading}>Loading plan…</p>
      ) : (
        <div className={styles.split}>
          <div className={styles.formPane}>
            <Card className={styles.formCard}>
              <form onSubmit={save} className={styles.formInner}>
                {submitError ? <Alert variant="warning">{submitError}</Alert> : null}
                {isSubscription ? (
                  <SubscriptionPlanFormFields form={form} setForm={setForm} editing={editing} />
                ) : isSeatPlan ? (
                  <SeatPlanFormFields form={form} setForm={setForm} editing={editing} />
                ) : (
                  <CreditPackFormFields form={form} setForm={setForm} editing={editing} />
                )}
              </form>
              <footer className={styles.formFooter}>
                <Button variant="ghost" type="button" onClick={() => navigate(LIST_PATH)}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create plan'}
                </Button>
              </footer>
            </Card>
          </div>

          <aside className={styles.previewPane}>
            <div className={styles.previewCard}>
              <p className={styles.previewLabel}>
                <MaterialSymbol name="visibility" size="sm" />
                Live preview
              </p>
              <TelephonyPlanSinglePreview plan={previewPlan} category={category} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
