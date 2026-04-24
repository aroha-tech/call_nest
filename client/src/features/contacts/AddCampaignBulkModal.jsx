import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Alert } from '../../components/ui/Alert';
import { campaignsAPI } from '../../services/campaignsAPI';
import { contactsAPI } from '../../services/contactsAPI';
import { backgroundJobsAPI } from '../../services/backgroundJobsAPI';
import { useMutation } from '../../hooks/useAsyncData';
import {
  bulkShouldUseBackgroundJob,
  listFilterPayloadFromExportParams,
} from './contactBulkBackground';

export function AddCampaignBulkModal({
  isOpen,
  onClose,
  selectedIds,
  recordLabel,
  onSuccess,
  bulkJobContext = null,
  onBulkJobQueued,
}) {
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [campaignChoice, setCampaignChoice] = useState('');
  const [formError, setFormError] = useState('');
  const [jobQueueing, setJobQueueing] = useState(false);
  const assignMut = useMutation((body) => contactsAPI.assign(body));

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const res = await campaignsAPI.list({ page: 1, limit: 500, show_paused: true, type: 'static' });
      setCampaigns(res?.data?.data ?? []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setCampaignChoice('');
    loadCampaigns();
  }, [isOpen, loadCampaigns]);

  const campaignOptions = useMemo(() => {
    const rows = (campaigns || [])
      .filter((c) => c.type === 'static')
      .map((c) => ({ value: String(c.id), label: c.name || '—' }));
    return [{ value: '', label: '— Select campaign —' }, ...rows];
  }, [campaigns]);

  const handleApply = async () => {
    setFormError('');
    if (!selectedIds?.length) {
      setFormError('No rows selected.');
      return;
    }
    if (!campaignChoice) {
      setFormError('Choose a campaign.');
      return;
    }
    const campaignId = Number(campaignChoice);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      setFormError('Choose a valid campaign.');
      return;
    }

    const useBgJob =
      bulkJobContext &&
      bulkShouldUseBackgroundJob(bulkJobContext.selectionIsAllMatching, selectedIds.length);
    if (useBgJob) {
      const entity = bulkJobContext.recordType === 'lead' ? 'leads' : 'contacts';
      const payload = bulkJobContext.selectionIsAllMatching
        ? {
            list_filter: listFilterPayloadFromExportParams(bulkJobContext.exportListParams),
            campaign_id: campaignId,
          }
        : { contact_ids: selectedIds, campaign_id: campaignId };
      setJobQueueing(true);
      try {
        const res = await backgroundJobsAPI.enqueueBulkAssign(payload, { entity });
        const jobId = res?.data?.jobId;
        onBulkJobQueued?.(jobId, { operation: 'assign' });
        onSuccess?.({});
        onClose();
      } catch (e) {
        setFormError(e?.response?.data?.error || e?.message || 'Failed to queue campaign assignment job');
      } finally {
        setJobQueueing(false);
      }
      return;
    }

    const result = await assignMut.mutate({
      contactIds: selectedIds,
      campaign_id: campaignId,
    });
    if (!result?.success) {
      setFormError(result?.error || 'Campaign assignment failed.');
      return;
    }
    onSuccess?.(result.data);
    onClose();
  };

  const n = selectedIds?.length ?? 0;
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!assignMut.loading && !jobQueueing) onClose();
      }}
      title={`Add campaign to ${n} selected ${recordLabel}`}
      closeOnEscape={!assignMut.loading && !jobQueueing}
      footer={
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={assignMut.loading || jobQueueing}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={assignMut.loading || jobQueueing || loadingCampaigns || n === 0}>
            {assignMut.loading || jobQueueing ? 'Applying…' : 'Apply campaign'}
          </Button>
        </ModalFooter>
      }
    >
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.85 }}>
        Selected records will be moved to the campaign you choose.
      </p>
      <Select
        label="Campaign (static)"
        value={campaignChoice}
        onChange={(e) => setCampaignChoice(e.target.value)}
        options={campaignOptions}
        disabled={loadingCampaigns}
      />
    </Modal>
  );
}
