import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { EditIcon, RowActionGroup } from '../../components/ui/ActionIcons';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeaderCell } from '../../components/ui/Table';
import { Alert } from '../../components/ui/Alert';
import { ModalFooter } from '../../components/ui/Modal';
import { SlidePanel } from '../../components/ui/SlidePanel';
import { useAsyncData, useMutation } from '../../hooks/useAsyncData';
import listStyles from '../../components/admin/adminDataList.module.scss';
import styles from './IntegrationsPage.module.scss';

import { integrationsAPI } from '../../services/integrationsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  getCallingCodeOptionsForSelect,
  normalizeCallingCode,
} from '../../utils/phoneInput';

const PROVIDER_OPTIONS = [
  { value: 'meta_lead_ads', label: 'Meta Lead Ads' },
  { value: 'google_lead_forms', label: 'Google Lead Forms' },
  { value: 'justdial', label: 'JustDial' },
  { value: 'indiamart', label: 'IndiaMART' },
  { value: 'real_estate_portal', label: 'Real Estate Portal' },
];

function safeJsonParse(text) {
  if (!text || !String(text).trim()) return {};
  return JSON.parse(text);
}

export function IntegrationsPage() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitError, setSubmitError] = useState('');

  const [users, setUsers] = useState([]);
  const [apps, setApps] = useState([]);
  const [newAppName, setNewAppName] = useState('');
  const [newAppScopes, setNewAppScopes] = useState('contacts.write,calls.write,events.read,activities.write');
  const [generatedApiKey, setGeneratedApiKey] = useState('');

  const defaultForm = useMemo(
    () => ({
      provider_code: 'meta_lead_ads',
      provider_account_name: 'default',
      tokens_json: {},
      webhook_secret: '',
      default_owner_user_id: '',
      default_country_code: DEFAULT_PHONE_COUNTRY_CODE,
      is_active: 1,
    }),
    []
  );

  const [formData, setFormData] = useState(defaultForm);
  const [tokensText, setTokensText] = useState('{\n}');

  const fetchIntegrations = useCallback(
    () => integrationsAPI.getAll(),
    []
  );

  const { data: integrations, loading, error, refetch } = useAsyncData(fetchIntegrations, [], {
    transform: (res) => res?.data?.data ?? [],
  });

  const { mutate: upsertMutate, loading: saving } = useMutation((payload) => integrationsAPI.upsert(payload));

  const openCreate = () => {
    setEditing(null);
    setSubmitError('');
    setFormData(defaultForm);
    setTokensText('{\n}');
    setShowModal(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setSubmitError('');
    const tokens = item?.tokens_json && typeof item.tokens_json === 'object' ? item.tokens_json : {};
    setFormData({
      provider_code: item.provider_code,
      provider_account_name: item.provider_account_name || 'default',
      tokens_json: tokens,
      webhook_secret: item.webhook_secret || '',
      default_owner_user_id: item.default_owner_user_id != null ? String(item.default_owner_user_id) : '',
      default_country_code: item.default_country_code || DEFAULT_PHONE_COUNTRY_CODE,
      is_active: item.is_active === 0 ? 0 : 1,
    });
    setTokensText(JSON.stringify(tokens, null, 2));
    setShowModal(true);
  };

  const fetchUsers = useCallback(async () => {
    const res = await tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false });
    const list = res?.data?.data ?? [];
    setUsers(list);
  }, []);

  const fetchApps = useCallback(async () => {
    const res = await integrationsAPI.listApps();
    setApps(res?.data?.data ?? []);
  }, []);

  React.useEffect(() => {
    fetchUsers().catch(() => setUsers([]));
  }, [fetchUsers]);
  React.useEffect(() => {
    fetchApps().catch(() => setApps([]));
  }, [fetchApps]);

  const webhookBaseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleSave = async () => {
    setSubmitError('');
    let parsedTokens = {};
    try {
      parsedTokens = safeJsonParse(tokensText);
    } catch (e) {
      setSubmitError('Tokens JSON is not valid JSON');
      return;
    }

    const payload = {
      provider_code: formData.provider_code,
      provider_account_name: formData.provider_account_name?.trim() || 'default',
      tokens_json: parsedTokens,
      webhook_secret: formData.webhook_secret?.trim() || null,
      default_owner_user_id: formData.default_owner_user_id ? Number(formData.default_owner_user_id) : null,
      default_country_code: normalizeCallingCode(formData.default_country_code || DEFAULT_PHONE_COUNTRY_CODE),
      is_active: formData.is_active,
    };

    const result = await upsertMutate(payload);
    if (result?.success) {
      setShowModal(false);
      refetch();
    } else {
      setSubmitError(result?.error || 'Save failed');
    }
  };

  const handleCreateApp = async () => {
    const scopes = newAppScopes
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    const res = await integrationsAPI.createApp({
      name: newAppName.trim(),
      provider_code: 'generic_crm',
      scopes,
    });
    setGeneratedApiKey(res?.data?.data?.api_key || '');
    setNewAppName('');
    fetchApps().catch(() => {});
  };

  const handleRotateAppKey = async (appId) => {
    const res = await integrationsAPI.rotateAppKey(appId);
    setGeneratedApiKey(res?.data?.data?.api_key || '');
    fetchApps().catch(() => {});
  };

  return (
    <div className={listStyles.page}>
      <PageHeader
        title="Integrations"
        titleIcon="hub"
        description="Connect providers, store tokens, receive leads via webhook."
        actions={<Button onClick={openCreate}>Add integration</Button>}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className={listStyles.tableCard}>
        <div className={listStyles.tableCardBody} style={{ padding: 16 }}>
          {!integrations?.length ? (
            <div style={{ padding: 18, opacity: 0.9 }}>
              No integrations yet. Click <b>Add Integration</b> to configure a provider.
            </div>
          ) : (
            <Table variant="adminList">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Provider</TableHeaderCell>
                  <TableHeaderCell>Account</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Webhook</TableHeaderCell>
                  <TableHeaderCell width="170px" align="center">
                    Actions
                  </TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {integrations.map((it) => {
                  const webhookUrl = `${webhookBaseUrl}/api/integrations/webhook/${it.provider_code}/${it.id}`;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>{it.provider_code}</TableCell>
                      <TableCell>{it.provider_account_name || 'default'}</TableCell>
                      <TableCell>{it.is_active === 0 ? 'Inactive' : 'Active'}</TableCell>
                      <TableCell style={{ wordBreak: 'break-word' }}>{webhookUrl}</TableCell>
                      <TableCell align="center">
                        <RowActionGroup>
                          <IconButton size="sm" variant="subtle" title="Edit" onClick={() => openEdit(it)}>
                            <EditIcon />
                          </IconButton>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(webhookUrl);
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            Copy URL
                          </Button>
                        </RowActionGroup>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div className={`${listStyles.tableCard} ${styles.appsCard}`.trim()}>
        <div className={listStyles.tableCardBody}>
          <div className={styles.appsHeader}>
            <span className={styles.appsHeaderIcon} aria-hidden="true">
              <MaterialSymbol name="key" size="sm" />
            </span>
            <h3 className={styles.appsTitle}>Public CRM API Apps</h3>
          </div>
          <div className={styles.appsFormGrid}>
            <Input label="App name" value={newAppName} onChange={(e) => setNewAppName(e.target.value)} placeholder="e.g. Zoho Production" />
            <Input
              label="Scopes (comma separated)"
              value={newAppScopes}
              onChange={(e) => setNewAppScopes(e.target.value)}
              placeholder="contacts.write,calls.write,events.read,activities.write"
            />
            <div className={styles.appsCreateAction}>
              <Button onClick={handleCreateApp} disabled={!newAppName.trim()}>
                Create App Key
              </Button>
            </div>
          </div>
          {generatedApiKey ? <Alert variant="warning">Copy API key now: <code>{generatedApiKey}</code></Alert> : null}
          <Table variant="adminList">
            <TableHead>
              <TableRow>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Provider</TableHeaderCell>
                <TableHeaderCell>Key Hint</TableHeaderCell>
                <TableHeaderCell>Rate Limit</TableHeaderCell>
                <TableHeaderCell width="180px" align="center">Actions</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(apps || []).map((app) => (
                <TableRow key={app.id}>
                  <TableCell>{app.name}</TableCell>
                  <TableCell>{app.provider_code}</TableCell>
                  <TableCell>{app.api_key_hint || '-'}</TableCell>
                  <TableCell>{app.requests_per_minute || 120}/min</TableCell>
                  <TableCell align="center">
                    <Button size="sm" variant="ghost" onClick={() => handleRotateAppKey(app.id)}>
                      Rotate Key
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <SlidePanel
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Integration' : 'Add Integration'}
        size="wide"
        closeOnOverlay
        closeOnEscape
        footer={
          <ModalFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Save
            </Button>
          </ModalFooter>
        }
      >
        {submitError ? <Alert variant="error">{submitError}</Alert> : null}

        <div className={styles.formGrid}>
          <Select
            label="Provider"
            value={formData.provider_code}
            onChange={(e) => setFormData((p) => ({ ...p, provider_code: e.target.value }))}
            options={PROVIDER_OPTIONS}
          />

          <Input
            label="Provider account name"
            value={formData.provider_account_name}
            onChange={(e) => setFormData((p) => ({ ...p, provider_account_name: e.target.value }))}
            placeholder="e.g. MyPage / IndiaMART vendor"
          />

          <Input
            label="Webhook secret (optional)"
            value={formData.webhook_secret}
            onChange={(e) => setFormData((p) => ({ ...p, webhook_secret: e.target.value }))}
            placeholder="Put this if you want extra webhook verification"
          />

          <Select
            label="Default owner (imports into this user’s team)"
            value={formData.default_owner_user_id || ''}
            onChange={(e) => setFormData((p) => ({ ...p, default_owner_user_id: e.target.value }))}
            options={users.map((u) => ({
              value: String(u.id),
              label: `${u.name || u.email || 'User'} (${u.role})`,
            }))}
            placeholder="Select owner user"
          />

          <Select
            label="Default country code"
            value={normalizeCallingCode(formData.default_country_code)}
            onChange={(e) => setFormData((p) => ({ ...p, default_country_code: e.target.value }))}
            options={getCallingCodeOptionsForSelect(formData.default_country_code)}
          />

          <Select
            label="Status"
            value={String(formData.is_active)}
            onChange={(e) => setFormData((p) => ({ ...p, is_active: Number(e.target.value) }))}
            options={[
              { value: '1', label: 'Active' },
              { value: '0', label: 'Inactive' },
            ]}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Tokens JSON</div>
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 8 }}>
            Paste the tokens object you get from the provider. It is stored in DB as `tokens_json`.
          </div>
          <textarea
            value={tokensText}
            onChange={(e) => setTokensText(e.target.value)}
            className={styles.textarea}
            spellCheck={false}
          />
          <div style={{ marginTop: 8, opacity: 0.85, fontSize: 12 }}>
            Example: <code>{"{\"access_token\":\"...\",\"page_id\":\"...\"}"}</code>
          </div>
        </div>
      </SlidePanel>
    </div>
  );
}

