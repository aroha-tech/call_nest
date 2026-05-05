import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { Skeleton } from '../components/ui/Skeleton';
import { dialerWorkspaceConfigAPI, mergeDialerWorkspaceConfig } from '../services/dialerWorkspaceConfigAPI';
import styles from './DialerWorkspaceSettingsPage.module.scss';

export function DialerWorkspaceSettingsPage() {
  const defaults = useMemo(() => mergeDialerWorkspaceConfig(null), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(defaults);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dialerWorkspaceConfigAPI.get();
      setDraft(mergeDialerWorkspaceConfig(res?.data?.data ?? null));
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load dial workspace options');
      setDraft(defaults);
    } finally {
      setLoading(false);
    }
  }, [defaults]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await dialerWorkspaceConfigAPI.update(draft);
      setDraft(mergeDialerWorkspaceConfig(res?.data?.data ?? null));
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <PageHeader
        title="Dial workspace"
        description="Choose which parts of the live dial session screen are available for your workspace. Agents need dial access; only administrators can change these options."
      />

      {error ? (
        <Alert variant="error" className={styles.alert}>
          {error}
        </Alert>
      ) : null}

      <Card className={styles.card}>
        {loading ? (
          <div className={styles.skel}>
            <Skeleton height={14} className={styles.skelLine} />
            <Skeleton height={14} className={styles.skelLine} />
            <Skeleton height={14} className={styles.skelLine} />
            <Skeleton height={14} className={styles.skelLine} />
            <Skeleton height={14} className={styles.skelLine} />
          </div>
        ) : (
          <div className={styles.form}>
            <p className={styles.lead}>
              These toggles apply to the full-screen dial workspace (session runner).{' '}
              <Link to="/dialer">Open dialer</Link>
            </p>

            <div className={styles.checkBlock}>
              <Checkbox
                label="Activity tab"
                checked={draft.show_activity_tab}
                onChange={(e) => setDraft((d) => ({ ...d, show_activity_tab: e.target.checked }))}
              />
              <p className={styles.checkHint}>Show the tab with call attempt history for the current lead.</p>
            </div>

            <div className={styles.checkBlock}>
              <Checkbox
                label="Edit contact during a session"
                checked={draft.allow_edit_contact_in_session}
                onChange={(e) => setDraft((d) => ({ ...d, allow_edit_contact_in_session: e.target.checked }))}
              />
              <p className={styles.checkHint}>
                Allow agents who can edit leads or contacts to update name, email, company, title, and city from the
                Current contact panel.
              </p>
            </div>

            <div className={styles.checkBlock}>
              <Checkbox
                label="Email tab"
                checked={draft.show_email_tab}
                onChange={(e) => setDraft((d) => ({ ...d, show_email_tab: e.target.checked }))}
              />
              <p className={styles.checkHint}>
                Show the Email tab in the workspace (placeholder until email tools are wired here).
              </p>
            </div>

            <div className={styles.checkBlock}>
              <Checkbox
                label="Website tab"
                checked={draft.show_website_tab}
                onChange={(e) => setDraft((d) => ({ ...d, show_website_tab: e.target.checked }))}
              />
              <p className={styles.checkHint}>Show the Website tab in the workspace (placeholder for future use).</p>
            </div>

            <div className={styles.actions}>
              <Button type="button" onClick={() => void save()} disabled={saving} loading={saving}>
                Save
              </Button>
              <Button type="button" variant="secondary" onClick={() => void load()} disabled={saving || loading}>
                Reload
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
