-- 005 - Multichain support (chain columns + composite keys)
-- Adds chain to trades/tips and legacy coin-level tables,
-- updates FKs and views to use (chain, ca).

BEGIN;

-- 1) Add chain columns
ALTER TABLE trades ADD COLUMN IF NOT EXISTS chain TEXT;
ALTER TABLE tips ADD COLUMN IF NOT EXISTS chain TEXT;
ALTER TABLE IF EXISTS bubbles_clusters ADD COLUMN IF NOT EXISTS chain TEXT;
ALTER TABLE IF EXISTS bubbles_others ADD COLUMN IF NOT EXISTS chain TEXT;
ALTER TABLE IF EXISTS scoring ADD COLUMN IF NOT EXISTS chain TEXT;
ALTER TABLE IF EXISTS context ADD COLUMN IF NOT EXISTS active_chain TEXT;

-- Optional table: account_coin_metrics (if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'account_coin_metrics'
  ) THEN
    ALTER TABLE account_coin_metrics ADD COLUMN IF NOT EXISTS chain TEXT;
  END IF;
END $$;

-- 2) Backfill chain from coins
UPDATE trades t
SET chain = c.chain
FROM coins c
WHERE t.ca = c.ca AND t.chain IS NULL;

UPDATE tips t
SET chain = c.chain
FROM coins c
WHERE t.ca = c.ca AND t.chain IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bubbles_clusters'
  ) THEN
    UPDATE bubbles_clusters b
    SET chain = c.chain
    FROM coins c
    WHERE b.ca = c.ca AND b.chain IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bubbles_others'
  ) THEN
    UPDATE bubbles_others b
    SET chain = c.chain
    FROM coins c
    WHERE b.ca = c.ca AND b.chain IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scoring'
  ) THEN
    UPDATE scoring s
    SET chain = c.chain
    FROM coins c
    WHERE s.ca = c.ca AND s.chain IS NULL;
  END IF;
END $$;

UPDATE context ctx
SET active_chain = c.chain
FROM coins c
WHERE ctx.active_ca = c.ca AND ctx.active_chain IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'account_coin_metrics'
  ) THEN
    EXECUTE $sql$
      UPDATE account_coin_metrics acm
      SET chain = c.chain
      FROM coins c
      WHERE acm.ca = c.ca AND acm.chain IS NULL;
    $sql$;
  END IF;
END $$;

-- 3) Defaults and NOT NULL
ALTER TABLE trades ALTER COLUMN chain SET DEFAULT 'solana';
ALTER TABLE tips ALTER COLUMN chain SET DEFAULT 'solana';
ALTER TABLE IF EXISTS bubbles_clusters ALTER COLUMN chain SET DEFAULT 'solana';
ALTER TABLE IF EXISTS bubbles_others ALTER COLUMN chain SET DEFAULT 'solana';
ALTER TABLE IF EXISTS scoring ALTER COLUMN chain SET DEFAULT 'solana';

ALTER TABLE trades ALTER COLUMN chain SET NOT NULL;
ALTER TABLE tips ALTER COLUMN chain SET NOT NULL;
ALTER TABLE IF EXISTS bubbles_clusters ALTER COLUMN chain SET NOT NULL;
ALTER TABLE IF EXISTS bubbles_others ALTER COLUMN chain SET NOT NULL;
ALTER TABLE IF EXISTS scoring ALTER COLUMN chain SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'account_coin_metrics'
  ) THEN
    EXECUTE $sql$
      ALTER TABLE account_coin_metrics ALTER COLUMN chain SET DEFAULT 'solana';
      ALTER TABLE account_coin_metrics ALTER COLUMN chain SET NOT NULL;
    $sql$;
  END IF;
END $$;

-- 4) Drop old FKs referencing coins(ca)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname, conrelid::regclass AS table_name
    FROM pg_constraint
    WHERE confrelid = 'coins'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.table_name, r.conname);
  END LOOP;
END $$;

-- 5) Update coins primary key
ALTER TABLE coins DROP CONSTRAINT IF EXISTS coins_pkey;
ALTER TABLE coins ADD CONSTRAINT coins_pkey PRIMARY KEY (chain, ca);

-- 6) Add new composite FKs
ALTER TABLE trades
  ADD CONSTRAINT trades_chain_ca_fkey
  FOREIGN KEY (chain, ca)
  REFERENCES coins(chain, ca)
  ON DELETE CASCADE;

ALTER TABLE tips
  ADD CONSTRAINT tips_chain_ca_fkey
  FOREIGN KEY (chain, ca)
  REFERENCES coins(chain, ca)
  ON DELETE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bubbles_clusters'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bubbles_clusters_chain_ca_fkey'
    ) THEN
      ALTER TABLE bubbles_clusters
        ADD CONSTRAINT bubbles_clusters_chain_ca_fkey
        FOREIGN KEY (chain, ca)
        REFERENCES coins(chain, ca)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bubbles_others'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bubbles_others_chain_ca_fkey'
    ) THEN
      ALTER TABLE bubbles_others
        ADD CONSTRAINT bubbles_others_chain_ca_fkey
        FOREIGN KEY (chain, ca)
        REFERENCES coins(chain, ca)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'scoring'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'scoring_chain_ca_fkey'
    ) THEN
      ALTER TABLE scoring
        ADD CONSTRAINT scoring_chain_ca_fkey
        FOREIGN KEY (chain, ca)
        REFERENCES coins(chain, ca)
        ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'account_coin_metrics'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'account_coin_metrics_chain_ca_fkey'
    ) THEN
      EXECUTE $sql$
        ALTER TABLE account_coin_metrics
          ADD CONSTRAINT account_coin_metrics_chain_ca_fkey
          FOREIGN KEY (chain, ca)
          REFERENCES coins(chain, ca)
          ON DELETE CASCADE;
      $sql$;
    END IF;
  END IF;
END $$;

-- 7) Indexes for multichain filtering
CREATE INDEX IF NOT EXISTS idx_trades_chain_ca_entry_ts
    ON trades (chain, ca, entry_ts DESC);

CREATE INDEX IF NOT EXISTS idx_tips_chain_ca_post_ts
    ON tips (chain, ca, post_ts DESC);

-- 8) Views (join on chain)
DROP VIEW IF EXISTS v_trades_pnl CASCADE;
CREATE VIEW v_trades_pnl AS
SELECT
    t.id,
    t.trade_id,
    t.ca,
    t.chain,
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
JOIN coins c ON t.ca = c.ca AND t.chain = c.chain;

DROP VIEW IF EXISTS v_tip_gain_loss CASCADE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts'
  ) THEN
    EXECUTE $sql$
      CREATE VIEW v_tip_gain_loss AS
      SELECT
          t.tip_id,
          t.ca,
          t.chain,
          c.name AS coin_name,
          t.account_id,
          a.platform,
          a.handle,
          t.post_ts,
          t.post_mcap_usd,
          t.peak_mcap_usd,
          t.trough_mcap_usd,
          t.rug_flag::int AS rug_flag,
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
      JOIN coins c ON t.ca = c.ca AND t.chain = c.chain
      JOIN accounts a ON t.account_id = a.account_id;
    $sql$;
  ELSE
    EXECUTE $sql$
      CREATE VIEW v_tip_gain_loss AS
      SELECT
          t.tip_id,
          t.ca,
          t.chain,
          c.name AS coin_name,
          t.account_id,
          sa.platform,
          sa.handle,
          t.post_ts,
          t.post_mcap_usd,
          t.peak_mcap_usd,
          t.trough_mcap_usd,
          t.rug_flag::int AS rug_flag,
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
      JOIN coins c ON t.ca = c.ca AND t.chain = c.chain
      JOIN social_accounts sa ON t.account_id = sa.account_id;
    $sql$;
  END IF;
END $$;

DROP VIEW IF EXISTS v_accounts_summary CASCADE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts'
  ) THEN
    EXECUTE $sql$
      CREATE VIEW v_accounts_summary AS
      SELECT
          a.account_id,
          a.platform,
          a.handle,
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
      FROM accounts a
      LEFT JOIN tips t ON a.account_id = t.account_id
      LEFT JOIN v_tip_gain_loss v ON t.tip_id = v.tip_id
      GROUP BY a.account_id, a.platform, a.handle;
    $sql$;
  ELSE
    EXECUTE $sql$
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
    $sql$;
  END IF;
END $$;

COMMIT;
