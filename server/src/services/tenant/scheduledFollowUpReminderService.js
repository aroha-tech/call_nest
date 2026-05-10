import { query } from '../../config/db.js';
import { createAndDispatchNotification } from './notificationService.js';

/** Same cadence idea as meeting reminders: 1 day, 1 hour, 15 minutes before scheduled_at. */
const REMINDER_OFFSETS_MINUTES = [1440, 60, 15];

/** If the worker tick lands within this many ms after the ideal reminder time, still send (matches meeting tick). */
const UPCOMING_CATCH_MS = 5 * 60_000;

/** Do not notify “overdue” until this many ms after scheduled_at (avoid racing the exact-time tick). */
const OVERDUE_GRACE_MS = 60_000;

const FOLLOW_UP_TYPE_LABELS = {
  callback: 'Phone callback',
  email: 'Email',
  meeting: 'Meeting follow-up',
  other: 'Other',
};

function followUpTypeLabel(v) {
  const k = String(v || 'callback').toLowerCase();
  return FOLLOW_UP_TYPE_LABELS[k] || 'Follow-up';
}

function parseScheduledAtMs(raw) {
  const d = new Date(String(raw || '').replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

async function listPendingFollowUpsForTick() {
  return query(
    `SELECT
       sc.id,
       sc.tenant_id,
       sc.assigned_user_id,
       sc.scheduled_at,
       sc.follow_up_type,
       sc.notes,
       c.display_name AS contact_name
     FROM scheduled_callbacks sc
     INNER JOIN contacts c
       ON c.id = sc.contact_id AND c.tenant_id = sc.tenant_id AND c.deleted_at IS NULL
     WHERE sc.deleted_at IS NULL
       AND sc.status = 'pending'
       AND sc.scheduled_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
       AND sc.scheduled_at <= DATE_ADD(NOW(), INTERVAL 7 DAY)`
  );
}

async function tryInsertReminderEvent(tenantId, callbackId, assigneeId, kind, offsetMinutes) {
  const res = await query(
    `INSERT IGNORE INTO scheduled_follow_up_reminder_events
      (tenant_id, scheduled_callback_id, assigned_user_id, kind, offset_minutes)
     VALUES (?, ?, ?, ?, ?)`,
    [tenantId, callbackId, assigneeId, kind, offsetMinutes]
  );
  return Number(res?.affectedRows || 0) > 0;
}

/**
 * In-app (and push, if enabled) reminders for assigned users — same 60s worker as meetings.
 * Upcoming: offsets before scheduled_at. Overdue: once when still pending after scheduled time.
 */
export async function processScheduledFollowUpReminderTick() {
  const rows = await listPendingFollowUpsForTick();
  if (!Array.isArray(rows) || !rows.length) {
    return { upcoming: 0, overdue: 0 };
  }

  const nowMs = Date.now();
  let upcoming = 0;
  let overdue = 0;

  for (const row of rows) {
    const tenantId = Number(row.tenant_id);
    const callbackId = Number(row.id);
    const assigneeId = Number(row.assigned_user_id);
    if (!Number.isFinite(tenantId) || !Number.isFinite(callbackId) || !Number.isFinite(assigneeId)) continue;

    const scheduledMs = parseScheduledAtMs(row.scheduled_at);
    if (scheduledMs == null) continue;

    const typeLabel = followUpTypeLabel(row.follow_up_type);
    const contactName = String(row.contact_name || 'Contact').trim() || 'Contact';
    const whenStr = String(row.scheduled_at || '').replace('T', ' ');

    for (const offsetMinutes of REMINDER_OFFSETS_MINUTES) {
      const dueMs = scheduledMs - offsetMinutes * 60_000;
      if (nowMs < dueMs || nowMs - dueMs > UPCOMING_CATCH_MS) continue;

      const first = await tryInsertReminderEvent(tenantId, callbackId, assigneeId, 'upcoming', offsetMinutes);
      if (!first) continue;

      const label =
        offsetMinutes >= 1440
          ? '1 day'
          : offsetMinutes >= 60
            ? '1 hour'
            : `${offsetMinutes} min`;

      await createAndDispatchNotification(tenantId, null, {
        moduleKey: 'schedule_hub',
        eventType: 'follow_up_reminder',
        severity: 'normal',
        title: `Follow-up in ${label}: ${contactName}`,
        body: `${typeLabel} · ${whenStr}`,
        recipientUserIds: [assigneeId],
        assignedUserId: assigneeId,
        entityType: 'scheduled_follow_up',
        entityId: callbackId,
        ctaPath: '/schedule/follow-ups',
        metadata: { follow_up_type: row.follow_up_type || 'callback', offset_minutes: offsetMinutes },
        eventHash: `follow_up:upcoming:${tenantId}:${callbackId}:${offsetMinutes}`,
      });
      upcoming++;
    }

    if (nowMs < scheduledMs + OVERDUE_GRACE_MS) continue;

    const overdueFirst = await tryInsertReminderEvent(tenantId, callbackId, assigneeId, 'overdue', 0);
    if (!overdueFirst) continue;

    await createAndDispatchNotification(tenantId, null, {
      moduleKey: 'schedule_hub',
      eventType: 'follow_up_overdue',
      severity: 'warning',
      title: `Overdue follow-up: ${contactName}`,
      body: `${typeLabel} was due ${whenStr}`,
      recipientUserIds: [assigneeId],
      assignedUserId: assigneeId,
      entityType: 'scheduled_follow_up',
      entityId: callbackId,
      ctaPath: '/schedule/follow-ups',
      metadata: { follow_up_type: row.follow_up_type || 'callback' },
      eventHash: `follow_up:overdue:${tenantId}:${callbackId}`,
    });
    overdue++;
  }

  return { upcoming, overdue };
}
