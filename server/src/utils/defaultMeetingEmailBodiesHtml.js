/**
 * Built-in default HTML for meeting emails (body fragments — no outer html/head/body).
 * Merge fields match meetingEmailContentResolve / meetingDefaultEmailSettingsService.meetingVars.
 */

export const DEFAULT_MEETING_INVITATION_EMAIL_HTML = `
<div style="width:100%;background:#f3f4f6;padding:30px 15px;">
<div style="max-width:650px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;color:#111827;line-height:1.7;">
<h2 style="margin-top:0;color:#4f46e5;">📅 Meeting Invitation</h2>
<p>You are invited to the following meeting.</p>
<div style="background:#f7f5ff;border:1px solid #e4defd;border-radius:10px;padding:20px;margin-top:20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr>
<td style="width:140px;font-weight:600;padding:8px 0;vertical-align:top;">Meeting Title</td>
<td width="10" style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{title}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Date</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_date}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Time</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_time}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Duration</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_duration_min}} Minutes</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Platform</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_platform_label}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Location</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{location}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Meeting Link</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;word-break:break-all;">
<a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;text-decoration:none;font-weight:600;">{{meeting_link}}</a>
</td>
</tr>
</table>
</div>
<div style="margin-top:25px;">
<a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Join Meeting</a>
</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:35px;border-top:1px solid #e5e7eb;padding-top:20px;">
<tr>
<td align="center" style="padding:4px 8px;">
<a href="{{calendar_google_url}}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;text-decoration:none;font-weight:600;">Add to Google Calendar</a>
</td>
<td align="center" style="padding:4px 8px;">
<a href="{{calendar_outlook_url}}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;text-decoration:none;font-weight:600;">Add to Outlook</a>
</td>
<td align="center" style="padding:4px 8px;">
<span style="color:#4f46e5;font-weight:600;">Add to iCal</span>
</td>
</tr>
</table>
<p style="margin-top:30px;">We look forward to meeting with you.</p>
</div>
</div>
`.trim();

export const DEFAULT_MEETING_REMINDER_EMAIL_HTML = `
<div style="width:100%;background:#f3f4f6;padding:30px 15px;">
<div style="max-width:650px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;color:#111827;line-height:1.7;">
<h2 style="margin-top:0;color:#2563eb;">⏰ Meeting Reminder</h2>
<p>This is a friendly reminder for your upcoming meeting.</p>
<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;margin-top:20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr>
<td style="width:140px;font-weight:600;padding:8px 0;vertical-align:top;">Meeting Title</td>
<td width="10" style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{title}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Date</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_date}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Time</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_time}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Meeting Link</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;word-break:break-all;">
<a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:none;font-weight:600;">{{meeting_link}}</a>
</td>
</tr>
</table>
</div>
<div style="margin-top:25px;">
<a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Join Meeting</a>
</div>
<p style="margin-top:30px;">Please join a few minutes before the scheduled time.</p>
</div>
</div>
`.trim();

export const DEFAULT_MEETING_FEEDBACK_EMAIL_HTML = `
<div style="width:100%;background:#f3f4f6;padding:30px 15px;">
<div style="max-width:650px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;color:#111827;line-height:1.7;">
<h2 style="margin-top:0;color:#7c3aed;">⭐ Share Your Feedback</h2>
<p>We hope you had a great meeting. Please take a moment to share your feedback with us.</p>
<div style="background:#faf5ff;border:1px solid #ddd6fe;border-radius:10px;padding:20px;margin-top:20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr>
<td style="width:140px;font-weight:600;padding:8px 0;vertical-align:top;">Meeting Title</td>
<td width="10" style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{title}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Date</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_date}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Time</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_time}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Meeting Link</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;word-break:break-all;">
<a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer" style="color:#7c3aed;text-decoration:none;font-weight:600;">{{meeting_link}}</a>
</td>
</tr>
</table>
</div>
<div style="margin-top:25px;">
<a href="{{feedback_link}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#7c3aed;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Share Your Feedback</a>
</div>
<p style="margin-top:20px;font-size:14px;">Or copy and paste this link in your browser:</p>
<p style="word-break:break-all;">
<a href="{{feedback_link}}" target="_blank" rel="noopener noreferrer" style="color:#7c3aed;text-decoration:none;">{{feedback_link}}</a>
</p>
</div>
</div>
`.trim();

export const DEFAULT_MEETING_UPDATED_EMAIL_HTML = `
<div style="width:100%;background:#f3f4f6;padding:30px 15px;">
<div style="max-width:650px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;color:#111827;line-height:1.7;">
<h2 style="margin-top:0;color:#ea580c;">🔄 Meeting Updated</h2>
<p>The meeting details have been updated. Please review the latest information below.</p>
<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:20px;margin-top:20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr>
<td style="width:140px;font-weight:600;padding:8px 0;vertical-align:top;">Meeting Title</td>
<td width="10" style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{title}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Updated Date</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_date}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Updated Time</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_time}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Location</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{location}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Meeting Link</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;word-break:break-all;">
<a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer" style="color:#ea580c;text-decoration:none;font-weight:600;">{{meeting_link}}</a>
</td>
</tr>
</table>
</div>
<div style="margin-top:25px;">
<a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#ea580c;color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">View Updated Meeting</a>
</div>
<p style="margin-top:30px;"><strong>Updated Notes:</strong><br>{{description}}</p>
</div>
</div>
`.trim();

export const DEFAULT_MEETING_CANCELLED_EMAIL_HTML = `
<div style="width:100%;background:#f3f4f6;padding:30px 15px;">
<div style="max-width:650px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;font-family:Arial,sans-serif;color:#111827;line-height:1.7;">
<h2 style="margin-top:0;color:#dc2626;">❌ Meeting Cancelled</h2>
<p>The following meeting has been cancelled.</p>
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin-top:20px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
<tr>
<td style="width:140px;font-weight:600;padding:8px 0;vertical-align:top;">Meeting Title</td>
<td width="10" style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{title}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Scheduled Date</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_date}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Time</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_card_time}}</td>
</tr>
<tr>
<td style="font-weight:600;padding:8px 0;vertical-align:top;">Meeting Owner</td>
<td style="vertical-align:top;">:</td>
<td style="vertical-align:top;">{{meeting_owner_name}}</td>
</tr>
</table>
</div>
<p style="margin-top:30px;"><strong>Cancellation Reason:</strong><br>{{description}}</p>
<p style="margin-top:25px;">If required, a new meeting invitation will be shared separately.</p>
</div>
</div>
`.trim();

export const DEFAULT_MEETING_INVITATION_EMAIL_TEXT = `Meeting Invitation

You are invited to the following meeting.

Meeting Title: {{title}}
Date: {{meeting_card_date}}
Time: {{meeting_card_time}}
Duration: {{meeting_duration_min}} minutes
Platform: {{meeting_platform_label}}
Location: {{location}}
Meeting Link: {{meeting_link}}

Add to Google Calendar: {{calendar_google_url}}
Add to Outlook: {{calendar_outlook_url}}
Add to iCal: use the attached .ics file from this email.

We look forward to meeting with you.

Attendee: {{attendee_email}}
Sent from: {{account_label}} <{{account_email}}>`;

export const DEFAULT_MEETING_REMINDER_EMAIL_TEXT = `Meeting Reminder

This is a friendly reminder for your upcoming meeting.

Meeting Title: {{title}}
Date: {{meeting_card_date}}
Time: {{meeting_card_time}}
Meeting Link: {{meeting_link}}

Please join a few minutes before the scheduled time.`;

export const DEFAULT_MEETING_FEEDBACK_EMAIL_TEXT = `Share Your Feedback

We hope you had a great meeting. Please share your feedback.

Meeting Title: {{title}}
Date: {{meeting_card_date}}
Time: {{meeting_card_time}}
Meeting Link: {{meeting_link}}

Feedback link: {{feedback_link}}`;

export const DEFAULT_MEETING_UPDATED_EMAIL_TEXT = `Meeting Updated

The meeting details have been updated.

Meeting Title: {{title}}
Updated Date: {{meeting_card_date}}
Updated Time: {{meeting_card_time}}
Location: {{location}}
Meeting Link: {{meeting_link}}

Updated Notes:
{{description}}

Attendee: {{attendee_email}}
Sent from: {{account_label}} <{{account_email}}>`;

export const DEFAULT_MEETING_CANCELLED_EMAIL_TEXT = `Meeting Cancelled

The following meeting has been cancelled.

Meeting Title: {{title}}
Scheduled Date: {{meeting_card_date}}
Time: {{meeting_card_time}}
Meeting Owner: {{meeting_owner_name}}

Cancellation Reason:
{{description}}

If required, a new meeting invitation will be shared separately.

Attendee: {{attendee_email}}
Sent from: {{account_label}} <{{account_email}}>`;
