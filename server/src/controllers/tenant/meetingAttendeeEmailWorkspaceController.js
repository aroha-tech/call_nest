import * as meetingEmailContentResolve from '../../services/tenant/meetingEmailContentResolve.js';
import * as meetingEmailTemplatesService from '../../services/tenant/meetingEmailTemplatesService.js';
import * as meetingUserAttendeeEmailTemplatesService from '../../services/tenant/meetingUserAttendeeEmailTemplatesService.js';
import * as meetingDefaultEmailSettingsService from '../../services/tenant/meetingDefaultEmailSettingsService.js';
import { buildAttendeeEmailBodies } from '../../services/tenant/meetingNotifyService.js';
import { meetingDetailsCardFieldValues } from '../../services/tenant/meetingEmailDetailsBox.js';

function canManageOtherUsersMeetingEmail(req) {
  if (req.user?.isPlatformAdmin) return true;
  const p = req.user?.permissions || [];
  return p.includes('meetings.manage') || p.includes('settings.manage');
}

/**
 * One call for the Meetings "Preview & edit email" panel: stored template for the meeting owner,
 * owner default settings (include details, CC/BCC), and a resolved preview matching outbound mail.
 */
export async function workspace(req, res, next) {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant context required' });

    const { template_kind, meeting: meetingRaw, template_override, include_meeting_details } = req.body || {};
    const kind = String(template_kind || '').trim();
    if (!['created', 'updated', 'cancelled'].includes(kind)) {
      return res.status(400).json({ error: 'Invalid or missing template_kind' });
    }

    const meeting = await meetingEmailContentResolve.enrichMeetingPayload(tenantId, meetingRaw || {});
    const ownerUserId =
      Number(meeting?.meeting_owner_user_id || meeting?.assigned_user_id || req.user?.id || 0) || null;

    const actorId = Number(req.user?.id || 0) || null;
    if (ownerUserId && actorId && ownerUserId !== actorId && !canManageOtherUsersMeetingEmail(req)) {
      return res.status(403).json({
        error: 'You do not have permission to load or edit this meeting owner’s attendee email defaults.',
      });
    }

    const stored = await meetingUserAttendeeEmailTemplatesService.findTemplateForUserOrTenant(
      tenantId,
      ownerUserId,
      kind
    );
    if (!stored) {
      return res.status(404).json({ error: 'Email template not found' });
    }

    const hasOverride = template_override != null && typeof template_override === 'object';
    const editorTemplate = hasOverride
      ? {
          subject: String(template_override.subject ?? ''),
          body_html: template_override.body_html ?? '',
          body_text: template_override.body_text ?? '',
        }
      : {
          subject: String(stored.subject ?? ''),
          body_html: stored.body_html ?? '',
          body_text: stored.body_text ?? '',
        };

    const ownerSettings = ownerUserId
      ? await meetingDefaultEmailSettingsService.getOrCreateForUser(tenantId, ownerUserId)
      : {
          include_meeting_details: true,
          default_cc_email: '',
          default_bcc_email: '',
        };

    const includeFlag =
      include_meeting_details !== undefined && include_meeting_details !== null
        ? Boolean(include_meeting_details)
        : Boolean(ownerSettings.include_meeting_details);

    const preview = await buildAttendeeEmailBodies(tenantId, meeting, editorTemplate, {
      include_meeting_details: includeFlag,
    });
    const previewNoDetails = await buildAttendeeEmailBodies(tenantId, meeting, editorTemplate, {
      include_meeting_details: false,
    });

    return res.json({
      data: {
        template_kind: kind,
        meeting_owner_user_id: ownerUserId,
        template: editorTemplate,
        stored_template: {
          subject: String(stored.subject ?? ''),
          body_html: stored.body_html ?? '',
          body_text: stored.body_text ?? '',
        },
        owner_settings: {
          include_meeting_details: Boolean(ownerSettings.include_meeting_details),
          default_cc_email: String(ownerSettings.default_cc_email || '').trim(),
          default_bcc_email: String(ownerSettings.default_bcc_email || '').trim(),
        },
        preview: {
          subject: preview.subject,
          body_html: preview.body_html,
          body_text: preview.body_text,
          include_meeting_details: preview.include_meeting_details,
          body_without_details_html: previewNoDetails.body_html,
        },
        details_card: meetingDetailsCardFieldValues(meeting),
        envelope: {
          to_email: String(meeting.attendee_email || '').trim(),
          account_label: meeting.account_label != null ? String(meeting.account_label) : '',
          account_email: meeting.account_email != null ? String(meeting.account_email) : '',
        },
      },
      placeholder_help: meetingEmailTemplatesService.MEETING_TEMPLATE_PLACEHOLDERS,
    });
  } catch (e) {
    return next(e);
  }
}
