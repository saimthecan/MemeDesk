-- 003 - Move bubbles and scoring from coin-level to trade/tip-level
-- This migration creates new tables for trade-specific and tip-specific bubbles and scoring data.

BEGIN;

-- Create trade_bubbles table
CREATE TABLE IF NOT EXISTS trade_bubbles (
    id SERIAL PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades(trade_id) ON DELETE CASCADE,
    cluster_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_bubbles_trade_id ON trade_bubbles(trade_id);

-- Create trade_bubbles_others table
CREATE TABLE IF NOT EXISTS trade_bubbles_others (
    id SERIAL PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades(trade_id) ON DELETE CASCADE,
    other_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_bubbles_others_trade_id ON trade_bubbles_others(trade_id);

-- Create trade_scoring table
CREATE TABLE IF NOT EXISTS trade_scoring (
    id SERIAL PRIMARY KEY,
    trade_id TEXT NOT NULL REFERENCES trades(trade_id) ON DELETE CASCADE,
    intuition_score INT NOT NULL CHECK (intuition_score >= 1 AND intuition_score <= 10),
    scored_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_scoring_trade_id ON trade_scoring(trade_id);

-- Create tip_bubbles table
CREATE TABLE IF NOT EXISTS tip_bubbles (
    id SERIAL PRIMARY KEY,
    tip_id INT NOT NULL REFERENCES tips(tip_id) ON DELETE CASCADE,
    cluster_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tip_bubbles_tip_id ON tip_bubbles(tip_id);

-- Create tip_bubbles_others table
CREATE TABLE IF NOT EXISTS tip_bubbles_others (
    id SERIAL PRIMARY KEY,
    tip_id INT NOT NULL REFERENCES tips(tip_id) ON DELETE CASCADE,
    other_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tip_bubbles_others_tip_id ON tip_bubbles_others(tip_id);

-- Create tip_scoring table
CREATE TABLE IF NOT EXISTS tip_scoring (
    id SERIAL PRIMARY KEY,
    tip_id INT NOT NULL REFERENCES tips(tip_id) ON DELETE CASCADE,
    intuition_score INT NOT NULL CHECK (intuition_score >= 1 AND intuition_score <= 10),
    scored_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tip_scoring_tip_id ON tip_scoring(tip_id);

-- Optional: Migrate old data if you want to preserve it
-- Uncomment these lines if you want to keep the old data associated with the first trade/tip of each coin
/*
-- Migrate bubbles_clusters to trade_bubbles (for the first trade of each coin)
INSERT INTO trade_bubbles (trade_id, cluster_rank, pct)
SELECT DISTINCT ON (t.ca) t.trade_id, bc.cluster_rank, bc.pct
FROM trades t
JOIN bubbles_clusters bc ON t.ca = bc.ca
ORDER BY t.ca, t.entry_ts ASC;

-- Migrate bubbles_others to trade_bubbles_others (for the first trade of each coin)
INSERT INTO trade_bubbles_others (trade_id, other_rank, pct)
SELECT DISTINCT ON (t.ca) t.trade_id, bo.other_rank, bo.pct
FROM trades t
JOIN bubbles_others bo ON t.ca = bo.ca
ORDER BY t.ca, t.entry_ts ASC;

-- Migrate scoring to trade_scoring (for the first trade of each coin)
INSERT INTO trade_scoring (trade_id, intuition_score, scored_ts)
SELECT DISTINCT ON (t.ca) t.trade_id, s.intuition_score, s.scored_ts
FROM trades t
JOIN scoring s ON t.ca = s.ca
ORDER BY t.ca, t.entry_ts ASC;
*/

-- Note: The old tables (bubbles_clusters, bubbles_others, scoring) are kept for now
-- You can drop them manually after verifying the migration:
-- DROP TABLE bubbles_clusters;
-- DROP TABLE bubbles_others;
-- DROP TABLE scoring;

COMMIT;
