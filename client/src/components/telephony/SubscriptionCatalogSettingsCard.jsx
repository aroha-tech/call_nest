import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { tenantTelephonyAdminAPI } from '../../services/tenantTelephonyAdminAPI';
import { PLAN_BILLING_CYCLES, normalizeSubscriptionCyclesVisible } from '../../utils/planCyclePricing';
import styles from './SubscriptionCatalogSettingsCard.module.scss';

/**
 * Super-admin: which subscription billing cycles appear on website and tenant panel.
 */
export function SubscriptionCatalogSettingsCard({ onError, onCyclesChange }) {
  const [draft, setDraft] = useState(() => normalizeSubscriptionCyclesVisible(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setSaved(false);
    try {
      const res = await tenantTelephonyAdminAPI.getPlatformSettings();
      const cycles = res.data?.data?.subscription_cycles_visible;
      const normalized = normalizeSubscriptionCyclesVisible(cycles);
      setDraft(normalized);
      onCyclesChange?.(normalized);
      onError?.(null);
    } catch (e) {
      onError?.(e?.response?.data?.error || e.message || 'Failed to load catalog settings');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const normalized = normalizeSubscriptionCyclesVisible(draft);
      await tenantTelephonyAdminAPI.updatePlatformSettings({
        subscription_cycles_visible: normalized,
      });
      setDraft(normalized);
      onCyclesChange?.(normalized);
      setSaved(true);
      onError?.(null);
    } catch (e) {
      onError?.(e?.response?.data?.error || e.message || 'Failed to save catalog settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={styles.card}>
      <header className={styles.head}>
        <div className={styles.headMain}>
          <strong>Billing cycles shown to customers</strong>
          <p className={styles.hint}>
            Control which subscription intervals appear on the marketing website and in the tenant
            billing panel. Plans can still store prices for hidden cycles; they simply will not be
            offered at checkout.
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={loading || saving}>
          {saving ? 'Saving…' : 'Save cycles'}
        </Button>
      </header>
      {saved ? (
        <Alert variant="success" className={styles.saved}>
          Billing cycle visibility saved.
        </Alert>
      ) : null}
      <div className={styles.grid}>
        {PLAN_BILLING_CYCLES.map(({ value, label }) => (
          <Checkbox
            key={value}
            label={label}
            checked={draft[value] !== false}
            disabled={loading}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                [value]: e.target.checked,
              }))
            }
          />
        ))}
      </div>
    </Card>
  );
}
