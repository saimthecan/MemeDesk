-- 006 - Cursor pagination indexes (global lists)
-- Supports ORDER BY (entry_ts, id) and (post_ts, tip_id).

BEGIN;

CREATE INDEX IF NOT EXISTS idx_trades_entry_ts_id
    ON trades (entry_ts DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_tips_post_ts_id
    ON tips (post_ts DESC, tip_id DESC);

COMMIT;
