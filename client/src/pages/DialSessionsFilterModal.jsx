import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { DateRangePresetControl } from '../components/ui/DateRangePresetControl';
import { TIME_RANGE_PRESET } from '../utils/dateRangePresets';
import styles from './CallHistoryFilterModal.module.scss';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ready', label: 'Ready' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function CountRangeRow({ label, minValue, maxValue, onChangeMin, onChangeMax }) {
  return (
    <div className={styles.countRangeRow}>
      <div className={styles.countRangeLabel}>{label}</div>
      <Input
        label="Min"
        type="number"
        min={0}
        step={1}
        value={minValue}
        onChange={(e) => onChangeMin(e.target.value)}
        placeholder="—"
      />
      <Input
        label="Max"
        type="number"
        min={0}
        step={1}
        value={maxValue}
        onChange={(e) => onChangeMax(e.target.value)}
        placeholder="—"
      />
    </div>
  );
}

export function DialSessionsFilterModal({
  isOpen,
  onClose,
  values,
  onApply,
  onReset,
  createdByOptions = [{ value: '', label: 'Anyone' }],
  showCreatedByFilter = false,
}) {
  const [draft, setDraft] = useState(values);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(values);
  }, [isOpen, values]);

  const fields = useMemo(() => draft || values, [draft, values]);

  const applyPayload = () => ({
    statusFilter: fields.statusFilter ?? '',
    providerFilter: fields.providerFilter ?? '',
    createdAfter: fields.createdAfter ?? '',
    createdBefore: fields.createdBefore ?? '',
    createdByUserId: fields.createdByUserId ?? '',
    scriptQ: fields.scriptQ ?? '',
    itemsMin: fields.itemsMin ?? '',
    itemsMax: fields.itemsMax ?? '',
    calledMin: fields.calledMin ?? '',
    calledMax: fields.calledMax ?? '',
    connectedMin: fields.connectedMin ?? '',
    connectedMax: fields.connectedMax ?? '',
    failedMin: fields.failedMin ?? '',
    failedMax: fields.failedMax ?? '',
    queuedMin: fields.queuedMin ?? '',
    queuedMax: fields.queuedMax ?? '',
    durationMin: fields.durationMin ?? '',
    durationMax: fields.durationMax ?? '',
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Filters"
      size="lg"
      closeOnOverlay
      closeOnEscape
      footer={
        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onReset?.();
              onClose();
            }}
          >
            Clear & close
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onApply?.(applyPayload());
              onClose();
            }}
          >
            Apply
          </Button>
        </ModalFooter>
      }
    >
      <div className={styles.root}>
        <p className={styles.sectionLabel}>Session</p>
        <div className={styles.criteriaGrid}>
          <Select
            label="Status"
            value={fields.statusFilter ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, statusFilter: e.target.value }))}
            options={STATUS_OPTIONS}
          />
          <Input
            label="Provider"
            value={fields.providerFilter ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, providerFilter: e.target.value }))}
            placeholder="e.g. dummy"
          />
          {showCreatedByFilter ? (
            <Select
              label="Created by"
              value={fields.createdByUserId ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, createdByUserId: e.target.value }))}
              options={createdByOptions}
            />
          ) : (
            <div className={styles.gridPad} aria-hidden />
          )}
        </div>
        <Input
          label="Script name contains"
          value={fields.scriptQ ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, scriptQ: e.target.value }))}
          placeholder="Partial name…"
        />

        <p className={styles.sectionLabel}>Created</p>
        <DateRangePresetControl
          variant="datetime"
          startLabel="Created after"
          endLabel="Created before"
          preset={fields.timeRangePreset ?? TIME_RANGE_PRESET.ALL_TIME}
          onPresetChange={(v) => setDraft((d) => ({ ...d, timeRangePreset: v }))}
          customStart={fields.customCreatedAfter ?? ''}
          customEnd={fields.customCreatedBefore ?? ''}
          onCustomStartChange={(v) => setDraft((d) => ({ ...d, customCreatedAfter: v }))}
          onCustomEndChange={(v) => setDraft((d) => ({ ...d, customCreatedBefore: v }))}
        />

        <p className={styles.sectionLabel}>Queue counts (min / max per session)</p>
        <div className={styles.countRangesGrid}>
          <CountRangeRow
            label="Total contacts"
            minValue={fields.itemsMin ?? ''}
            maxValue={fields.itemsMax ?? ''}
            onChangeMin={(v) => setDraft((d) => ({ ...d, itemsMin: v }))}
            onChangeMax={(v) => setDraft((d) => ({ ...d, itemsMax: v }))}
          />
          <CountRangeRow
            label="Called"
            minValue={fields.calledMin ?? ''}
            maxValue={fields.calledMax ?? ''}
            onChangeMin={(v) => setDraft((d) => ({ ...d, calledMin: v }))}
            onChangeMax={(v) => setDraft((d) => ({ ...d, calledMax: v }))}
          />
          <CountRangeRow
            label="Connected"
            minValue={fields.connectedMin ?? ''}
            maxValue={fields.connectedMax ?? ''}
            onChangeMin={(v) => setDraft((d) => ({ ...d, connectedMin: v }))}
            onChangeMax={(v) => setDraft((d) => ({ ...d, connectedMax: v }))}
          />
          <CountRangeRow
            label="Failed"
            minValue={fields.failedMin ?? ''}
            maxValue={fields.failedMax ?? ''}
            onChangeMin={(v) => setDraft((d) => ({ ...d, failedMin: v }))}
            onChangeMax={(v) => setDraft((d) => ({ ...d, failedMax: v }))}
          />
          <CountRangeRow
            label="Queued left"
            minValue={fields.queuedMin ?? ''}
            maxValue={fields.queuedMax ?? ''}
            onChangeMin={(v) => setDraft((d) => ({ ...d, queuedMin: v }))}
            onChangeMax={(v) => setDraft((d) => ({ ...d, queuedMax: v }))}
          />
        </div>

        <p className={styles.sectionLabel}>Session time (wall seconds, excludes paused time)</p>
        <div className={styles.dateGrid}>
          <Input
            label="Min seconds"
            type="number"
            min={0}
            step={1}
            value={fields.durationMin ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, durationMin: e.target.value }))}
            placeholder="—"
          />
          <Input
            label="Max seconds"
            type="number"
            min={0}
            step={1}
            value={fields.durationMax ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, durationMax: e.target.value }))}
            placeholder="—"
          />
        </div>
      </div>
    </Modal>
  );
}
