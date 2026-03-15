-- Run first: create database
-- Then run in order:
--   1. tenant/tenant.sql
--   2. tenant/01_seed_platform.sql (creates platform tenant id=1)
--   3. user/user.sql
--   4. user/refresh_token.sql

CREATE DATABASE IF NOT EXISTS call_nest;
USE call_nest;
