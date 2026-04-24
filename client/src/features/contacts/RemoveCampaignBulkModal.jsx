import React, { useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { contactsAPI } from '../../services/contactsAPI';
import { backgroundJobsAPI } from '../../services/backgroundJobsAPI';
import { useMutation } from '../../hooks/useAsyncData';
import {
  bulkShouldUseBackgroundJob,
  listFilterPayloadFromExportParams,
} from './contactBulkBackground';

export function RemoveCampaignBulkModal({
  isOpen,
  onClose,
  selectedIds,
  recordLabel,
  onSuccess,
  bulkJobContext = null,
  onBulkJobQueued,
}) {
  const [formError, setFormError] = useState('');
  const [jobQueueing, setJobQueueing] = useState(false);
  const assignMut = useMutation((body) => contactsAPI.assign(body));

  const handleApply = async () => {
    setFormError('');
    if (!selectedIds?.length) {
      setFormError('No rows selected.');
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
            campaign_id: null,
          }
        : { contact_ids: selectedIds, campaign_id: null };
      setJobQueueing(true);
      try {
        const res = await backgroundJobsAPI.enqueueBulkAssign(payload, { entity });
        const jobId = res?.data?.jobId;
        onBulkJobQueued?.(jobId, { operation: 'assign' });
        onSuccess?.({});
        onClose();
      } catch (e) {
        setFormError(e?.response?.data?.error || e?.message || 'Failed to queue campaign removal job');
      } finally {
        setJobQueueing(false);
      }
      return;
    }

    const result = await assignMut.mutate({
      contactIds: selectedIds,
      campaign_id: null,
    });
    if (!result?.success) {
      setFormError(result?.error || 'Could not remove campaign.');
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
      title={`Remove campaign from ${n} selected ${recordLabel}`}
      closeOnEscape={!assignMut.loading && !jobQueueing}
      footer={
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={assignMut.loading || jobQueueing}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleApply} disabled={assignMut.loading || jobQueueing || n === 0}>
            {assignMut.loading || jobQueueing ? 'Removing…' : 'Remove campaign'}
          </Button>
        </ModalFooter>
      }
    >
      {formError ? <Alert variant="error">{formError}</Alert> : null}
      <p style={{ margin: 0, fontSize: 13, opacity: 0.9 }}>
        This clears campaign assignment for all selected {recordLabel}.
      </p>
    </Modal>
  );
}
