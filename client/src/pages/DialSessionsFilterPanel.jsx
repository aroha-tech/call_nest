import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { DateRangePresetControl } from '../components/ui/DateRangePresetControl';
import { TIME_RANGE_PRESET } from '../utils/dateRangePresets';
import { IconFilter } from '../features/contacts/ListActionsMenuIcons';
import filterStyles from './CallHistoryFilterModal.module.scss';
import styles from './DialSessionsFilterPanel.module.scss';

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
    <div className={filterStyles.countRangeRow}>
      <div className={filterStyles.countRangeLabel}>{label}</div>
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

function buildApplyPayload(fields) {
  return {
    statusFilter: fields.statusFilter ?? '',
    providerFilter: fields.providerFilter ?? '',
    timeRangePreset: fields.timeRangePreset ?? TIME_RANGE_PRESET.ALL_TIME,
    customCreatedAfter: fields.customCreatedAfter ?? '',
    customCreatedBefore: fields.customCreatedBefore ?? '',
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
  };
}

export function DialSessionsFilterPanel({
  values,
  onApply,
  onResetAll,
  createdByOptions = [{ value: '', label: 'Anyone' }],
  showCreatedByFilter = false,
  suppressHeading = false,
}) {
  const [draft, setDraft] = useState(values);

  useEffect(() => {
    setDraft(values);
  }, [values]);

  const fields = useMemo(() => draft || values, [draft, values]);

  return (
    <div className={styles.panel}>
      {suppressHeading ? null : (
        <h2 className={styles.heading}>
          <IconFilter />
          Filters
        </h2>
      )}

      <div className={filterStyles.root}>
        <p className={filterStyles.sectionLabel}>Session</p>
        <div className={filterStyles.criteriaGrid}>
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
            <div className={filterStyles.gridPad} aria-hidden />
          )}
        </div>
        <Input
          label="Script name contains"
          value={fields.scriptQ ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, scriptQ: e.target.value }))}
          placeholder="Partial name…"
        />

        <p className={filterStyles.sectionLabel}>Created</p>
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

        <p className={filterStyles.sectionLabel}>Queue counts (min / max per session)</p>
        <div className={filterStyles.countRangesGrid}>
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

        <p className={filterStyles.sectionLabel}>Session time (wall seconds, excludes paused time)</p>
        <div className={filterStyles.dateGrid}>
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

      <div className={styles.footer}>
        <Button type="button" variant="secondary" size="sm" onClick={() => onResetAll?.()}>
          Reset all
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => onApply?.(buildApplyPayload(fields))}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}
