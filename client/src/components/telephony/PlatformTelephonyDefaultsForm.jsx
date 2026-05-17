import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { tenantTelephonyAdminAPI } from '../../services/tenantTelephonyAdminAPI';
import {
  formatPaiseAsInr,
  formatPaisePerMinHint,
  formatRupeeAmount,
  paiseToRupeeInput,
  rupeeToPaise,
  safePaisePerMin,
} from '../../utils/telephonyMoneyUtils';
import styles from './PlatformTelephonyDefaultsForm.module.scss';

function safeNumber(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function PlatformTelephonyDefaultsForm({ onError }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    default_call_rate_paise_per_minute: '',
    default_byo_platform_fee_paise_per_minute: '',
    default_call_min_balance_paise: '',
    default_unlimited_minutes_cap_per_month: '',
  });
  const [saved, setSaved] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tenantTelephonyAdminAPI.getPlatformSettings();
      const d = res.data?.data || {};
      setDraft({
        default_call_rate_paise_per_minute: String(d.default_call_rate_paise_per_minute ?? ''),
        default_byo_platform_fee_paise_per_minute: String(
          d.default_byo_platform_fee_paise_per_minute ?? ''
        ),
        default_call_min_balance_paise: paiseToRupeeInput(d.default_call_min_balance_paise),
        default_unlimited_minutes_cap_per_month: String(
          d.default_unlimited_minutes_cap_per_month ?? ''
        ),
      });
      setSaved(d);
      onError?.(null);
    } catch (e) {
      onError?.(e?.response?.data?.error || e.message || 'Failed to load platform settings');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const body = {
        default_call_rate_paise_per_minute: safePaisePerMin(draft.default_call_rate_paise_per_minute),
        default_byo_platform_fee_paise_per_minute: safePaisePerMin(
          draft.default_byo_platform_fee_paise_per_minute
        ),
        default_call_min_balance_paise: rupeeToPaise(draft.default_call_min_balance_paise),
        default_unlimited_minutes_cap_per_month: safeNumber(
          draft.default_unlimited_minutes_cap_per_month
        ),
      };
      const res = await tenantTelephonyAdminAPI.updatePlatformSettings(body);
      setSaved(res.data?.data || {});
      onError?.(null);
    } catch (e) {
      onError?.(e?.response?.data?.error || e.message || 'Failed to save platform settings');
    } finally {
      setSaving(false);
    }
  }

  const hints = useMemo(
    () => ({
      rate: formatPaisePerMinHint(draft.default_call_rate_paise_per_minute),
      byo: formatPaisePerMinHint(draft.default_byo_platform_fee_paise_per_minute),
      min: formatRupeeAmount(draft.default_call_min_balance_paise),
    }),
    [draft]
  );

  return (
    <Card className={styles.card}>
      <p className={styles.intro}>
        Global fallbacks when a tenant has no billing plan or per-tenant override. Call rate and BYO fee
        are in paise per connected minute; minimum balance is in rupees.
      </p>
      <div className={styles.formGrid}>
        <Input
          label="Default call rate (paise / connected minute)"
          type="number"
          min={0}
          value={draft.default_call_rate_paise_per_minute}
          disabled={loading}
          onChange={(e) =>
            setDraft((d) => ({ ...d, default_call_rate_paise_per_minute: e.target.value }))
          }
          hint={hints.rate}
        />
        <Input
          label="BYO platform fee (paise / connected minute)"
          type="number"
          min={0}
          value={draft.default_byo_platform_fee_paise_per_minute}
          disabled={loading}
          onChange={(e) =>
            setDraft((d) => ({ ...d, default_byo_platform_fee_paise_per_minute: e.target.value }))
          }
          hint={hints.byo}
        />
        <Input
          label="Minimum balance to start a call (₹)"
          type="number"
          min={0}
          step="0.01"
          value={draft.default_call_min_balance_paise}
          disabled={loading}
          onChange={(e) =>
            setDraft((d) => ({ ...d, default_call_min_balance_paise: e.target.value }))
          }
          hint={hints.min !== '—' ? `Calls blocked below ${hints.min}` : undefined}
        />
        <Input
          label="Default monthly cap for unlimited mode (minutes)"
          type="number"
          min={0}
          value={draft.default_unlimited_minutes_cap_per_month}
          disabled={loading}
          onChange={(e) =>
            setDraft((d) => ({ ...d, default_unlimited_minutes_cap_per_month: e.target.value }))
          }
          hint="0 = no cap when tenant has unlimited billing without a plan."
        />
      </div>
      <div className={styles.actions}>
        {saved ? (
          <span className={styles.savedTag}>
            Saved · default rate {formatPaiseAsInr(saved.default_call_rate_paise_per_minute)}/min
          </span>
        ) : (
          <span />
        )}
        <Button onClick={save} disabled={saving || loading}>
          {saving ? 'Saving…' : 'Save telephony defaults'}
        </Button>
      </div>
    </Card>
  );
}
