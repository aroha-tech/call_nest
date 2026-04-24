import React, { useCallback, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { ConfirmModal } from '../components/ui/Modal';
import { meetingsAPI } from '../services/meetingsAPI';
import { ScriptBodyEditor } from '../features/callScripts/ScriptBodyEditor';
import styles from './MeetingAttendeeEmailSettingsPage.module.scss';

const TEMPLATE_TABS = [
  { kind: 'created', label: 'New meeting' },
  { kind: 'updated', label: 'Updated' },
  { kind: 'cancelled', label: 'Cancelled' },
];

function formatMergeFieldLabel(key) {
  return String(key)
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function MeetingAttendeeEmailSettingsPage() {
  const editorRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [placeholderHelp, setPlaceholderHelp] = useState([]);
  const [tab, setTab] = useState('updated');
  const [resetKind, setResetKind] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await meetingsAPI.getEmailTemplates();
      setTemplates(res?.data?.data ?? []);
      setPlaceholderHelp(res?.data?.placeholder_help ?? []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load attendee email templates');
      setTemplates([]);
      setPlaceholderHelp([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const activeTemplate = useMemo(() => templates.find((t) => t.template_kind === tab), [templates, tab]);

  const variableGroups = useMemo(() => {
    if (!placeholderHelp.length) return [];
    return [
      {
        moduleKey: 'meeting',
        label: 'Meeting placeholders',
        list: placeholderHelp.map((name) => ({
          key: name,
          label: formatMergeFieldLabel(name),
        })),
      },
    ];
  }, [placeholderHelp]);

  function updateDraft(kind, field, value) {
    setTemplates((prev) => prev.map((row) => (row.template_kind === kind ? { ...row, [field]: value } : row)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = templates.map(({ template_kind, subject, body_html, body_text }) => ({
        template_kind,
        subject,
        body_html: body_html ?? '',
        body_text: body_text ?? '',
      }));
      const res = await meetingsAPI.putEmailTemplates({ templates: payload });
      setTemplates(res?.data?.data ?? []);
      setPlaceholderHelp(res?.data?.placeholder_help ?? []);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function confirmReset() {
    if (!resetKind) return;
    setSaving(true);
    setError(null);
    try {
      await meetingsAPI.resetEmailTemplate({ template_kind: resetKind });
      await load();
      setResetKind(null);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || 'Reset failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Meeting attendee emails"
        description="Set default attendee email templates sent for new, updated, and cancelled meetings."
      />

      {error ? (
        <Alert variant="error" className={styles.alert}>
          {error}
        </Alert>
      ) : null}

      <Card className={styles.card}>
        <p className={styles.intro}>
          This is now managed in Settings. Choose a template type, edit subject and formatted message, then save.
        </p>

        <div className={styles.tabs}>
          {TEMPLATE_TABS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={`${styles.tab} ${tab === item.kind ? styles.tabActive : ''}`}
              onClick={() => setTab(item.kind)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className={styles.muted}>Loading templates…</p>
        ) : activeTemplate ? (
          <div className={styles.form}>
            <Input
              label="Subject"
              value={activeTemplate.subject ?? ''}
              onChange={(e) => updateDraft(tab, 'subject', e.target.value)}
              disabled={saving}
            />
            <div>
              <div className={styles.label}>Message (formatted)</div>
              <p className={styles.hint}>
                Use the toolbar. Insert meeting fields with <strong>Variable</strong> in the toolbar.
              </p>
              <ScriptBodyEditor
                ref={editorRef}
                key={tab}
                scrollableLayout
                variableGroups={variableGroups}
                value={activeTemplate.body_html ?? ''}
                onChange={(html) => updateDraft(tab, 'body_html', html)}
                readOnly={saving}
                placeholder="Write the attendee email using merge fields."
              />
            </div>
            <div className={styles.actions}>
              <Button type="button" variant="secondary" onClick={() => setResetKind(tab)} disabled={saving}>
                Restore default for this type
              </Button>
              <Button type="button" onClick={save} loading={saving}>
                Save templates
              </Button>
            </div>
          </div>
        ) : (
          <p className={styles.muted}>No template loaded.</p>
        )}
      </Card>

      <ConfirmModal
        isOpen={!!resetKind}
        onClose={() => setResetKind(null)}
        onConfirm={confirmReset}
        title="Restore default template"
        message="Replace the subject and message for this template with the built-in default?"
        confirmText="Restore"
        loading={saving}
      />
    </div>
  );
}
