import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SlidePanel } from '../../components/ui/SlidePanel';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { ModalFooter } from '../../components/ui/Modal';
import { IconButton } from '../../components/ui/IconButton';
import { TrashIcon } from '../../components/ui/ActionIcons';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
import { dealsAPI } from '../../services/dealsAPI';
import { useToast } from '../../context/ToastContext';
import { DEAL_CURRENCY_OPTIONS, DEFAULT_DEAL_CURRENCY, WIZARD_DEFAULT_STAGES } from './dealUiConstants';
import { parseProgressOutcome, STAGE_PROGRESS_OUTCOME_OPTIONS } from './dealStageOutcome';
import styles from './DealPipelineWizard.module.scss';

function newStageKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `st-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sumOpenProgressPercent(stages) {
  let sum = 0;
  for (const s of stages) {
    const po = parseProgressOutcome(s.progressOutcome);
    if (!po.is_closed_won && !po.is_closed_lost) sum += po.progression_percent;
  }
  return Math.round(sum * 100) / 100;
}

export function DealPipelineWizard({ isOpen, onClose, onSaved, ownerOptions, defaultOwnerId }) {
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [probabilityMode, setProbabilityMode] = useState('custom');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalDeals, setGoalDeals] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [isActive, setIsActive] = useState(true);
  const [stages, setStages] = useState(WIZARD_DEFAULT_STAGES);

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setName('');
    setDescription('');
    setOwnerId(defaultOwnerId != null ? String(defaultOwnerId) : '');
    setCurrency(DEFAULT_DEAL_CURRENCY);
    setProbabilityMode('custom');
    setGoalAmount('');
    setGoalDeals('');
    setVisibility('private');
    setIsActive(true);
    setStages(WIZARD_DEFAULT_STAGES());
  }, [isOpen, defaultOwnerId]);

  const openPct = useMemo(() => sumOpenProgressPercent(stages), [stages]);
  /** Standard: fill = % toward 100. Custom >100: green = first 100 points of sum, purple = rest. */
  const ringBackground = useMemo(() => {
    const pct = Math.max(0, openPct);
    if (probabilityMode === 'stage' || (probabilityMode === 'custom' && pct <= 100)) {
      const fill = Math.min(100, pct);
      return `conic-gradient(#22c55e ${fill}%, #e2e8f0 0)`;
    }
    const greenStop = (100 / pct) * 100;
    return `conic-gradient(#22c55e 0% ${greenStop}%, #a78bfa ${greenStop}% 100%)`;
  }, [openPct, probabilityMode]);

  const ringSubLabel = probabilityMode === 'custom' ? 'Open sum' : 'Open';

  const ownerSelectOptions = useMemo(
    () => ownerOptions.map((o) => ({ value: o.value, label: o.label })),
    [ownerOptions]
  );

  const goNext = useCallback(() => {
    if (!String(name || '').trim()) {
      showToast('Pipeline name is required', 'warning');
      return;
    }
    if (probabilityMode === 'stage' && Math.abs(openPct - 100) > 0.05) {
      showToast('Open stage probabilities must total 100% (standard mode)', 'warning');
      return;
    }
    setStep(2);
  }, [name, openPct, probabilityMode, showToast]);

  const handleSave = useCallback(async () => {
    if (probabilityMode === 'stage' && Math.abs(openPct - 100) > 0.05) {
      showToast('Open stage probabilities must total 100%', 'warning');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        is_active: isActive,
        owner_user_id: ownerId ? Number(ownerId) : null,
        currency_code: currency,
        probability_mode: probabilityMode,
        goal_amount: goalAmount === '' ? null : Number(goalAmount),
        goal_deals: goalDeals === '' ? null : Number(goalDeals),
        visibility,
        stages: stages.map((s) => {
          const po = parseProgressOutcome(s.progressOutcome);
          return {
            name: s.name.trim(),
            progression_percent: po.progression_percent,
            is_closed_won: po.is_closed_won,
            is_closed_lost: po.is_closed_lost,
            color_hex: s.color_hex || null,
          };
        }),
      };
      if (body.stages.some((s) => !s.name)) {
        showToast('Each stage needs a name', 'warning');
        return;
      }
      const res = await dealsAPI.create(body);
      showToast('Pipeline saved', 'success');
      onSaved?.(res?.data?.data);
      onClose();
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    currency,
    description,
    goalAmount,
    goalDeals,
    isActive,
    name,
    onClose,
    onSaved,
    openPct,
    ownerId,
    probabilityMode,
    showToast,
    stages,
    visibility,
  ]);

  const addStage = () => {
    setStages((prev) => [
      ...prev,
      {
        key: newStageKey(),
        name: 'New stage',
        progression_percent: 10,
        progressOutcome: '10|open',
        color_hex: '#64748B',
      },
    ]);
  };

  const removeStage = (key) => {
    setStages((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)));
  };

  const handleStageDragStart = (e, key) => {
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleStageDrop = (e, targetKey) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw || raw === targetKey) return;
    setStages((prev) => {
      const order = [...prev];
      const from = order.findIndex((s) => s.key === raw);
      const to = order.findIndex((s) => s.key === targetKey);
      if (from < 0 || to < 0) return prev;
      const [moved] = order.splice(from, 1);
      order.splice(to, 0, moved);
      return order;
    });
  };

  if (!isOpen) return null;

  return (
    <SlidePanel
      isOpen
      size="wide"
      title={step === 1 ? 'New Pipeline' : 'Add stages'}
      titleHint={
        step === 1
          ? 'Build your sales pipeline and define stages to track deals effectively.'
          : 'Create and arrange stages to match your sales process.'
      }
      onClose={() => !saving && onClose()}
      closeOnOverlay={!saving}
      closeOnEscape={!saving}
    >
      <div className={styles.wizardBody}>
        <div className={styles.stepper} role="tablist" aria-label="Pipeline wizard steps">
          <div
            className={`${styles.stepTab} ${step === 1 ? styles.stepTabActive : ''} ${step > 1 ? styles.stepTabClickable : ''}`}
            role="tab"
            aria-selected={step === 1}
            onClick={() => step > 1 && !saving && setStep(1)}
            onKeyDown={(e) => e.key === 'Enter' && step > 1 && !saving && setStep(1)}
          >
            <span className={styles.stepCircle}>1</span>
            <span className={styles.stepLabel}>Pipeline details</span>
            <span className={styles.stepHint}>Name, goals, visibility</span>
          </div>
          <div
            className={`${styles.stepTab} ${step === 2 ? styles.stepTabActive : ''}`}
            role="tab"
            aria-selected={step === 2}
          >
            <span className={styles.stepCircle}>2</span>
            <span className={styles.stepLabel}>Add stages</span>
            <span className={styles.stepHint}>Probability & colors</span>
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className={styles.grid2}>
              <Input
                label="Pipeline name"
                required
                placeholder="e.g. Enterprise Sales"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Select
                label="Pipeline owner"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                options={ownerSelectOptions}
                placeholder="Select owner"
              />
              <div className={styles.fullRow}>
                <label className={styles.sectionLabel} htmlFor="pipe-desc">
                  Description (optional)
                </label>
                <textarea
                  id="pipe-desc"
                  className={styles.textarea}
                  rows={3}
                  maxLength={300}
                  placeholder="Describe the purpose of this pipeline and how it will be used."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className={styles.textareaFooter}>
                  {(description || '').length}/300
                </div>
              </div>
              <Select
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={DEAL_CURRENCY_OPTIONS}
              />
            </div>

            <div>
              <div className={styles.sectionLabel}>Deal probability</div>
              <div className={styles.radioGroup}>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="prob-mode"
                    checked={probabilityMode === 'stage'}
                    onChange={() => setProbabilityMode('stage')}
                  />
                  <span>
                    <strong>Standard (default % per stage)</strong>
                    <div className={styles.visibilityDesc}>Forecast uses each stage’s probability; open stages should total 100%.</div>
                  </span>
                </label>
                <label className={styles.radioRow}>
                  <input
                    type="radio"
                    name="prob-mode"
                    checked={probabilityMode === 'custom'}
                    onChange={() => setProbabilityMode('custom')}
                  />
                  <span>
                    <strong>Custom (define your own %)</strong>
                    <div className={styles.visibilityDesc}>Per-deal probability can be set freely on each opportunity.</div>
                  </span>
                </label>
              </div>
            </div>

            <div>
              <div className={styles.sectionLabel}>Pipeline goals (optional)</div>
              <div className={styles.goalsGrid}>
                <Input
                  label="Goal amount"
                  type="number"
                  min={0}
                  step={0.01}
                  value={goalAmount}
                  onChange={(e) => setGoalAmount(e.target.value)}
                  placeholder="0.00"
                />
                <Input
                  label="Goal deals"
                  type="number"
                  min={0}
                  step={1}
                  value={goalDeals}
                  onChange={(e) => setGoalDeals(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <div className={styles.sectionLabel}>Visibility</div>
              <div className={styles.visibilityGrid}>
                <button
                  type="button"
                  className={`${styles.visibilityCard} ${visibility === 'private' ? styles.visibilityCardSelected : ''}`}
                  onClick={() => setVisibility('private')}
                >
                  <span className={styles.visibilityIcon} aria-hidden>
                    <MaterialSymbol name="lock" size="sm" />
                  </span>
                  <span className={styles.visibilityCopy}>
                    <span className={styles.visibilityTitle}>Private</span>
                    <span className={styles.visibilityDesc}>Only you and your team can view this pipeline.</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.visibilityCard} ${visibility === 'workspace' ? styles.visibilityCardSelected : ''}`}
                  onClick={() => setVisibility('workspace')}
                >
                  <span className={styles.visibilityIcon} aria-hidden>
                    <MaterialSymbol name="public" size="sm" />
                  </span>
                  <span className={styles.visibilityCopy}>
                    <span className={styles.visibilityTitle}>Workspace</span>
                    <span className={styles.visibilityDesc}>Visible to all users in your workspace.</span>
                  </span>
                </button>
              </div>
            </div>

            <Checkbox
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              label={
                <span className={styles.toggleCopy}>
                  <span className={styles.toggleTitle}>Active</span>
                  <span className={styles.toggleHint}>Active pipelines are available when adding deals.</span>
                </span>
              }
            />
          </>
        ) : (
          <>
            <div className={styles.backBar}>
              <button type="button" className={styles.backBtn} onClick={() => setStep(1)} aria-label="Back" disabled={saving}>
                <MaterialSymbol name="arrow_back" size="sm" />
              </button>
            </div>

            <div className={styles.stageList}>
              {stages.map((s, idx) => (
                <div
                  key={s.key}
                  className={styles.stageRow}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleStageDrop(e, s.key)}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className={styles.stageDrag}
                    draggable={!saving}
                    aria-label="Drag to reorder"
                    onDragStart={(e) => handleStageDragStart(e, s.key)}
                  >
                    <MaterialSymbol name="drag_indicator" size="sm" />
                  </div>
                  <div className={styles.stageIdx}>{idx + 1}</div>
                  <input
                    className={styles.stageNameInput}
                    value={s.name}
                    onChange={(e) =>
                      setStages((prev) =>
                        prev.map((row) => (row.key === s.key ? { ...row, name: e.target.value } : row))
                      )
                    }
                    aria-label={`Stage ${idx + 1} name`}
                  />
                  <Select
                    className={styles.stagePctSelect}
                    aria-label="Stage probability"
                    value={s.progressOutcome}
                    options={STAGE_PROGRESS_OUTCOME_OPTIONS}
                    onChange={(e) =>
                      setStages((prev) =>
                        prev.map((row) =>
                          row.key === s.key ? { ...row, progressOutcome: e.target.value } : row
                        )
                      )
                    }
                  />
                  <input
                    type="color"
                    className={styles.colorSwatch}
                    value={s.color_hex?.startsWith('#') ? s.color_hex : '#64748B'}
                    onChange={(e) =>
                      setStages((prev) =>
                        prev.map((row) => (row.key === s.key ? { ...row, color_hex: e.target.value } : row))
                      )
                    }
                    aria-label="Stage color"
                  />
                  <IconButton
                    size="sm"
                    variant="danger"
                    title="Remove stage"
                    disabled={stages.length <= 1}
                    onClick={() => removeStage(s.key)}
                  >
                    <TrashIcon />
                  </IconButton>
                </div>
              ))}
            </div>

            <button type="button" className={styles.addStageBtn} onClick={addStage} disabled={saving}>
              <MaterialSymbol name="add" size="sm" />
              Add stage
            </button>

            <div className={styles.probHintRow}>
              <MaterialSymbol name="info" size="sm" className={styles.visibilityIcon} />
              <p className={styles.probHintText}>
                Probability helps forecast sales. In standard mode, open stage percentages should total 100%. Custom mode
                lets open stages sum to more than 100% (e.g. 10+25+50+75=160%); the ring uses green for the first 100
                points and violet for the rest. Closed-won is typically 100% won.
              </p>
              <div className={styles.probRing} style={{ background: ringBackground }}>
                <div className={styles.probRingInner}>
                  <span className={styles.probRingPct}>{openPct}%</span>
                  <span className={styles.probRingLabel}>{ringSubLabel}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <ModalFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
          <MaterialSymbol name="close" size="sm" style={{ marginRight: 6, color: 'var(--color-text-secondary, #64748b)' }} />
          Cancel
        </Button>
        {step === 1 ? (
          <Button type="button" variant="primary" onClick={goNext}>
            Next: Add stages
            <MaterialSymbol name="arrow_forward" size="sm" style={{ marginLeft: 6 }} />
          </Button>
        ) : (
          <Button type="button" variant="primary" loading={saving} onClick={handleSave}>
            <MaterialSymbol name="check_circle" size="sm" style={{ marginRight: 6 }} />
            Save pipeline
          </Button>
        )}
      </ModalFooter>
    </SlidePanel>
  );
}
