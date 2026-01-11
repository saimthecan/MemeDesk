-- 004 - Performance indexes for list endpoints
-- Add composite/partial indexes to speed up filtered lists and ordering.

BEGIN;

-- Trades list filtering: ca + order by entry_ts
CREATE INDEX IF NOT EXISTS idx_trades_ca_entry_ts
    ON trades (ca, entry_ts DESC);

-- Open trades list (exit_ts IS NULL) ordered by entry_ts
CREATE INDEX IF NOT EXISTS idx_trades_open_entry_ts
    ON trades (entry_ts DESC)
    WHERE exit_ts IS NULL;

-- Tips list filtering: ca + order by post_ts
CREATE INDEX IF NOT EXISTS idx_tips_ca_post_ts
    ON tips (ca, post_ts DESC);

-- Latest scoring per trade/tip (DISTINCT ON + ORDER BY scored_ts DESC)
CREATE INDEX IF NOT EXISTS idx_trade_scoring_trade_id_scored_ts
    ON trade_scoring (trade_id, scored_ts DESC);

CREATE INDEX IF NOT EXISTS idx_tip_scoring_tip_id_scored_ts
    ON tip_scoring (tip_id, scored_ts DESC);

-- Bubbles ordered by rank for each trade/tip
CREATE INDEX IF NOT EXISTS idx_trade_bubbles_trade_id_rank
    ON trade_bubbles (trade_id, cluster_rank);

CREATE INDEX IF NOT EXISTS idx_trade_bubbles_others_trade_id_rank
    ON trade_bubbles_others (trade_id, other_rank);

CREATE INDEX IF NOT EXISTS idx_tip_bubbles_tip_id_rank
    ON tip_bubbles (tip_id, cluster_rank);

CREATE INDEX IF NOT EXISTS idx_tip_bubbles_others_tip_id_rank
    ON tip_bubbles_others (tip_id, other_rank);

COMMIT;
