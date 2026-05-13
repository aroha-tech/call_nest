/**
 * Default HTML fragment for built-in meeting email templates.
 * Uses merge fields from `meetingEmailContentResolve.buildHtmlVars` / `meetingVars`.
 * Layout is div-based (not tables) so rich-text editors are less likely to flatten spacing.
 */

export const BUILTIN_MEETING_EMAIL_APPENDIX_HTML = `
<div style="margin-top:24px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:560px;border-radius:14px;overflow:hidden;border:1px solid #c7d2fe;background:#ffffff;box-shadow:0 4px 14px rgba(15,23,42,0.06);">
    <div style="padding:14px 20px;background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 55%,#3b82f6 100%);color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.02em;">Meeting details</div>
    <div style="padding:20px 22px 18px;font-size:14px;line-height:1.55;color:#334155;">
      <div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #e2e8f0;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Title</div>
        <div style="font-size:17px;font-weight:700;color:#0f172a;line-height:1.35;">{{title}}</div>
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Date</div>
        <div style="font-size:15px;font-weight:600;color:#1e293b;">{{meeting_card_date}}</div>
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Time</div>
        <div style="font-size:15px;font-weight:600;color:#1e293b;">{{meeting_card_time}}</div>
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Platform</div>
        <div style="font-size:15px;font-weight:600;color:#1e293b;">{{meeting_platform_label}}</div>
      </div>
      <div style="margin-bottom:4px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Join link</div>
        <div style="font-size:14px;word-break:break-all;">
          <a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;font-weight:600;text-decoration:underline;">{{meeting_link}}</a>
        </div>
      </div>
      <div style="margin-top:18px;padding-top:16px;border-top:1px solid #e2e8f0;">
        <a href="{{meeting_link}}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#2563eb;color:#ffffff !important;font-weight:700;font-size:15px;text-decoration:none;box-shadow:0 2px 6px rgba(37,99,235,0.35);">Join meeting</a>
      </div>
    </div>
  </div>
  <div style="max-width:560px;margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:14px;line-height:1.6;color:#334155;">
    <span style="display:inline-block;margin-right:4px;margin-bottom:6px;">
      <a href="{{calendar_google_url}}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;text-decoration:none;font-weight:700;">Add to Google Calendar</a>
    </span>
    <span style="color:#cbd5e1;font-weight:400;padding:0 8px;">·</span>
    <span style="display:inline-block;margin-right:4px;margin-bottom:6px;">
      <a href="{{calendar_outlook_url}}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;text-decoration:none;font-weight:700;">Add to Outlook</a>
    </span>
    <span style="color:#cbd5e1;font-weight:400;padding:0 8px;">·</span>
    <span style="display:inline-block;font-weight:700;color:#1d4ed8;margin-bottom:6px;">Add to iCal</span>
    <div style="margin-top:6px;font-size:12px;color:#64748b;">Use the attached <strong>.ics</strong> calendar file from this email.</div>
  </div>
</div>
`.trim();

export const BUILTIN_MEETING_EMAIL_APPENDIX_TEXT = `

Meeting details
───────────────
Title:    {{title}}
Date:     {{meeting_card_date}}
Time:     {{meeting_card_time}}
Platform: {{meeting_platform_label}}
Link:     {{meeting_link}}

Calendar
────────
Google Calendar: {{calendar_google_url}}
Outlook:         {{calendar_outlook_url}}
iCal:            open the attached .ics file from this email.
`.trim();
