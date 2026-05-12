# Email Campaigns - Future Enable Notes

This module is intentionally hidden for now and will be enabled in a future release.

## What is already implemented

- UI page: `EmailCampaignsPage.jsx`
- Client API methods: `emailCampaignsAPI` in `client/src/services/emailAPI.js`
- Backend routes:
  - `GET /api/tenant/email/campaigns`
  - `GET /api/tenant/email/campaigns/:id`
  - `GET /api/tenant/email/campaigns/:id/recipients`
  - `POST /api/tenant/email/campaigns`
  - `POST /api/tenant/email/campaigns/:id/queue`
- Worker job type: `email_campaign_send`
- Migration: `server/schema/migrations/073_email_campaigns_bulk.sql`

## Why hidden

- Product decision: keep campaign/bulk email feature off for now.
- Avoid exposing partially released workflow in tenant UI.

## To enable later

1. In `client/src/hooks/useSalesNavigation.js`, add a child under the Email group (same pattern as Sent / Templates / Accounts), e.g. path `/email/campaigns` and label **Campaigns**.
2. In `client/src/routes/AppRoutes.jsx`:
   - import `EmailCampaignsPage`
   - add `/email/campaigns` protected route under `EmailModuleGate`
3. Verify migration `073_email_campaigns_bulk.sql` has run in target environment.
4. QA checklist:
   - create campaign
   - queue campaign
   - background job progress updates
   - sent/failed recipient statuses

## Notes

- Keep this file as the single reference for future re-enable tasks.
