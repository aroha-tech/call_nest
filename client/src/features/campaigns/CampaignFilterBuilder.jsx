import React from 'react';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import {
  CAMPAIGN_FILTER_PROPERTIES,
  OPERATOR_LABELS,
  coerceRuleForProperty,
  defaultRule,
  getEnumOptions,
  getPropertyMeta,
  ruleNeedsValue,
} from './campaignFilterConfig';
import styles from './CampaignFilterBuilder.module.scss';

function MultiIdPicker({ options, value, onChange, placeholder }) {
  const arr = Array.isArray(value) ? value : [];
  const add = (v) => {
    if (!v || arr.includes(v)) return;
    onChange([...arr, v]);
  };
  const remove = (v) => onChange(arr.filter((x) => x !== v));

  return (
    <div className={styles.multiWrap}>
      <div className={styles.chips}>
        {arr.map((id) => {
          const label = options.find((o) => String(o.value) === String(id))?.label || '—';
          return (
            <span key={id} className={styles.chip}>
              {label}
              <button type="button" className={styles.chipX} onClick={() => remove(id)} aria-label="Remove">
                ×
              </button>
            </span>
          );
        })}
      </div>
      <select
        className={styles.addSelect}
        value=""
        onChange={(e) => {
          add(e.target.value);
          e.target.value = '';
        }}
      >
        <option value="">{placeholder || 'Add…'}</option>
        {options
          .filter((o) => !arr.includes(String(o.value)))
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
    </div>
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
        <MultiIdPicker
          options={opts}
          value={Array.isArray(rule.value) ? rule.value : []}
          onChange={(v) => onPatch({ value: v })}
          placeholder="Add value…"
        />
      );
    }
    if (meta.valueType === 'status') {
      return (
        <MultiIdPicker
          options={statusOptions}
          value={Array.isArray(rule.value) ? rule.value : []}
          onChange={(v) => onPatch({ value: v })}
          placeholder="Add status…"
        />
      );
    }
    if (meta.valueType === 'manager') {
      return (
        <MultiIdPicker
          options={managerOptions}
          value={Array.isArray(rule.value) ? rule.value.map(String) : []}
          onChange={(v) => onPatch({ value: v.map((x) => String(x)) })}
          placeholder="Add manager…"
        />
      );
    }
    if (meta.valueType === 'agent') {
      return (
        <MultiIdPicker
          options={agentOptions}
          value={Array.isArray(rule.value) ? rule.value.map(String) : []}
          onChange={(v) => onPatch({ value: v.map((x) => String(x)) })}
          placeholder="Add agent…"
        />
      );
    }
    if (meta.valueType === 'campaign') {
      return (
        <MultiIdPicker
          options={campaignOptions}
          value={Array.isArray(rule.value) ? rule.value.map(String) : []}
          onChange={(v) => onPatch({ value: v.map((x) => String(x)) })}
          placeholder="Add campaign…"
        />
      );
    }
    if (meta.valueType === 'contact_tag') {
      return (
        <MultiIdPicker
          options={tagOptions || []}
          value={Array.isArray(rule.value) ? rule.value.map(String) : []}
          onChange={(v) => onPatch({ value: v.map((x) => String(x)) })}
          placeholder="Add tag…"
        />
      );
    }
  }

  if (meta.valueType === 'datetime') {
    return (
      <Input
        type="datetime-local"
        value={rule.value || ''}
        onChange={(e) => onPatch({ value: e.target.value })}
        className={styles.valueInput}
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

  return (
    <Input
      value={rule.value || ''}
      onChange={(e) => onPatch({ value: e.target.value })}
      placeholder="Value"
      className={styles.valueInput}
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
      <p className={styles.hint}>
        All rules apply together (AND). Tag uses &quot;Is any of&quot; to match contacts that have at least one of the selected tags.
      </p>
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
              options={CAMPAIGN_FILTER_PROPERTIES.map((p) => ({ value: p.id, label: p.label }))}
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="Remove rule"
                onClick={() => onChange(rules.filter((_, i) => i !== index))}
              >
                🗑
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onChange([...rules, defaultRule()])}
      >
        + Add rule
      </Button>
    </div>
  );
}
