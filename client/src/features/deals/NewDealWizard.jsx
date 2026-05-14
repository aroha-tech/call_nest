import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SlidePanel } from '../../components/ui/SlidePanel';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { ModalFooter } from '../../components/ui/Modal';
import { DateTimePickerField } from '../../components/ui/DateTimePickerField';
import { MaterialSymbol } from '../../components/ui/MaterialSymbol';
import { ContactLeadPickerModal } from '../../components/crm/ContactLeadPickerModal';
import { opportunitiesAPI } from '../../services/opportunitiesAPI';
import { contactsAPI } from '../../services/contactsAPI';
import { campaignsAPI } from '../../services/campaignsAPI';
import { useToast } from '../../context/ToastContext';
import { DEAL_CURRENCY_OPTIONS, DEAL_VALUE_TYPE_OPTIONS, DEFAULT_DEAL_CURRENCY } from './dealUiConstants';
import styles from './DealPipelineWizard.module.scss';
import dealFormStyles from './NewDealWizard.module.scss';

const DRAFT_OPP_STORAGE_KEY = 'callxtime_deal_draft_opp_id';

function tagsRowToInput(row) {
  const raw = row?.tags_json;
  if (raw == null || raw === '') return '';
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean).join(', ');
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map((t) => String(t).trim()).filter(Boolean).join(', ');
    } catch {
      /* ignore */
    }
    return raw;
  }
  return '';
}

export function NewDealWizard({
  isOpen,
  onClose,
  pipelineOptions,
  deals,
  ownerOptions,
  defaultOwnerId,
  defaultDealId,
  onCreated,
}) {
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [serverDraftOppId, setServerDraftOppId] = useState(null);
  const [draftAnchor, setDraftAnchor] = useState(null);
  const [dealId, setDealId] = useState('');
  const [stageId, setStageId] = useState('');
  const [contactType, setContactType] = useState('lead');
  const [contactId, setContactId] = useState('');
  const [selectedContactDetail, setSelectedContactDetail] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState('contact');
  const [formErrors, setFormErrors] = useState({});
  const [ownerId, setOwnerId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [amountCurrency, setAmountCurrency] = useState(DEFAULT_DEAL_CURRENCY);
  const [valueType, setValueType] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [dealType, setDealType] = useState('');
  const [probability, setProbability] = useState('');
  const [priority, setPriority] = useState('medium');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [createAnother, setCreateAnother] = useState(false);
  const [nextStep, setNextStep] = useState('');
  const [leadSource, setLeadSource] = useState('');
  const [expectedRevenue, setExpectedRevenue] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [campaignOptions, setCampaignOptions] = useState([{ value: '', label: 'None' }]);

  const selectedDeal = useMemo(() => deals.find((d) => String(d.id) === String(dealId)), [deals, dealId]);

  const stageOptions = useMemo(() => {
    const stages = selectedDeal?.stages || [];
    return stages.map((s) => ({
      value: String(s.id),
      label: `${s.name} (${Number(s.progression_percent) || 0}%)`,
    }));
  }, [selectedDeal]);

  const resetFormToDefaults = useCallback(() => {
    setStep(1);
    const initialDeal = defaultDealId != null ? String(defaultDealId) : '';
    setDealId(initialDeal);
    setStageId('');
    setContactType('lead');
    setContactId('');
    setSelectedContactDetail(null);
    setFormErrors({});
    setPickerOpen(false);
    setOwnerId(defaultOwnerId != null ? String(defaultOwnerId) : '');
    setTitle('');
    setAmount('');
    setAmountCurrency('USD');
    setValueType('');
    setClosingDate('');
    setDealType('');
    setProbability('');
    setPriority('medium');
    setDescription('');
    setTags('');
    setCreateAnother(false);
    setNextStep('');
    setLeadSource('');
    setExpectedRevenue('');
    setCampaignId('');
    setServerDraftOppId(null);
    setDraftAnchor(null);
  }, [defaultDealId, defaultOwnerId]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setHydrating(true);
    (async () => {
      const storedId = sessionStorage.getItem(DRAFT_OPP_STORAGE_KEY);
      if (storedId) {
        try {
          const res = await opportunitiesAPI.getById(storedId);
          const row = res?.data?.data;
          if (cancelled) return;
          if (row && Number(row.is_draft) === 1) {
            setServerDraftOppId(String(row.id));
            setDraftAnchor({ contactId: String(row.contact_id), dealId: String(row.deal_id) });
            setDealId(String(row.deal_id));
            setStageId(String(row.stage_id));
            const ct = row.contact_source_type === 'contact' ? 'contact' : 'lead';
            setContactType(ct);
            setContactId(String(row.contact_id));
            setOwnerId(row.owner_id != null ? String(row.owner_id) : defaultOwnerId != null ? String(defaultOwnerId) : '');
            setTitle(row.title || '');
            setAmount(row.amount != null && row.amount !== '' ? String(row.amount) : '');
            setAmountCurrency(String(row.amount_currency || DEFAULT_DEAL_CURRENCY).toUpperCase());
            setValueType(row.value_type || '');
            setClosingDate(row.closing_date ? String(row.closing_date).slice(0, 10) : '');
            setDealType(row.deal_type || '');
            setProbability(row.probability_percent != null && row.probability_percent !== '' ? String(row.probability_percent) : '');
            setPriority(row.priority || 'medium');
            setDescription(row.description || '');
            setTags(tagsRowToInput(row));
            setNextStep(row.next_step || '');
            setLeadSource(row.lead_source || '');
            setExpectedRevenue(row.expected_revenue != null && row.expected_revenue !== '' ? String(row.expected_revenue) : '');
            setCampaignId(row.campaign_id != null ? String(row.campaign_id) : '');
            setStep(1);
            try {
              const cr = await contactsAPI.getById(row.contact_id);
              const c = cr?.data?.data;
              if (!cancelled && c) setSelectedContactDetail(c);
            } catch {
              if (!cancelled) setSelectedContactDetail(null);
            }
            setHydrating(false);
            return;
          }
        } catch {
          /* fall through */
        }
        sessionStorage.removeItem(DRAFT_OPP_STORAGE_KEY);
      }
      if (cancelled) return;
      resetFormToDefaults();
      setHydrating(false);
    })();
    return () => {
      cancelled = true;
      setHydrating(false);
    };
  }, [isOpen, resetFormToDefaults, defaultOwnerId]);

  useEffect(() => {
    if (!serverDraftOppId || !draftAnchor) return;
    if (String(contactId) !== String(draftAnchor.contactId) || String(dealId) !== String(draftAnchor.dealId)) {
      sessionStorage.removeItem(DRAFT_OPP_STORAGE_KEY);
      setServerDraftOppId(null);
      setDraftAnchor(null);
    }
  }, [contactId, dealId, serverDraftOppId, draftAnchor]);

  useEffect(() => {
    if (!selectedDeal?.stages?.length) {
      setStageId('');
      return;
    }
    setStageId((prev) => {
      if (prev && selectedDeal.stages.some((s) => String(s.id) === String(prev))) return prev;
      return String(selectedDeal.stages[0].id);
    });
  }, [selectedDeal]);

  useEffect(() => {
    if (!selectedDeal || serverDraftOppId) return;
    setAmountCurrency((selectedDeal.currency_code || DEFAULT_DEAL_CURRENCY).toUpperCase());
  }, [selectedDeal?.id, serverDraftOppId, selectedDeal]);

  useEffect(() => {
    if (!isOpen || !contactId) {
      if (!contactId) setSelectedContactDetail(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const cr = await contactsAPI.getById(contactId);
        if (!cancelled) setSelectedContactDetail(cr?.data?.data ?? null);
      } catch {
        if (!cancelled) setSelectedContactDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, contactId]);

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || step !== 2) return undefined;
    (async () => {
      try {
        const res = await campaignsAPI.list({ page: 1, limit: 100, include_archived: false });
        if (cancelled) return;
        const rows = res?.data?.data ?? [];
        setCampaignOptions([
          { value: '', label: 'None' },
          ...rows.map((c) => ({ value: String(c.id), label: c.name || `Campaign #${c.id}` })),
        ]);
      } catch {
        if (!cancelled) setCampaignOptions([{ value: '', label: 'None' }]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, step]);

  const validateStep1 = useCallback(() => {
    const e = {};
    if (!dealId) e.dealId = 'Choose a pipeline';
    if (!stageId) e.stageId = 'Choose a stage';
    if (!contactId) e.contact = 'Pick a contact or lead';
    if (!ownerId) e.ownerId = 'Choose a deal owner';
    if (!String(title || '').trim()) e.title = 'Deal name is required';
    if (amount !== '' && Number.isNaN(Number(amount))) e.amount = 'Amount must be a valid number';
    if (probability !== '') {
      const p = Number(probability);
      if (Number.isNaN(p) || p < 0 || p > 100) e.probability = 'Probability must be between 0 and 100';
    }
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }, [amount, contactId, dealId, ownerId, probability, stageId, title]);

  const goNext = useCallback(() => {
    if (!validateStep1()) {
      showToast('Please fix the highlighted fields', 'warning');
      return;
    }
    setStep(2);
  }, [showToast, validateStep1]);

  const buildOppPayload = useCallback(
    (isDraft) => {
      const tagList = tags
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
      return {
        contact_id: Number(contactId),
        deal_id: Number(dealId),
        stage_id: Number(stageId),
        owner_id: ownerId ? Number(ownerId) : null,
        title: title.trim() || null,
        amount: amount === '' ? null : Number(amount),
        amount_currency: amountCurrency || null,
        value_type: valueType || null,
        closing_date: closingDate ? closingDate.slice(0, 10) : null,
        deal_type: dealType.trim() || null,
        probability_percent: probability === '' ? null : Number(probability),
        priority: priority || null,
        description: description.trim() || null,
        tags: tagList.length ? tagList : undefined,
        next_step: nextStep.trim() || null,
        lead_source: leadSource.trim() || null,
        expected_revenue: expectedRevenue === '' ? null : Number(expectedRevenue),
        campaign_id: campaignId ? Number(campaignId) : null,
        is_draft: isDraft,
      };
    },
    [
      amount,
      amountCurrency,
      campaignId,
      closingDate,
      contactId,
      dealId,
      dealType,
      description,
      expectedRevenue,
      leadSource,
      nextStep,
      ownerId,
      priority,
      probability,
      stageId,
      tags,
      title,
      valueType,
    ]
  );

  const saveDraft = useCallback(async () => {
    if (!dealId || !contactId) {
      showToast('Select a pipeline and contact to save a draft', 'warning');
      return;
    }
    if (!stageId) {
      showToast('Select a stage', 'warning');
      return;
    }
    setSaving(true);
    try {
      const body = buildOppPayload(true);
      if (serverDraftOppId) {
        await opportunitiesAPI.update(serverDraftOppId, body);
      } else {
        const res = await opportunitiesAPI.create(body);
        const created = res?.data?.data;
        const id = created?.id;
        if (id) {
          const sid = String(id);
          setServerDraftOppId(sid);
          setDraftAnchor({ contactId: String(contactId), dealId: String(dealId) });
          sessionStorage.setItem(DRAFT_OPP_STORAGE_KEY, sid);
        }
      }
      showToast('Draft saved', 'success');
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'error');
    } finally {
      setSaving(false);
    }
  }, [buildOppPayload, contactId, dealId, serverDraftOppId, showToast, stageId]);

  const submit = useCallback(async () => {
    const step1Err = {};
    if (!dealId) step1Err.dealId = 'Choose a pipeline';
    if (!stageId) step1Err.stageId = 'Choose a stage';
    if (!contactId) step1Err.contact = 'Pick a contact or lead';
    if (!ownerId) step1Err.ownerId = 'Choose a deal owner';
    if (!String(title || '').trim()) step1Err.title = 'Deal name is required';
    if (amount !== '' && Number.isNaN(Number(amount))) step1Err.amount = 'Amount must be a valid number';
    if (probability !== '') {
      const p = Number(probability);
      if (Number.isNaN(p) || p < 0 || p > 100) step1Err.probability = 'Probability must be between 0 and 100';
    }
    const step2Err = {};
    if (expectedRevenue !== '' && Number.isNaN(Number(expectedRevenue))) {
      step2Err.expectedRevenue = 'Expected revenue must be a valid number';
    }
    if (Object.keys(step1Err).length) {
      setFormErrors({ ...step1Err, ...step2Err });
      showToast('Please fix the highlighted fields', 'warning');
      setStep(1);
      return;
    }
    if (Object.keys(step2Err).length) {
      setFormErrors((prev) => ({ ...prev, ...step2Err }));
      showToast('Please fix the highlighted fields', 'warning');
      return;
    }
    setFormErrors({});
    setSaving(true);
    try {
      const tagList = tags
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean);
      const common = {
        contact_id: Number(contactId),
        deal_id: Number(dealId),
        stage_id: Number(stageId),
        owner_id: Number(ownerId),
        title: title.trim(),
        amount: amount === '' ? null : Number(amount),
        amount_currency: amountCurrency || null,
        value_type: valueType || null,
        closing_date: closingDate ? closingDate.slice(0, 10) : null,
        deal_type: dealType.trim() || null,
        probability_percent: probability === '' ? null : Number(probability),
        priority: priority || null,
        description: description.trim() || null,
        tags: tagList.length ? tagList : undefined,
        next_step: nextStep.trim() || null,
        lead_source: leadSource.trim() || null,
        expected_revenue: expectedRevenue === '' ? null : Number(expectedRevenue),
        campaign_id: campaignId ? Number(campaignId) : null,
      };
      if (serverDraftOppId) {
        await opportunitiesAPI.update(serverDraftOppId, { ...common, is_draft: false });
      } else {
        await opportunitiesAPI.create(common);
      }
      showToast('Deal created', 'success');
      sessionStorage.removeItem(DRAFT_OPP_STORAGE_KEY);
      setServerDraftOppId(null);
      setDraftAnchor(null);
      onCreated?.();
      if (createAnother) {
        setStep(1);
        setContactId('');
        setSelectedContactDetail(null);
        setFormErrors({});
        setTitle('');
        setAmount('');
        setDescription('');
        setTags('');
        setProbability('');
        setDealType('');
        setClosingDate('');
        setNextStep('');
        setLeadSource('');
        setExpectedRevenue('');
        setCampaignId('');
        setValueType('');
      } else {
        onClose();
      }
    } catch (e) {
      showToast(e.response?.data?.error || e.message, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    amount,
    amountCurrency,
    campaignId,
    closingDate,
    contactId,
    createAnother,
    dealId,
    dealType,
    description,
    expectedRevenue,
    leadSource,
    nextStep,
    onClose,
    onCreated,
    ownerId,
    priority,
    probability,
    serverDraftOppId,
    showToast,
    stageId,
    tags,
    title,
    valueType,
  ]);

  if (!isOpen) return null;

  return (
    <>
      <SlidePanel
        isOpen
        size="xlarge"
        title="New deal"
        titleHint="Create a new deal and add details to track progress."
        onClose={() => !saving && !hydrating && onClose()}
        closeOnOverlay={!saving && !hydrating}
        closeOnEscape={!saving && !hydrating}
      >
        <div className={`${styles.wizardBody} ${dealFormStyles.dealWizard}`}>
          <div className={dealFormStyles.wizardHeaderRow}>
            <Button type="button" variant="ghost" size="sm" onClick={saveDraft} disabled={saving || hydrating}>
              <MaterialSymbol name="bookmark_add" size="sm" style={{ marginRight: 6 }} />
              Save as draft
            </Button>
          </div>

          <div className={styles.stepper} role="tablist">
            <div className={`${styles.stepTab} ${step === 1 ? styles.stepTabActive : ''}`} role="tab" aria-selected={step === 1}>
              <span className={styles.stepCircle}>1</span>
              <span className={styles.stepLabel}>Deal information</span>
            </div>
            <div className={`${styles.stepTab} ${step === 2 ? styles.stepTabActive : ''}`} role="tab" aria-selected={step === 2}>
              <span className={styles.stepCircle}>2</span>
              <span className={styles.stepLabel}>Additional details</span>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div className={styles.grid2}>
                <Select
                  label="Pipeline"
                  required
                  value={dealId}
                  error={formErrors.dealId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDealId(v);
                    setFormErrors((prev) => ({ ...prev, dealId: undefined }));
                    const d = deals.find((x) => String(x.id) === String(v));
                    if (d?.currency_code) setAmountCurrency(String(d.currency_code).toUpperCase());
                  }}
                  options={[{ value: '', label: 'Choose pipeline' }, ...pipelineOptions]}
                  disabled={hydrating}
                />
                <Select
                  label="Stage"
                  required
                  value={stageId}
                  error={formErrors.stageId}
                  onChange={(e) => {
                    setStageId(e.target.value);
                    setFormErrors((prev) => ({ ...prev, stageId: undefined }));
                  }}
                  options={stageOptions}
                  placeholder={selectedDeal ? 'Choose stage' : 'Select a pipeline first'}
                />
                <div className={styles.fullRow}>
                  <div className={dealFormStyles.crmLinkLabel}>Link to CRM *</div>
                  <div className={dealFormStyles.pickBtnRow}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={hydrating}
                      onClick={() => {
                        setPickerKind('contact');
                        setPickerOpen(true);
                        setFormErrors((prev) => ({ ...prev, contact: undefined }));
                      }}
                    >
                      <MaterialSymbol name="contacts" size="sm" style={{ marginRight: 6, color: '#60a5fa' }} />
                      Pick contact
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={hydrating}
                      onClick={() => {
                        setPickerKind('lead');
                        setPickerOpen(true);
                        setFormErrors((prev) => ({ ...prev, contact: undefined }));
                      }}
                    >
                      <MaterialSymbol name="person_search" size="sm" style={{ marginRight: 6, color: '#34d399' }} />
                      Pick lead
                    </Button>
                    <Link
                      className={dealFormStyles.addContactLink}
                      to={contactType === 'lead' ? '/leads/new' : '/contacts/new'}
                      target="_blank"
                      rel="noreferrer"
                      title="Add record in new tab"
                    >
                      <MaterialSymbol name="person_add" size="sm" />
                    </Link>
                  </div>
                  {contactId && selectedContactDetail ? (
                    <div className={dealFormStyles.entityCard}>
                      <div className={dealFormStyles.entityCardTitle}>
                        Selected {String(selectedContactDetail.type) === 'lead' ? 'lead' : 'contact'}
                      </div>
                      <div className={dealFormStyles.entityCardGrid}>
                        <div>
                          <div className={dealFormStyles.entityFieldLabel}>Name</div>
                          <div className={dealFormStyles.entityFieldValue}>
                            {selectedContactDetail.display_name || selectedContactDetail.first_name || '—'}
                          </div>
                        </div>
                        <div>
                          <div className={dealFormStyles.entityFieldLabel}>Email</div>
                          <div className={dealFormStyles.entityFieldValue}>{selectedContactDetail.email || '—'}</div>
                        </div>
                        <div>
                          <div className={dealFormStyles.entityFieldLabel}>Phone</div>
                          <div className={dealFormStyles.entityFieldValue}>{selectedContactDetail.primary_phone || '—'}</div>
                        </div>
                      </div>
                    </div>
                  ) : contactId ? (
                    <div className={dealFormStyles.entityCardMuted}>Loading contact…</div>
                  ) : null}
                  {formErrors.contact ? (
                    <p className={dealFormStyles.fieldError} role="alert">
                      {formErrors.contact}
                    </p>
                  ) : null}
                </div>
                <Select
                  label="Deal owner"
                  required
                  value={ownerId}
                  error={formErrors.ownerId}
                  onChange={(e) => {
                    setOwnerId(e.target.value);
                    setFormErrors((prev) => ({ ...prev, ownerId: undefined }));
                  }}
                  options={ownerOptions}
                  placeholder="Select owner"
                />
                <Input
                  label="Deal name"
                  required
                  placeholder="e.g. Acme - Enterprise plan"
                  value={title}
                  error={formErrors.title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setFormErrors((prev) => ({ ...prev, title: undefined }));
                  }}
                />
                <div className={`${styles.fullRow} ${dealFormStyles.amountRow}`}>
                  <Select
                    label="Currency"
                    value={amountCurrency}
                    onChange={(e) => setAmountCurrency(e.target.value)}
                    options={DEAL_CURRENCY_OPTIONS}
                  />
                  <Input
                    label="Amount (optional)"
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="Enter amount"
                    value={amount}
                    error={formErrors.amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      setFormErrors((prev) => ({ ...prev, amount: undefined }));
                    }}
                  />
                </div>
                <Select
                  label="Deal value type"
                  value={valueType}
                  onChange={(e) => setValueType(e.target.value)}
                  options={DEAL_VALUE_TYPE_OPTIONS}
                />
                <DateTimePickerField label="Expected close date" mode="date" value={closingDate} onChange={setClosingDate} />
                <Input label="Deal type" value={dealType} onChange={(e) => setDealType(e.target.value)} placeholder="e.g. New business" />
                <Input
                  label="Probability (%)"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  placeholder="e.g. 50"
                  value={probability}
                  error={formErrors.probability}
                  onChange={(e) => {
                    setProbability(e.target.value);
                    setFormErrors((prev) => ({ ...prev, probability: undefined }));
                  }}
                />
              </div>

              <div className={dealFormStyles.fullRow}>
                <div className={styles.sectionLabel}>Priority</div>
                <div className={dealFormStyles.prioritySeg}>
                  {[
                    { id: 'low', label: 'Low', dot: '#22c55e' },
                    { id: 'medium', label: 'Medium', dot: '#f97316' },
                    { id: 'high', label: 'High', dot: '#ef4444' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`${dealFormStyles.priorityBtn} ${priority === p.id ? dealFormStyles.priorityBtnOn : ''}`}
                      onClick={() => setPriority(p.id)}
                    >
                      <span className={dealFormStyles.priorityDot} style={{ background: p.dot }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.fullRow}>
                <label className={styles.sectionLabel} htmlFor="deal-desc">
                  Deal description (optional)
                </label>
                <textarea
                  id="deal-desc"
                  className={styles.textarea}
                  rows={3}
                  maxLength={500}
                  placeholder="Add a short description about this deal…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className={styles.textareaFooter}>{(description || '').length}/500</div>
              </div>

              <Input label="Tags (optional)" placeholder="Comma-separated tags" value={tags} onChange={(e) => setTags(e.target.value)} />
            </>
          ) : (
            <>
              <div className={styles.backBar}>
                <button type="button" className={styles.backBtn} onClick={() => setStep(1)} disabled={saving} aria-label="Back">
                  <MaterialSymbol name="arrow_back" size="sm" />
                </button>
              </div>
              <div className={styles.grid2}>
                <Input label="Next step" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="What happens next?" />
                <Input label="Lead source" value={leadSource} onChange={(e) => setLeadSource(e.target.value)} placeholder="e.g. Web, Referral" />
                <Input
                  label="Expected revenue (optional)"
                  type="number"
                  min={0}
                  step={0.01}
                  value={expectedRevenue}
                  error={formErrors.expectedRevenue}
                  onChange={(e) => {
                    setExpectedRevenue(e.target.value);
                    setFormErrors((prev) => ({ ...prev, expectedRevenue: undefined }));
                  }}
                />
                <Select label="Campaign (optional)" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} options={campaignOptions} />
              </div>
            </>
          )}
        </div>

        <ModalFooter className={dealFormStyles.modalFooter}>
          <label className={dealFormStyles.footerCheck}>
            <Checkbox checked={createAnother} onChange={(e) => setCreateAnother(e.target.checked)} label="Create another deal" />
          </label>
          <div className={dealFormStyles.footerBtns}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving || hydrating}>
              Cancel
            </Button>
            {step === 1 ? (
              <Button type="button" variant="primary" onClick={goNext} disabled={hydrating}>
                Next: Additional details
                <MaterialSymbol name="arrow_forward" size="sm" style={{ marginLeft: 6 }} />
              </Button>
            ) : (
              <Button type="button" variant="primary" loading={saving} onClick={submit} disabled={hydrating}>
                Save deal
              </Button>
            )}
          </div>
        </ModalFooter>
      </SlidePanel>

      <ContactLeadPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        pickerType={pickerKind}
        onPick={(row) => {
          setContactId(String(row.id));
          setContactType(String(row.type) === 'lead' ? 'lead' : 'contact');
          setFormErrors((prev) => ({ ...prev, contact: undefined }));
        }}
      />
    </>
  );
}
