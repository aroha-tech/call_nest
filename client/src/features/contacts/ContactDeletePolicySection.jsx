import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Alert } from '../../components/ui/Alert';
import { contactDeletePolicyAPI } from '../../services/contactDeletePolicyAPI';
import styles from './ContactDeletePolicySection.module.scss';

/**
 * Admin (settings) and managers (users.team) can change whether agents may delete leads/contacts they can access.
 */
export function ContactDeletePolicySection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [leads, setLeads] = useState(false);
  const [contacts, setContacts] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await contactDeletePolicyAPI.get();
      const d = res?.data?.data;
      setLeads(!!d?.agents_can_delete_leads);
      setContacts(!!d?.agents_can_delete_contacts);
    } catch (e) {
      setLoadError(e.response?.data?.error || e.message || 'Failed to load policy');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e) => {
    e?.preventDefault?.();
    setSaveError(null);
    setSaving(true);
    try {
      await contactDeletePolicyAPI.update({
        agents_can_delete_leads: leads,
        agents_can_delete_contacts: contacts,
      });
      await load();
    } catch (err) {
      setSaveError(err.response?.data?.error || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={styles.card}>
      <h2 className={styles.title}>Agent delete permissions</h2>
      <p className={styles.desc}>
        By default, agents cannot delete leads or contacts. Turn these on only if you want agents to remove records
        they are allowed to view and edit. Admins and managers with delete permission are not affected.
      </p>
      {loading ? <p className={styles.muted}>Loading…</p> : null}
      {loadError ? <Alert variant="error">{loadError}</Alert> : null}
      {saveError ? <Alert variant="error">{saveError}</Alert> : null}
      {!loading && !loadError ? (
        <form className={styles.form} onSubmit={handleSave}>
          <Checkbox
            id="policy-agent-delete-leads"
            label="Allow agents to delete leads"
            checked={leads}
            onChange={(e) => setLeads(e.target.checked)}
            disabled={saving}
          />
          <Checkbox
            id="policy-agent-delete-contacts"
            label="Allow agents to delete contacts"
            checked={contacts}
            onChange={(e) => setContacts(e.target.checked)}
            disabled={saving}
          />
          <div className={styles.actions}>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save policy'}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
