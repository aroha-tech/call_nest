import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Alert } from '../ui/Alert';
import { platformBillingAPI } from '../../services/billingAPI';
import styles from './PlatformRazorpaySettingsForm.module.scss';

export function PlatformRazorpaySettingsForm({ onError }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState(null);
  const [draft, setDraft] = useState({
    razorpay_key_id: '',
    razorpay_key_secret: '',
    razorpay_webhook_secret: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await platformBillingAPI.getRazorpaySettings();
      const d = res.data?.data || {};
      setMeta(d);
      setDraft({
        razorpay_key_id: d.razorpay_key_id || '',
        razorpay_key_secret: '',
        razorpay_webhook_secret: '',
      });
      onError?.(null);
    } catch (e) {
      onError?.(e?.response?.data?.error || e.message || 'Failed to load Razorpay settings');
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
      const body = { razorpay_key_id: draft.razorpay_key_id.trim() };
      if (draft.razorpay_key_secret.trim()) {
        body.razorpay_key_secret = draft.razorpay_key_secret.trim();
      }
      if (draft.razorpay_webhook_secret.trim()) {
        body.razorpay_webhook_secret = draft.razorpay_webhook_secret.trim();
      }
      const res = await platformBillingAPI.updateRazorpaySettings(body);
      setMeta(res.data?.data || {});
      setDraft((prev) => ({
        ...prev,
        razorpay_key_secret: '',
        razorpay_webhook_secret: '',
      }));
      onError?.(null);
    } catch (e) {
      onError?.(e?.response?.data?.error || e.message || 'Failed to save Razorpay settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <Card className={styles.card}>Loading Razorpay settings…</Card>;
  }

  return (
    <Card className={styles.card}>
      <p className={styles.intro}>
        Configure Razorpay for tenant checkout (subscriptions, credit top-up, seat add-ons). Environment
        variables in server <code>.env</code> override these values when set.
      </p>

      {meta?.razorpay_dev_mock ? (
        <Alert variant="info" className={styles.alert}>
          Development mock checkout is active (<code>RAZORPAY_DEV_MOCK=1</code>). Tenants can purchase
          without real Razorpay until you add keys below or in .env.
        </Alert>
      ) : null}

      {meta?.source === 'env' ? (
        <Alert variant="warning" className={styles.alert}>
          Keys are loaded from server environment variables. Remove RAZORPAY_KEY_ID and
          RAZORPAY_KEY_SECRET from .env to manage keys here.
        </Alert>
      ) : null}

      <div className={styles.statusRow}>
        <span>
          Status:{' '}
          <strong>{meta?.razorpay_configured ? 'Payments enabled' : 'Not configured'}</strong>
        </span>
        {meta?.razorpay_key_secret_set ? (
          <span className={styles.muted}>Key secret saved</span>
        ) : null}
      </div>

      <div className={styles.formGrid}>
        <Input
          label="Razorpay Key ID"
          value={draft.razorpay_key_id}
          onChange={(e) => setDraft((p) => ({ ...p, razorpay_key_id: e.target.value }))}
          placeholder="rzp_test_…"
          disabled={meta?.source === 'env'}
        />
        <Input
          label="Key secret"
          type="password"
          value={draft.razorpay_key_secret}
          onChange={(e) => setDraft((p) => ({ ...p, razorpay_key_secret: e.target.value }))}
          placeholder={meta?.razorpay_key_secret_set ? 'Leave blank to keep current' : 'Required on first save'}
          disabled={meta?.source === 'env'}
        />
        <Input
          label="Webhook secret (optional)"
          type="password"
          value={draft.razorpay_webhook_secret}
          onChange={(e) => setDraft((p) => ({ ...p, razorpay_webhook_secret: e.target.value }))}
          placeholder={meta?.razorpay_webhook_secret_set ? 'Leave blank to keep current' : ''}
          disabled={meta?.source === 'env'}
        />
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="primary" onClick={save} disabled={saving || meta?.source === 'env'}>
          {saving ? 'Saving…' : 'Save Razorpay keys'}
        </Button>
      </div>
    </Card>
  );
}
