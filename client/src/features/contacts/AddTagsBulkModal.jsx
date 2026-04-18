import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Spinner } from '../../components/ui/Spinner';
import { SelectOncePick } from '../../components/ui/Select';
import { contactTagsAPI } from '../../services/contactTagsAPI';
import { contactsAPI } from '../../services/contactsAPI';
import { backgroundJobsAPI } from '../../services/backgroundJobsAPI';
import { useMutation } from '../../hooks/useAsyncData';
import {
  bulkShouldUseBackgroundJob,
  listFilterPayloadFromExportParams,
} from './contactBulkBackground';
import styles from './AddTagsBulkModal.module.scss';

/**
 * Add tenant tags to many contacts/leads at once (merges with existing tags on each row).
 */
export function AddTagsBulkModal({
  isOpen,
  onClose,
  selectedIds,
  recordLabel,
  onSuccess,
  bulkJobContext = null,
  onBulkJobQueued,
}) {
  const [tags, setTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [chosenTagIds, setChosenTagIds] = useState([]);
  const [formError, setFormError] = useState('');
  const [jobQueueing, setJobQueueing] = useState(false);

  const bulkMut = useMutation((body) => contactsAPI.bulkAddTags(body));

  const loadTags = useCallback(async () => {
    setLoadError('');
    setTagsLoading(true);
    try {
      const res = await contactTagsAPI.list();
      setTags(res?.data?.data ?? []);
    } catch (e) {
      setTags([]);
      setLoadError(e.response?.data?.error || e.message || 'Failed to load tags');
    } finally {
      setTagsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setChosenTagIds([]);
    loadTags();
  }, [isOpen, loadTags]);

  const tagOptions = useMemo(
    () =>
      tags.map((t) => ({
        value: String(t.id),
        label: t.name || '—',
      })),
    [tags]
  );

  const handleApply = async () => {
    setFormError('');
    if (!selectedIds?.length) {
      setFormError('No rows selected.');
      return;
    }
    if (chosenTagIds.length === 0) {
      setFormError('Choose at least one tag.');
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
            tag_ids: chosenTagIds,
          }
        : { contact_ids: selectedIds, tag_ids: chosenTagIds };
      setJobQueueing(true);
      setFormError('');
      try {
        const res = await backgroundJobsAPI.enqueueBulkAddTags(payload, { entity });
        const jobId = res?.data?.jobId;
        onBulkJobQueued?.(jobId, { operation: 'add_tags' });
        onSuccess?.({});
        onClose();
      } catch (e) {
        setFormError(e?.response?.data?.error || e?.message || 'Failed to queue add-tags job');
      } finally {
        setJobQueueing(false);
      }
      return;
    }
    const result = await bulkMut.mutate({
      contact_ids: selectedIds,
      tag_ids: chosenTagIds,
    });
    if (!result.success) {
      setFormError(result.error || 'Request failed');
      return;
    }
    const payload = result.data?.data;
    const updatedCount = payload?.updatedCount ?? 0;
    if (updatedCount === 0) {
      setFormError('No records were updated. They may no longer be visible to you.');
      return;
    }
    if (payload?.requestTruncated && payload?.cap) {
      window.alert(
        `Only the first ${payload.cap} selected records were processed in this bulk action. Narrow your selection or run the action again on the remaining records.`
      );
    }
    onSuccess?.(payload);
    onClose();
  };

  const n = selectedIds?.length ?? 0;
  const title = `Add tags to ${n} selected ${recordLabel}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!bulkMut.loading && !jobQueueing) onClose();
      }}
      title={title}
      closeOnEscape={!bulkMut.loading && !jobQueueing}
      footer={
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} disabled={bulkMut.loading || jobQueueing}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={bulkMut.loading || jobQueueing || tagsLoading || n === 0}>
            {bulkMut.loading || jobQueueing ? 'Applying…' : 'Apply tags'}
          </Button>
        </ModalFooter>
      }
    >
      <div className={styles.body}>
        {formError ? <Alert variant="error">{formError}</Alert> : null}
        {loadError ? <Alert variant="error">{loadError}</Alert> : null}
        <p className={styles.desc}>
          Chosen tags are <strong>added</strong> to each selected record. Existing tags are kept. Tags are managed under
          Settings → Contact tags.
        </p>
        {tagsLoading ? (
          <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : tagOptions.length === 0 && !loadError ? (
          <Alert variant="warning">No tags in your catalog yet. Create tags under Settings → Contact tags.</Alert>
        ) : (
          <>
            {chosenTagIds.length === 0 ? (
              <p className={styles.desc} style={{ marginTop: 0 }}>
                No tags in this batch yet — pick from the list below.
              </p>
            ) : null}
            <div className={styles.tagChips} role="list">
              {chosenTagIds.map((tid) => {
                const label = tagOptions.find((o) => o.value === String(tid))?.label || tid;
                return (
                  <span key={tid} className={styles.tagChip} role="listitem">
                    <span className={styles.tagChipLabel}>{label}</span>
                    <button
                      type="button"
                      className={styles.tagRemove}
                      onClick={() => setChosenTagIds((prev) => prev.filter((x) => Number(x) !== Number(tid)))}
                      aria-label={`Remove ${label}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
            <SelectOncePick
              className={styles.tagAddSelect}
              ariaLabel="Add tag to batch"
              disabled={tagOptions.length === 0}
              options={tagOptions}
              excludeValues={chosenTagIds.map(String)}
              onPick={(e) => {
                const v = e.target.value;
                if (!v) return;
                const num = Number(v);
                if (!Number.isFinite(num)) return;
                setChosenTagIds((prev) => (prev.includes(num) ? prev : [...prev, num]));
              }}
              placeholder="Add tag…"
            />
          </>
        )}
      </div>
    </Modal>
  );
}
