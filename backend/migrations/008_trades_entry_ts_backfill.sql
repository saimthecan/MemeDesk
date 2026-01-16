-- 008 - Backfill trades.entry_ts and enforce defaults

BEGIN;

UPDATE trades
SET entry_ts = COALESCE(entry_ts, created_ts, NOW())
WHERE entry_ts IS NULL;

ALTER TABLE trades
    ALTER COLUMN entry_ts SET DEFAULT NOW();

ALTER TABLE trades
    ALTER COLUMN entry_ts SET NOT NULL;

COMMIT;
