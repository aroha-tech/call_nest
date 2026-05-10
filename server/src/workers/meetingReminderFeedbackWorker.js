import { processMeetingReminderAndFeedbackTick } from '../services/tenant/meetingDefaultEmailSettingsService.js';
import { markEndedMeetingsMissed } from '../services/tenant/meetingsService.js';
import { processScheduledFollowUpReminderTick } from '../services/tenant/scheduledFollowUpReminderService.js';
import { markStalePendingFollowUpsMissed } from '../services/tenant/scheduledFollowUpsService.js';

export function startMeetingReminderFeedbackWorker() {
  const run = async () => {
    try {
      await processMeetingReminderAndFeedbackTick();
    } catch (e) {
      console.error('[meeting-reminder-feedback] tick failed:', e?.message || e);
    }
    try {
      await markEndedMeetingsMissed();
    } catch (e) {
      console.error('[meeting-missed] tick failed:', e?.message || e);
    }
    try {
      await processScheduledFollowUpReminderTick();
    } catch (e) {
      console.error('[follow-up-reminders] tick failed:', e?.message || e);
    }
    try {
      await markStalePendingFollowUpsMissed();
    } catch (e) {
      console.error('[follow-up-missed] tick failed:', e?.message || e);
    }
  };
  const id = setInterval(() => {
    void run();
  }, 60_000);
  if (typeof id.unref === 'function') id.unref();
  void run();
}
