-- 000 - Initial Schema (Temel Tablolar ve Views)
-- Bu migration'ı ilk kez çalıştırırken kullan

BEGIN;

-- coins table
CREATE TABLE IF NOT EXISTS coins (
    ca TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT,
    chain TEXT NOT NULL DEFAULT 'solana',
    launch_ts TIMESTAMPTZ,
    source_type TEXT DEFAULT 'trades',
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

-- social_accounts table
CREATE TABLE IF NOT EXISTS social_accounts (
    account_id SERIAL PRIMARY KEY,
    platform TEXT NOT NULL,
    handle TEXT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_accounts_platform_handle ON social_accounts (platform, handle);

-- trades table
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    trade_id TEXT UNIQUE NOT NULL,
    ca TEXT NOT NULL REFERENCES coins(ca) ON DELETE CASCADE,
    entry_ts TIMESTAMPTZ DEFAULT NOW(),
    entry_mcap_usd FLOAT NOT NULL,
    size_usd FLOAT,
    exit_ts TIMESTAMPTZ,
    exit_mcap_usd FLOAT,
    exit_reason TEXT,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trades_ca ON trades(ca);
CREATE INDEX IF NOT EXISTS idx_trades_entry_ts ON trades(entry_ts);

-- tips table
CREATE TABLE IF NOT EXISTS tips (
    tip_id SERIAL PRIMARY KEY,
    account_id INT NOT NULL REFERENCES social_accounts(account_id),
    ca TEXT NOT NULL REFERENCES coins(ca) ON DELETE CASCADE,
    post_ts TIMESTAMPTZ NOT NULL,
    post_mcap_usd FLOAT NOT NULL,
    peak_mcap_usd FLOAT,
    trough_mcap_usd FLOAT,
    rug_flag INT,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tips_ca ON tips(ca);
CREATE INDEX IF NOT EXISTS idx_tips_post_ts ON tips(post_ts);

-- context table (legacy)
CREATE TABLE IF NOT EXISTS context (
    id INT PRIMARY KEY DEFAULT 1,
    active_ca TEXT,
    updated_ts TIMESTAMPTZ DEFAULT NOW()
);

-- Eski bubbles/scoring tabloları (backward compatibility için)
CREATE TABLE IF NOT EXISTS bubbles_clusters (
    id SERIAL PRIMARY KEY,
    ca TEXT NOT NULL REFERENCES coins(ca) ON DELETE CASCADE,
    cluster_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bubbles_clusters_ca ON bubbles_clusters(ca);

CREATE TABLE IF NOT EXISTS bubbles_others (
    id SERIAL PRIMARY KEY,
    ca TEXT NOT NULL REFERENCES coins(ca) ON DELETE CASCADE,
    other_rank INT NOT NULL,
    pct FLOAT NOT NULL,
    created_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bubbles_others_ca ON bubbles_others(ca);

CREATE TABLE IF NOT EXISTS scoring (
    id SERIAL PRIMARY KEY,
    ca TEXT NOT NULL REFERENCES coins(ca) ON DELETE CASCADE,
    intuition_score INT NOT NULL CHECK (intuition_score >= 1 AND intuition_score <= 10),
    scored_ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scoring_ca ON scoring(ca);

-- Views
DROP VIEW IF EXISTS v_trades_pnl CASCADE;
CREATE VIEW v_trades_pnl AS
SELECT
    t.id,
    t.trade_id,
    t.ca,
    c.name AS coin_name,
    t.entry_ts,
    t.entry_mcap_usd,
    t.size_usd,
    t.exit_ts,
    t.exit_mcap_usd,
    t.exit_reason,
    CASE
        WHEN t.exit_mcap_usd IS NOT NULL AND t.entry_mcap_usd > 0
        THEN ((t.exit_mcap_usd - t.entry_mcap_usd) / t.entry_mcap_usd) * 100
        ELSE NULL
    END AS pnl_pct,
    CASE
        WHEN t.exit_mcap_usd IS NOT NULL AND t.size_usd > 0
        THEN ((t.exit_mcap_usd - t.entry_mcap_usd) / t.entry_mcap_usd) * t.size_usd
        ELSE NULL
    END AS pnl_usd
FROM trades t
JOIN coins c ON t.ca = c.ca;

DROP VIEW IF EXISTS v_tip_gain_loss CASCADE;
CREATE VIEW v_tip_gain_loss AS
SELECT
    t.tip_id,
    t.ca,
    c.name AS coin_name,
    t.account_id,
    sa.platform,
    sa.handle,
    t.post_ts,
    t.post_mcap_usd,
    t.peak_mcap_usd,
    t.trough_mcap_usd,
    t.rug_flag,
    CASE
        WHEN t.peak_mcap_usd IS NOT NULL AND t.post_mcap_usd > 0
        THEN ((t.peak_mcap_usd - t.post_mcap_usd) / t.post_mcap_usd) * 100
        ELSE NULL
    END AS gain_pct,
    CASE
        WHEN t.trough_mcap_usd IS NOT NULL AND t.post_mcap_usd > 0
        THEN ((t.trough_mcap_usd - t.post_mcap_usd) / t.post_mcap_usd) * 100
        ELSE NULL
    END AS drop_pct,
    CASE
        WHEN t.peak_mcap_usd IS NOT NULL AND t.post_mcap_usd > 0
        THEN ((t.peak_mcap_usd - t.post_mcap_usd) / t.post_mcap_usd) * 100
        ELSE NULL
    END AS effect_pct
FROM tips t
JOIN coins c ON t.ca = c.ca
JOIN social_accounts sa ON t.account_id = sa.account_id;

DROP VIEW IF EXISTS v_accounts_summary CASCADE;
CREATE VIEW v_accounts_summary AS
SELECT
    sa.account_id,
    sa.platform,
    sa.handle,
    COUNT(t.tip_id) AS tips_total,
    CASE
        WHEN COUNT(t.tip_id) > 0
        THEN SUM(CASE WHEN v.effect_pct >= 50 THEN 1 ELSE 0 END)::FLOAT / COUNT(t.tip_id)
        ELSE NULL
    END AS win_rate_50p,
    CASE
        WHEN COUNT(t.tip_id) > 0
        THEN SUM(CASE WHEN v.rug_flag = 1 THEN 1 ELSE 0 END)::FLOAT / COUNT(t.tip_id)
        ELSE NULL
    END AS rug_rate,
    AVG(v.effect_pct) AS avg_effect_pct
FROM social_accounts sa
LEFT JOIN tips t ON sa.account_id = t.account_id
LEFT JOIN v_tip_gain_loss v ON t.tip_id = v.tip_id
GROUP BY sa.account_id, sa.platform, sa.handle;

COMMIT;
