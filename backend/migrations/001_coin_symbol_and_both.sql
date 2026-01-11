-- 001 - coins: add symbol column + allow source_type='both'
-- Run this once against your Postgres DB.

BEGIN;

ALTER TABLE coins
  ADD COLUMN IF NOT EXISTS symbol TEXT;

-- If you used a Postgres ENUM for source_type, add the new value.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type') THEN
    BEGIN
      ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'both';
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- Wizard uses "ON CONFLICT (platform, handle)"; ensure the constraint exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_social_accounts_platform_handle'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_social_accounts_platform_handle ON social_accounts (platform, handle);';
  END IF;
END $$;

COMMIT;
