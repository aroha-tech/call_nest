import React from 'react';
import { Select } from '../../components/ui/Select';
import { MultiSelectDropdown } from '../../components/ui/MultiSelectDropdown';
import { Input } from '../../components/ui/Input';
import { DateTimePickerField } from '../../components/ui/DateTimePickerField';
import { Button } from '../../components/ui/Button';
import {
  CAMPAIGN_FILTER_PROPERTIES,
  OPERATOR_LABELS,
  additionalRule,
  coerceRuleForProperty,
  getEnumOptions,
  getPropertyMeta,
  isValidEmailForFilter,
  ruleNeedsValue,
} from './campaignFilterConfig';
import styles from './CampaignFilterBuilder.module.scss';

/** Same storage shape as `MultiSelectDropdown` (JSON array string) ↔ rule `value` string[]. */
function ruleMultiToJson(arr) {
  const list = Array.isArray(arr) ? arr.map(String).filter((x) => x !== '') : [];
  return list.length ? JSON.stringify(list) : '';
}

function jsonToRuleMulti(json) {
  if (json == null || json === '') return [];
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

/** Contact filter modal uses `MultiSelectDropdown`; reuse it here for identical UX. */
function FilterRuleMultiSelect({ options, value, onChange, placeholder, disabled }) {
  return (
    <MultiSelectDropdown
      value={ruleMultiToJson(value)}
      onChange={(json) => onChange(jsonToRuleMulti(json))}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

function RuleValue({
  rule,
  onPatch,
  statusOptions,
  tagOptions,
  managerOptions,
  agentOptions,
  campaignOptions,
}) {
  const meta = getPropertyMeta(rule.property);
  const op = rule.op;

  if (!ruleNeedsValue(op)) {
    return <span className={styles.valueHint}>—</span>;
  }

  if (op === 'in') {
    if (meta.valueType === 'enum') {
      const opts = getEnumOptions(rule.property);
      return (
        <FilterRuleMultiSelect
          options={opts}
          value={Array.isArray(rule.value) ? rule.value : []}
          onChange={(v) => onPatch({ value: v })}
          placeholder="All record types"
          disabled={!(opts && opts.length)}
        />
      );
    }
    if (meta.valueType === 'status') {
      return (
        <FilterRuleMultiSelect
          options={statusOptions}
          value={Array.isArray(rule.value) ? rule.value : []}
          onChange={(v) => onPatch({ value: v })}
          placeholder="All statuses"
          disabled={!(statusOptions && statusOptions.length)}
        />
      );
    }
    if (meta.valueType === 'manager') {
      return (
        <FilterRuleMultiSelect
          options={managerOptions}
          value={Array.isArray(rule.value) ? rule.value.map(String) : []}
          onChange={(v) => onPatch({ value: v.map((x) => String(x)) })}
          placeholder="All managers"
          disabled={!(managerOptions && managerOptions.length)}
        />
      );
    }
    if (meta.valueType === 'agent') {
      return (
        <FilterRuleMultiSelect
          options={agentOptions}
          value={Array.isArray(rule.value) ? rule.value.map(String) : []}
          onChange={(v) => onPatch({ value: v.map((x) => String(x)) })}
          placeholder="All agents"
          disabled={!(agentOptions && agentOptions.length)}
        />
      );
    }
    if (meta.valueType === 'campaign') {
      return (
        <FilterRuleMultiSelect
          options={campaignOptions}
          value={Array.isArray(rule.value) ? rule.value.map(String) : []}
          onChange={(v) => onPatch({ value: v.map((x) => String(x)) })}
          placeholder="All campaigns"
          disabled={!(campaignOptions && campaignOptions.length)}
        />
      );
    }
    if (meta.valueType === 'contact_tag') {
      const opts = tagOptions || [];
      return (
        <div className={styles.tagValueCol}>
          <FilterRuleMultiSelect
            options={opts}
            value={Array.isArray(rule.value) ? rule.value.map(String) : []}
            onChange={(v) => onPatch({ value: v.map((x) => String(x)) })}
            placeholder={opts.length ? 'Any tags' : 'No tags available'}
            disabled={!opts.length}
          />
          {!opts.length ? (
            <p className={styles.tagEmptyHint}>Create contact tags first, then refresh this page.</p>
          ) : null}
        </div>
      );
    }
  }

  if (meta.valueType === 'datetime') {
    return (
      <DateTimePickerField
        mode="datetime"
        value={rule.value || ''}
        onChange={(v) => onPatch({ value: v })}
        className={styles.valueInput}
        aria-label="Filter value"
      />
    );
  }

  if (meta.valueType === 'status' && op !== 'in') {
    return (
      <Select
        value={rule.value || ''}
        onChange={(e) => onPatch({ value: e.target.value })}
        options={statusOptions}
        placeholder="Select status…"
        className={styles.valueInput}
      />
    );
  }

  if (meta.valueType === 'enum') {
    const opts = getEnumOptions(rule.property);
    return (
      <Select
        value={rule.value || ''}
        onChange={(e) => onPatch({ value: e.target.value })}
        options={opts}
        placeholder="Select…"
        className={styles.valueInput}
      />
    );
  }

  if (meta.valueType === 'manager') {
    return (
      <Select
        value={rule.value != null && rule.value !== '' ? String(rule.value) : 'none'}
        onChange={(e) => onPatch({ value: e.target.value === 'none' ? null : e.target.value })}
        options={[{ value: 'none', label: 'No manager' }, ...managerOptions]}
        placeholder="Select…"
        className={styles.valueInput}
      />
    );
  }

  if (meta.valueType === 'agent') {
    return (
      <Select
        value={rule.value != null && rule.value !== '' ? String(rule.value) : 'none'}
        onChange={(e) => onPatch({ value: e.target.value === 'none' ? null : e.target.value })}
        options={[{ value: 'none', label: 'No agent' }, ...agentOptions]}
        placeholder="Select…"
        className={styles.valueInput}
      />
    );
  }

  if (meta.valueType === 'campaign') {
    return (
      <Select
        value={rule.value != null && rule.value !== '' ? String(rule.value) : 'none'}
        onChange={(e) => onPatch({ value: e.target.value === 'none' ? null : e.target.value })}
        options={[{ value: 'none', label: 'None' }, ...campaignOptions]}
        placeholder="Select…"
        className={styles.valueInput}
      />
    );
  }

  const emailStrict = meta.id === 'email' && (op === 'eq' || op === 'ne');
  const trimmedVal = String(rule.value || '').trim();
  const emailError =
    emailStrict && trimmedVal && !isValidEmailForFilter(trimmedVal)
      ? 'Enter a valid email address (e.g. name@example.com).'
      : undefined;

  return (
    <Input
      value={rule.value || ''}
      onChange={(e) => onPatch({ value: e.target.value })}
      placeholder={meta.id === 'email' ? 'name@example.com' : 'Value'}
      className={styles.valueInput}
      type={emailStrict ? 'email' : 'text'}
      error={emailError}
    />
  );
}

export function CampaignFilterBuilder({
  rules,
  onChange,
  statusOptions = [],
  tagOptions = [],
  managerOptions = [],
  agentOptions = [],
  campaignOptions = [],
}) {
  const setRow = (index, next) => {
    const copy = [...rules];
    copy[index] = next;
    onChange(copy);
  };

  const patchRow = (index, partial) => {
    const prev = rules[index];
    setRow(index, { ...prev, ...partial });
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <span className={styles.colProp}>Property</span>
        <span className={styles.colOp}>Operator</span>
        <span className={styles.colVal}>Value</span>
        <span className={styles.colAct} />
      </div>
      {rules.map((rule, index) => {
        const meta = getPropertyMeta(rule.property);
        const opOptions = meta.operators.map((op) => ({ value: op, label: OPERATOR_LABELS[op] || op }));
        return (
          <div key={index} className={styles.row}>
            <Select
                value={rule.property}
                onChange={(e) => {
                  const next = coerceRuleForProperty(e.target.value, rule);
                  setRow(index, next);
                }}
                options={CAMPAIGN_FILTER_PROPERTIES.map((p) => ({
                  value: p.id,
                  label: p.label,
                  isDisabled: p.id !== rule.property && rules.some((r, j) => j !== index && r.property === p.id),
                }))}
                className={styles.colProp}
              />
              <Select
                value={rule.op}
                onChange={(e) => {
                  const op = e.target.value;
                  const base = { ...rule, op };
                  if (op === 'in') {
                    setRow(index, coerceRuleForProperty(rule.property, base));
                  } else {
                    setRow(index, coerceRuleForProperty(rule.property, { ...base, value: '' }));
                  }
                }}
                options={opOptions}
                className={styles.colOp}
              />
            <div className={styles.colVal}>
              <RuleValue
                rule={rule}
                onPatch={(partial) => patchRow(index, partial)}
                statusOptions={statusOptions}
                tagOptions={tagOptions}
                managerOptions={managerOptions}
                agentOptions={agentOptions}
                campaignOptions={campaignOptions}
              />
            </div>
            <div className={styles.colAct}>
              <button
                type="button"
                className={styles.removeRuleBtn}
                title="Remove rule"
                aria-label="Remove rule"
                disabled={rules.length <= 1}
                onClick={() => onChange(rules.filter((_, i) => i !== index))}
              >
                <span aria-hidden>×</span>
              </button>
            </div>
          </div>
        );
      })}
      <div className={styles.ruleToolbar}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!additionalRule(rules)}
          title={
            additionalRule(rules)
              ? 'Add another filter property'
              : 'Every available property is already used in a rule'
          }
          onClick={() => {
            const next = additionalRule(rules);
            if (next) onChange([...rules, next]);
          }}
        >
          + Add rule
        </Button>
      </div>
    </div>
  );
}
