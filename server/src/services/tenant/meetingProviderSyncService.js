import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import * as emailAccountService from './emailAccountService.js';
import * as googleOAuth from '../email/googleOAuthService.js';
import * as outlookOAuth from '../email/outlookOAuthService.js';

function buildProviderReconnectError(providerLabel, featureLabel, detail = '') {
  const err = new Error(
    `${providerLabel} permissions are missing for ${featureLabel}. Reconnect this account to refresh provider scopes.${detail ? ` ${detail}` : ''}`.trim()
  );
  err.status = 400;
  err.code = 'PROVIDER_REAUTH_REQUIRED';
  return err;
}

function buildProviderConfigError(providerLabel, featureLabel, detail = '') {
  const err = new Error(
    `${providerLabel} configuration is incomplete for ${featureLabel}. ${detail}`.trim()
  );
  err.status = 400;
  err.code = 'PROVIDER_CONFIGURATION_REQUIRED';
  return err;
}

function throwGoogleCalendarError(error, featureLabel) {
  const msg =
    error?.response?.data?.error?.message ||
    error?.errors?.[0]?.message ||
    error?.message ||
    'Google Calendar API error';
  const text = String(msg);
  if (
    text.includes('Google Calendar API has not been used') ||
    text.includes('API has not been used') ||
    text.includes('is disabled')
  ) {
    throw buildProviderConfigError(
      'Google',
      featureLabel,
      'Enable Google Calendar API in Google Cloud for this OAuth project, then retry in a few minutes.'
    );
  }
  if (
    text.includes('insufficientPermissions') ||
    text.includes('insufficient permission') ||
    text.includes('insufficient authentication scopes')
  ) {
    throw buildProviderReconnectError(
      'Google',
      featureLabel,
      'Reconnect this account to grant required calendar scopes.'
    );
  }
  const err = new Error(`Google ${featureLabel} failed. ${text}`);
  err.status = 400;
  err.code = 'PROVIDER_SYNC_FAILED';
  throw err;
}

function toIsoFromMysqlDatetime(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function requireNativeProviderForPlatform(platform, provider) {
  const p = String(provider || '').toLowerCase();
  if (platform === 'google_meet' && p !== 'gmail') {
    const err = new Error('Google Meet requires a connected Google email account.');
    err.status = 400;
    err.code = 'PROVIDER_ACCOUNT_MISMATCH';
    throw err;
  }
  if (platform === 'microsoft_teams' && p !== 'outlook') {
    const err = new Error('Microsoft Teams requires a connected Microsoft email account.');
    err.status = 400;
    err.code = 'PROVIDER_ACCOUNT_MISMATCH';
    throw err;
  }
}

async function ensureFreshGmailAccount(account, tenantId, updatedBy) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAtSec = account.token_expires_at
    ? Math.floor(new Date(account.token_expires_at).getTime() / 1000)
    : null;
  const needsRefresh =
    !account.access_token ||
    (expiresAtSec != null && expiresAtSec <= nowSec + 60) ||
    (expiresAtSec == null && account.refresh_token);
  if (!needsRefresh) return account;
  const refreshed = await googleOAuth.refreshAccessToken(account.refresh_token);
  if (refreshed?.error || !refreshed?.access_token) {
    throw buildProviderReconnectError(
      'Google',
      'calendar + Meet sync',
      refreshed?.error || ''
    );
  }
  await emailAccountService.update(
    tenantId,
    account.id,
    {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || account.refresh_token,
      token_expires_at: refreshed.expires_at ? new Date(refreshed.expires_at * 1000) : null,
    },
    updatedBy
  );
  return {
    ...account,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || account.refresh_token,
    token_expires_at: refreshed.expires_at ? new Date(refreshed.expires_at * 1000) : account.token_expires_at,
  };
}

async function ensureFreshOutlookAccount(account, tenantId, updatedBy) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAtSec = account.token_expires_at
    ? Math.floor(new Date(account.token_expires_at).getTime() / 1000)
    : null;
  const needsRefresh =
    !account.access_token ||
    (expiresAtSec != null && expiresAtSec <= nowSec + 60) ||
    (expiresAtSec == null && account.refresh_token);
  if (!needsRefresh) return account;
  const refreshed = await outlookOAuth.refreshAccessToken(account.refresh_token);
  if (refreshed?.error || !refreshed?.access_token) {
    throw buildProviderReconnectError(
      'Microsoft',
      'calendar + Teams sync',
      refreshed?.error || ''
    );
  }
  await emailAccountService.update(
    tenantId,
    account.id,
    {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || account.refresh_token,
      token_expires_at: refreshed.expires_at ? new Date(refreshed.expires_at * 1000) : null,
    },
    updatedBy
  );
  return {
    ...account,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || account.refresh_token,
    token_expires_at: refreshed.expires_at ? new Date(refreshed.expires_at * 1000) : account.token_expires_at,
  };
}

async function createGoogleEvent(account, meeting) {
  if (!env.googleClientId || !env.googleClientSecret) {
    const err = new Error('Google OAuth client is not configured on server.');
    err.status = 500;
    throw err;
  }
  const oauth2 = new OAuth2Client(env.googleClientId, env.googleClientSecret, googleOAuth.getRedirectUri());
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  const requestId = `cn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let res;
  try {
    res = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        summary: meeting.title,
        description: meeting.description || undefined,
        location: meeting.location || undefined,
        start: { dateTime: toIsoFromMysqlDatetime(meeting.start_at), timeZone: 'UTC' },
        end: { dateTime: toIsoFromMysqlDatetime(meeting.end_at), timeZone: 'UTC' },
        attendees: meeting.attendee_email ? [{ email: meeting.attendee_email }] : [],
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });
  } catch (e) {
    throwGoogleCalendarError(e, 'native meeting room creation');
  }
  if (!res?.data) {
    throw buildProviderReconnectError('Google', 'native meeting room creation');
  }
  const event = res?.data || {};
  const link =
    event.hangoutLink ||
    event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    event.htmlLink ||
    null;
  return {
    provider_event_id: event.id || null,
    provider_calendar_id: 'primary',
    meeting_link: link,
  };
}

async function updateGoogleEvent(account, meeting) {
  if (!meeting.provider_event_id) return createGoogleEvent(account, meeting);
  if (!env.googleClientId || !env.googleClientSecret) {
    const err = new Error('Google OAuth client is not configured on server.');
    err.status = 500;
    throw err;
  }
  const oauth2 = new OAuth2Client(env.googleClientId, env.googleClientSecret, googleOAuth.getRedirectUri());
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  const requestId = `cn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let res;
  try {
    res = await calendar.events.patch({
      calendarId: meeting.provider_calendar_id || 'primary',
      eventId: meeting.provider_event_id,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        summary: meeting.title,
        description: meeting.description || undefined,
        location: meeting.location || undefined,
        start: { dateTime: toIsoFromMysqlDatetime(meeting.start_at), timeZone: 'UTC' },
        end: { dateTime: toIsoFromMysqlDatetime(meeting.end_at), timeZone: 'UTC' },
        attendees: meeting.attendee_email ? [{ email: meeting.attendee_email }] : [],
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });
  } catch (e) {
    throwGoogleCalendarError(e, 'native meeting room update');
  }
  if (!res?.data) {
    throw buildProviderReconnectError('Google', 'native meeting room update');
  }
  const event = res?.data || {};
  const link =
    event.hangoutLink ||
    event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    event.htmlLink ||
    null;
  return {
    provider_event_id: event.id || meeting.provider_event_id,
    provider_calendar_id: meeting.provider_calendar_id || 'primary',
    meeting_link: link,
  };
}

async function deleteGoogleEvent(account, meeting) {
  if (!meeting.provider_event_id) return;
  if (!env.googleClientId || !env.googleClientSecret) return;
  const oauth2 = new OAuth2Client(env.googleClientId, env.googleClientSecret, googleOAuth.getRedirectUri());
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });
  const calendar = google.calendar({ version: 'v3', auth: oauth2 });
  try {
    await calendar.events.delete({
      calendarId: meeting.provider_calendar_id || 'primary',
      eventId: meeting.provider_event_id,
      sendUpdates: 'all',
    });
  } catch (e) {
    throwGoogleCalendarError(e, 'native meeting room deletion');
  }
}

async function createOutlookEvent(account, meeting) {
  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: meeting.title,
      body: { contentType: 'HTML', content: meeting.description || '' },
      start: { dateTime: toIsoFromMysqlDatetime(meeting.start_at), timeZone: 'UTC' },
      end: { dateTime: toIsoFromMysqlDatetime(meeting.end_at), timeZone: 'UTC' },
      location: { displayName: meeting.location || '' },
      attendees: meeting.attendee_email
        ? [{ emailAddress: { address: meeting.attendee_email }, type: 'required' }]
        : [],
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw buildProviderReconnectError(
        'Microsoft',
        'native meeting room creation',
        data?.error?.message || ''
      );
    }
    const err = new Error(`Microsoft Graph meeting create failed. ${data?.error?.message || `HTTP ${res.status}`}`);
    err.status = 400;
    err.code = 'PROVIDER_SYNC_FAILED';
    throw err;
  }
  return {
    provider_event_id: data.id || null,
    provider_calendar_id: 'primary',
    meeting_link: data?.onlineMeeting?.joinUrl || data?.webLink || null,
  };
}

async function updateOutlookEvent(account, meeting) {
  if (!meeting.provider_event_id) return createOutlookEvent(account, meeting);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(meeting.provider_event_id)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: meeting.title,
        body: { contentType: 'HTML', content: meeting.description || '' },
        start: { dateTime: toIsoFromMysqlDatetime(meeting.start_at), timeZone: 'UTC' },
        end: { dateTime: toIsoFromMysqlDatetime(meeting.end_at), timeZone: 'UTC' },
        location: { displayName: meeting.location || '' },
        attendees: meeting.attendee_email
          ? [{ emailAddress: { address: meeting.attendee_email }, type: 'required' }]
          : [],
        isOnlineMeeting: true,
        onlineMeetingProvider: 'teamsForBusiness',
      }),
    }
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw buildProviderReconnectError('Microsoft', 'native meeting room update');
    }
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data?.error?.message || msg;
    } catch {
      // ignore
    }
    const err = new Error(`Microsoft Graph meeting update failed. ${msg}`);
    err.status = 400;
    err.code = 'PROVIDER_SYNC_FAILED';
    throw err;
  }
  const getRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(
      meeting.provider_event_id
    )}?$select=id,webLink,onlineMeeting`,
    {
      headers: { Authorization: `Bearer ${account.access_token}` },
    }
  );
  const data = await getRes.json();
  return {
    provider_event_id: data?.id || meeting.provider_event_id,
    provider_calendar_id: 'primary',
    meeting_link: data?.onlineMeeting?.joinUrl || data?.webLink || meeting.meeting_link || null,
  };
}

async function deleteOutlookEvent(account, meeting) {
  if (!meeting.provider_event_id) return;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(meeting.provider_event_id)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${account.access_token}` },
    }
  );
  if (!res.ok && res.status !== 404) {
    if (res.status === 401 || res.status === 403) {
      throw buildProviderReconnectError('Microsoft', 'native meeting room deletion');
    }
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data?.error?.message || msg;
    } catch {
      // ignore
    }
    const err = new Error(`Microsoft Graph meeting delete failed. ${msg}`);
    err.status = 400;
    err.code = 'PROVIDER_SYNC_FAILED';
    throw err;
  }
}

async function getRefreshedAccount(tenantId, emailAccountId, updatedBy) {
  const account = await emailAccountService.findActiveById(tenantId, emailAccountId);
  if (!account) {
    const err = new Error('Email account not found or inactive');
    err.status = 400;
    throw err;
  }
  const provider = String(account.provider || '').toLowerCase();
  if (provider === 'gmail') return ensureFreshGmailAccount(account, tenantId, updatedBy);
  if (provider === 'outlook') return ensureFreshOutlookAccount(account, tenantId, updatedBy);
  return account;
}

export async function createNativeMeetingRoom(tenantId, updatedBy, meeting) {
  const platform = String(meeting?.meeting_platform || '').toLowerCase();
  if (platform !== 'google_meet' && platform !== 'microsoft_teams') {
    return { meeting_link: meeting?.meeting_link || null, provider_event_id: null, provider_calendar_id: null };
  }
  const account = await getRefreshedAccount(tenantId, meeting.email_account_id, updatedBy);
  requireNativeProviderForPlatform(platform, account.provider);
  if (platform === 'google_meet') return createGoogleEvent(account, meeting);
  return createOutlookEvent(account, meeting);
}

export async function updateNativeMeetingRoom(tenantId, updatedBy, meeting) {
  const platform = String(meeting?.meeting_platform || '').toLowerCase();
  if (platform !== 'google_meet' && platform !== 'microsoft_teams') {
    return { meeting_link: meeting?.meeting_link || null, provider_event_id: null, provider_calendar_id: null };
  }
  const account = await getRefreshedAccount(tenantId, meeting.email_account_id, updatedBy);
  requireNativeProviderForPlatform(platform, account.provider);
  if (platform === 'google_meet') return updateGoogleEvent(account, meeting);
  return updateOutlookEvent(account, meeting);
}

export async function deleteNativeMeetingRoom(tenantId, updatedBy, meeting) {
  const platform = String(meeting?.meeting_platform || '').toLowerCase();
  if (platform !== 'google_meet' && platform !== 'microsoft_teams') return;
  const account = await getRefreshedAccount(tenantId, meeting.email_account_id, updatedBy);
  requireNativeProviderForPlatform(platform, account.provider);
  if (platform === 'google_meet') {
    await deleteGoogleEvent(account, meeting);
    return;
  }
  await deleteOutlookEvent(account, meeting);
}

