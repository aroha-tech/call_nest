import { defaultRule, getPropertyMeta, ruleNeedsValue } from './campaignFilterConfig';
import { dateToDateOnlyString } from '../../components/ui/dateTimePickerUtils';

export function getImmediateStartDate() {
  return dateToDateOnlyString(new Date());
}

export function parseFilters(campaign) {
  if (!campaign?.filters_json) return {};
  const raw = campaign.filters_json;
  if (typeof raw === 'object' && raw !== null) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function rulesFromCampaign(campaign) {
  const raw = parseFilters(campaign);
  if (raw.rules && Array.isArray(raw.rules) && raw.rules.length > 0) {
    const cleaned = raw.rules
      .filter((r) => r && r.property !== 'tag')
      .map((r) => {
        let property = r.property || 'type';
        let op = r.op || 'eq';
        let value = r.value;
        if (property === 'tag_id' && op === 'eq' && value != null && value !== '') {
          op = 'in';
          value = [value];
        }
        return { property, op, value };
      });
    if (cleaned.length) return cleaned;
  }
  const legacy = [];
  if (raw.source) legacy.push({ property: 'source', op: 'eq', value: raw.source });
  if (raw.status_id) legacy.push({ property: 'status_id', op: 'eq', value: raw.status_id });
  if (raw.type) legacy.push({ property: 'type', op: 'eq', value: raw.type });
  return legacy.length ? legacy : [defaultRule()];
}

export function sanitizeRuleForApi(r) {
  const meta = getPropertyMeta(r.property);
  const out = { property: r.property, op: r.op };
  if (!ruleNeedsValue(r.op)) return out;

  if (r.op === 'in') {
    const arr = Array.isArray(r.value) ? r.value : [];
    if (['manager_id', 'assigned_user_id', 'campaign_id', 'tag_id'].includes(r.property)) {
      out.value = arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    } else {
      out.value = arr;
    }
    return out;
  }

  if (['manager_id', 'assigned_user_id', 'campaign_id', 'tag_id'].includes(r.property)) {
    const v = r.value;
    out.value = v == null || v === '' || v === 'none' ? null : Number(v);
    return out;
  }

  if (meta.valueType === 'datetime' && typeof r.value === 'string' && r.value.includes('T')) {
    const s = r.value.replace('T', ' ');
    out.value = s.length === 16 ? `${s}:00` : s;
    return out;
  }

  out.value = r.value;
  return out;
}

export function getDefaultTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function parseSettingsFromCampaign(campaign) {
  const s = campaign?.settings_json;
  let o = {};
  if (typeof s === 'string') {
    try {
      o = JSON.parse(s);
    } catch {
      o = {};
    }
  } else if (s && typeof s === 'object') {
    o = { ...s };
  }
  const ch = String(o.channel || 'phone').toLowerCase();
  return {
    pipeline_id: o.pipeline_id != null ? String(o.pipeline_id) : '',
    schedule_mode: o.schedule_mode === 'scheduled' ? 'scheduled' : 'immediate',
    start_date: o.start_date || '',
    end_date: o.end_date || '',
    timezone: o.timezone || getDefaultTimezone(),
    audienceTab: null,
    channel: ['phone', 'whatsapp', 'email', 'sms'].includes(ch) ? ch : 'phone',
    caller_id_label: o.caller_id_label || '',
    call_script_id: o.call_script_id != null ? String(o.call_script_id) : '',
    timeout_seconds: o.timeout_seconds != null ? Number(o.timeout_seconds) : 30,
    content_html: o.content_html || '',
    audience_estimate_total: o.audience_estimate_total != null ? Number(o.audience_estimate_total) : null,
    audience_estimate_at: o.audience_estimate_at || null,
    static_record_type: o.static_record_type === 'contact' ? 'contact' : 'lead',
  };
}

export function buildSettingsPayload(form) {
  const scheduleImmediate = form.schedule_mode !== 'scheduled';
  let start_date = form.start_date?.trim() ? form.start_date.trim() : null;
  if (scheduleImmediate && form.end_date?.trim() && !start_date) {
    start_date = getImmediateStartDate();
  }
  return {
    pipeline_id: form.pipeline_id ? Number(form.pipeline_id) : null,
    schedule_mode: form.schedule_mode,
    start_date,
    end_date: form.end_date || null,
    timezone: form.timezone || null,
    channel: form.channel,
    caller_id_label: form.caller_id_label?.trim() || null,
    call_script_id: form.call_script_id ? Number(form.call_script_id) : null,
    timeout_seconds: Number(form.timeout_seconds) || 30,
    content_html: form.content_html || null,
    audience_estimate_total: form.audience_estimate_total,
    audience_estimate_at: form.audience_estimate_at,
    static_record_type: form.static_record_type === 'contact' ? 'contact' : 'lead',
  };
}

export function readCampaignSettings(c) {
  if (!c?.settings_json) return {};
  if (typeof c.settings_json === 'object') return { ...c.settings_json };
  try {
    return JSON.parse(c.settings_json);
  } catch {
    return {};
  }
}

export function channelIconFromCampaign(c) {
  const o = readCampaignSettings(c);
  const ch = String(o.channel || 'phone').toLowerCase();
  const map = { phone: '📞', whatsapp: '💬', email: '✉️', sms: '📱' };
  return map[ch] || '📣';
}

export function buildEmptyCampaignForm() {
  return {
    name: '',
    description: '',
    campaign_type_master_id: '',
    campaign_status_master_id: '',
    type: 'static',
    manager_id: '',
    status: 'active',
    filterRules: [defaultRule()],
    pipeline_id: '',
    schedule_mode: 'immediate',
    start_date: '',
    static_record_type: 'lead',
    end_date: '',
    timezone: getDefaultTimezone(),
    audienceTab: 'filter',
    channel: 'phone',
    caller_id_label: '',
    call_script_id: '',
    timeout_seconds: 30,
    content_html: '',
    audience_estimate_total: null,
    audience_estimate_at: null,
  };
}
