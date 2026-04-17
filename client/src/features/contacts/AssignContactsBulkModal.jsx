import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { contactsAPI } from '../../services/contactsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { campaignsAPI } from '../../services/campaignsAPI';
import { useMutation } from '../../hooks/useAsyncData';

const NO_CHANGE = '__no_change__';
const CLEAR = '__clear__';

function agentRowsToOptions(agents) {
  return agents
    .map((u) => ({
      value: String(u.id),
      label: u.name || u.email || '—',
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Bulk assign / unassign contacts (admin + manager).
 * Uses POST /contacts/assign with explicit null vs omitted fields.
 *
 * Admin: choosing "Clear manager and agent" forces agent to clear and hides other agents.
 * Picking a manager filters agents to that manager's team; "No change" shows all agents.
 */
export function AssignContactsBulkModal({
  isOpen,
  onClose,
  selectedIds,
  assignContext = {},
  user,
  onSuccess,
}) {
  const role = user?.role ?? 'agent';
  const isAdmin = role === 'admin';
  const [users, setUsers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [managerChoice, setManagerChoice] = useState(NO_CHANGE);
  const [agentChoice, setAgentChoice] = useState(NO_CHANGE);
  const [campaignChoice, setCampaignChoice] = useState(NO_CHANGE);
  const [formError, setFormError] = useState('');

  const assignMut = useMutation((body) => contactsAPI.assign(body));

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const [uRes, cRes] = await Promise.all([
        tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false }),
        campaignsAPI
          .list({ page: 1, limit: 500, show_paused: true, type: 'static' })
          .catch(() => ({ data: { data: [] } })),
      ]);
      setUsers(uRes?.data?.data ?? []);
      setCampaigns(cRes?.data?.data ?? []);
    } catch {
      setUsers([]);
      setCampaigns([]);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setManagerChoice(NO_CHANGE);
    setAgentChoice(NO_CHANGE);
    setCampaignChoice(NO_CHANGE);
    loadMeta();
  }, [isOpen, loadMeta]);

  /** Clear manager → agent must be cleared */
  useEffect(() => {
    if (isAdmin && managerChoice === CLEAR) {
      setAgentChoice(CLEAR);
    }
  }, [isAdmin, managerChoice]);

  /** Selected agent must belong to selected manager (explicit or inferred from selection); otherwise reset */
  useEffect(() => {
    if (!isAdmin) return;
    if (managerChoice === CLEAR) return;
    if (agentChoice === NO_CHANGE || agentChoice === CLEAR) return;

    let requiredMgr = null;
    if (managerChoice !== NO_CHANGE) {
      requiredMgr = Number(managerChoice);
    } else {
      const { isMixed, sharedManagerId, selectionIncomplete } = assignContext || {};
      if (isMixed || selectionIncomplete || typeof sharedManagerId !== 'number') return;
      requiredMgr = sharedManagerId;
    }

    const ok = users.some(
      (u) =>
        u.role === 'agent' &&
        String(u.id) === agentChoice &&
        Number(u.manager_id) === requiredMgr
    );
    if (!ok) setAgentChoice(NO_CHANGE);
  }, [isAdmin, managerChoice, agentChoice, users, assignContext]);

  const managerOptions = useMemo(() => {
    return users
      .filter((u) => u.role === 'manager')
      .map((u) => ({ value: String(u.id), label: u.name || u.email || '—' }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [users]);

  /** Agents shown in dropdown (manager role = own team only) */
  const agentsForManagerFilter = useMemo(() => {
    if (role === 'manager' && user?.id) {
      return users.filter((u) => u.role === 'agent' && Number(u.manager_id) === Number(user.id));
    }
    if (!isAdmin) {
      return users.filter((u) => u.role === 'agent');
    }
    if (managerChoice === CLEAR) {
      return [];
    }
    if (managerChoice === NO_CHANGE) {
      const { isMixed, sharedManagerId, selectionIncomplete } = assignContext || {};
      if (!isMixed && !selectionIncomplete && typeof sharedManagerId === 'number') {
        return users.filter((u) => u.role === 'agent' && Number(u.manager_id) === sharedManagerId);
      }
      // Same team unknown, mixed teams, or all without manager → show all agents (submit rules still apply)
      return users.filter((u) => u.role === 'agent');
    }
    const mgrId = Number(managerChoice);
    return users.filter((u) => u.role === 'agent' && Number(u.manager_id) === mgrId);
  }, [users, role, user?.id, isAdmin, managerChoice, assignContext]);

  const agentFieldOptions = useMemo(() => {
    if (isAdmin && managerChoice === CLEAR) {
      return [{ value: CLEAR, label: '— Clear agent (required when there is no manager) —' }];
    }
    return [
      { value: NO_CHANGE, label: '— No change —' },
      { value: CLEAR, label: '— Clear agent —' },
      ...agentRowsToOptions(agentsForManagerFilter),
    ];
  }, [isAdmin, managerChoice, agentsForManagerFilter]);

  const agentFieldDisabled = isAdmin && managerChoice === CLEAR;

  const handleManagerChange = (e) => {
    const v = e.target.value;
    const prev = managerChoice;
    setManagerChoice(v);
    if (isAdmin && v === CLEAR) {
      setAgentChoice(CLEAR);
    } else if (isAdmin && prev === CLEAR && v !== CLEAR) {
      setAgentChoice(NO_CHANGE);
    }
  };

  const campaignOptions = useMemo(() => {
    return (campaigns || [])
      .filter((c) => c.type === 'static')
      .map((c) => ({ value: String(c.id), label: c.name || '—' }));
  }, [campaigns]);

  const handleSubmit = async () => {
    setFormError('');
    const body = { contactIds: selectedIds };

    if (isAdmin) {
      if (managerChoice === CLEAR) body.manager_id = null;
      else if (managerChoice !== NO_CHANGE) body.manager_id = Number(managerChoice);
    }

    if (isAdmin && managerChoice === CLEAR) {
      body.assigned_user_id = null;
    } else if (agentChoice === CLEAR) body.assigned_user_id = null;
    else if (agentChoice !== NO_CHANGE) body.assigned_user_id = Number(agentChoice);

    if (campaignChoice === CLEAR) body.campaign_id = null;
    else if (campaignChoice !== NO_CHANGE) body.campaign_id = Number(campaignChoice);

    const hasOp =
      body.manager_id !== undefined ||
      body.assigned_user_id !== undefined ||
      body.campaign_id !== undefined;
    if (!hasOp) {
      setFormError('Choose at least one change (manager, agent, or campaign).');
      return;
    }

    if (isAdmin && managerChoice === NO_CHANGE) {
      const { isMixed, selectionIncomplete } = assignContext || {};
      if ((isMixed || selectionIncomplete) && agentChoice !== NO_CHANGE && agentChoice !== CLEAR) {
        setFormError(
          selectionIncomplete
            ? 'Some selected rows are not on this page. Choose an owning manager, or bulk-assign one page at a time.'
            : 'Selected contacts belong to different managers. Choose an owning manager, or select rows from the same team only.'
        );
        return;
      }
    }

    const result = await assignMut.mutate(body);
    if (result?.success) {
      onSuccess?.(result.data);
      onClose();
    } else {
      setFormError(result?.error || 'Assignment failed');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Assign or update (${selectedIds.length} selected)`}
      size="md"
      closeOnEscape
      footer={
        <ModalFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={assignMut.loading || loadingMeta}>
            {assignMut.loading ? 'Applying…' : 'Apply'}
          </Button>
        </ModalFooter>
      }
    >
      {loadingMeta ? (
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {formError ? <Alert variant="error">{formError}</Alert> : null}
          <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
            <strong>Admin:</strong> choose a manager to filter agents to that team. With &quot;No change&quot;, agents are
            limited to the selected rows&apos; team when all share one manager; otherwise pick an owning manager first.
            Clearing the manager also clears the agent.
            <br />
            <strong>Manager:</strong> assign or remove agents on your team; optional campaign.
          </p>

          {isAdmin ? (
            <Select
              label="Owning manager"
              value={managerChoice}
              onChange={handleManagerChange}
              options={[
                { value: NO_CHANGE, label: '— No change —' },
                { value: CLEAR, label: '— Clear manager and agent —' },
                ...managerOptions,
              ]}
            />
          ) : null}

          <Select
            label="Assigned agent"
            value={agentChoice}
            onChange={(e) => setAgentChoice(e.target.value)}
            disabled={agentFieldDisabled}
            options={agentFieldOptions}
          />

          <Select
            label="Campaign (static)"
            value={campaignChoice}
            onChange={(e) => setCampaignChoice(e.target.value)}
            options={[
              { value: NO_CHANGE, label: '— No change —' },
              { value: CLEAR, label: '— Clear campaign —' },
              ...campaignOptions,
            ]}
          />
        </div>
      )}
    </Modal>
  );
}
