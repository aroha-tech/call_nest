-- ============================================
-- Migration 095: campaigns.settings_json
-- Stores wizard / UI fields: pipeline, schedule, channel, content draft, audience estimate, etc.
-- ============================================
-- Paste-ready (adjust database name):
--   USE call_nest;
--   ALTER TABLE campaigns
--     ADD COLUMN settings_json JSON NULL
--     COMMENT 'Campaign wizard metadata (pipeline, schedule, channel, content, estimates)'
--     AFTER filters_json;
--
-- File-based:
--   mysql -u root -p call_nest < server/schema/migrations/095_campaigns_settings_json.sql
--   mysql> USE call_nest;
--   mysql> source server/schema/migrations/095_campaigns_settings_json.sql;

ALTER TABLE campaigns
  ADD COLUMN settings_json JSON NULL
  COMMENT 'Campaign wizard metadata (pipeline, schedule, channel, content, estimates)'
  AFTER filters_json;
