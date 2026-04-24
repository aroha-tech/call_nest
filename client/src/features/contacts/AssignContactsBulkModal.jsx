import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { contactsAPI } from '../../services/contactsAPI';
import { backgroundJobsAPI } from '../../services/backgroundJobsAPI';
import { tenantUsersAPI } from '../../services/tenantUsersAPI';
import { useMutation } from '../../hooks/useAsyncData';
import {
  bulkShouldUseBackgroundJob,
  listFilterPayloadFromExportParams,
} from './contactBulkBackground';

const UNSET = '';
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
 * Admin: choosing "No manager" forces "No agent" and hides other agents.
 * Picking a manager filters agents to that manager's team.
 */
export function AssignContactsBulkModal({
  isOpen,
  onClose,
  selectedIds,
  assignContext = {},
  user,
  onSuccess,
  /** When set, large selections or “all matching” enqueue POST /background-jobs/.../bulk-assign. */
  bulkJobContext = null,
  onBulkJobQueued,
}) {
  const role = user?.role ?? 'agent';
  const isAdmin = role === 'admin';
  const [users, setUsers] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [managerChoice, setManagerChoice] = useState(UNSET);
  const [agentChoice, setAgentChoice] = useState(UNSET);
  const [formError, setFormError] = useState('');
  const [jobQueueing, setJobQueueing] = useState(false);

  const assignMut = useMutation((body) => contactsAPI.assign(body));

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    try {
      const uRes = await tenantUsersAPI.getAll({ page: 1, limit: 500, includeDisabled: false });
      setUsers(uRes?.data?.data ?? []);
    } catch {
      setUsers([]);
    } finally {
      setLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setManagerChoice(UNSET);
    setAgentChoice(UNSET);
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
    if (agentChoice === UNSET || agentChoice === CLEAR) return;

    let requiredMgr = null;
    if (managerChoice !== UNSET) {
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
    if (!ok) setAgentChoice(UNSET);
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
    if (managerChoice === UNSET) {
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
      return [{ value: CLEAR, label: '— No agent (required when there is no manager) —' }];
    }
    return [
      { value: CLEAR, label: '— No agent —' },
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
      setAgentChoice(UNSET);
    }
  };

  const handleSubmit = async () => {
    setFormError('');
    const body = { contactIds: selectedIds };

    if (isAdmin) {
      if (managerChoice === CLEAR) body.manager_id = null;
      else if (managerChoice !== UNSET) body.manager_id = Number(managerChoice);
    }

    if (isAdmin && managerChoice === CLEAR) {
      body.assigned_user_id = null;
    } else if (agentChoice === CLEAR) body.assigned_user_id = null;
    else if (agentChoice !== UNSET) body.assigned_user_id = Number(agentChoice);

    const hasOp = body.manager_id !== undefined || body.assigned_user_id !== undefined;
    if (!hasOp) {
      setFormError('Choose at least one change (manager or agent).');
      return;
    }

    if (isAdmin && managerChoice === UNSET) {
      const { isMixed, selectionIncomplete } = assignContext || {};
      if ((isMixed || selectionIncomplete) && agentChoice !== UNSET && agentChoice !== CLEAR) {
        setFormError(
          selectionIncomplete
            ? 'Some selected rows are not on this page. Choose an owning manager, or bulk-assign one page at a time.'
            : 'Selected contacts belong to different managers. Choose an owning manager, or select rows from the same team only.'
        );
        return;
      }
    }

    const useBgJob =
      bulkJobContext &&
      bulkShouldUseBackgroundJob(bulkJobContext.selectionIsAllMatching, selectedIds.length);
    if (useBgJob) {
      const entity = bulkJobContext.recordType === 'lead' ? 'leads' : 'contacts';
      const payload = bulkJobContext.selectionIsAllMatching
        ? { list_filter: listFilterPayloadFromExportParams(bulkJobContext.exportListParams) }
        : { contact_ids: [...selectedIds] };
      if (isAdmin) {
        if (managerChoice === CLEAR) payload.manager_id = null;
        else if (managerChoice !== UNSET) payload.manager_id = Number(managerChoice);
      }
      if (isAdmin && managerChoice === CLEAR) {
        payload.assigned_user_id = null;
      } else if (agentChoice === CLEAR) {
        payload.assigned_user_id = null;
      } else if (agentChoice !== UNSET) {
        payload.assigned_user_id = Number(agentChoice);
      }
      setJobQueueing(true);
      setFormError('');
      try {
        const res = await backgroundJobsAPI.enqueueBulkAssign(payload, { entity });
        const jobId = res?.data?.jobId;
        onBulkJobQueued?.(jobId, { operation: 'assign' });
        onSuccess?.();
        onClose();
      } catch (e) {
        setFormError(e?.response?.data?.error || e?.message || 'Failed to queue assign job');
      } finally {
        setJobQueueing(false);
      }
      return;
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
          <Button onClick={handleSubmit} disabled={assignMut.loading || loadingMeta || jobQueueing}>
            {assignMut.loading || jobQueueing ? 'Applying…' : 'Apply'}
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
            <strong>Admin:</strong> choose a manager to filter agents to that team. If all selected rows share one
            manager, agents are limited to that team. Choosing No manager also sets No agent.
            <br />
            <strong>Manager:</strong> assign or remove agents on your team.
          </p>

          {isAdmin ? (
            <Select
              label="Owning manager"
              value={managerChoice}
              onChange={handleManagerChange}
              options={[
                { value: UNSET, label: '— Select manager —' },
                { value: CLEAR, label: '— No manager —' },
                ...managerOptions,
              ]}
            />
          ) : null}

          <Select
            label="Assigned agent"
            value={agentChoice}
            onChange={(e) => setAgentChoice(e.target.value)}
            disabled={agentFieldDisabled}
            options={[{ value: UNSET, label: '— Select agent —' }, ...agentFieldOptions.map((o) => ({
              ...o,
              label: o.value === CLEAR ? '— No agent —' : o.label,
            }))]}
          />
        </div>
      )}
    </Modal>
  );
}
