-- 007 - Materialized accounts summary (global stats)
-- Use for dashboard-style queries; refresh on a schedule.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'mv_accounts_summary' AND relkind = 'm'
  ) THEN
    EXECUTE 'DROP MATERIALIZED VIEW mv_accounts_summary';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'mv_accounts_summary' AND relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW mv_accounts_summary';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounts'
  ) THEN
    EXECUTE $sql$
      CREATE MATERIALIZED VIEW mv_accounts_summary AS
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
      CREATE MATERIALIZED VIEW mv_accounts_summary AS
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

CREATE UNIQUE INDEX IF NOT EXISTS mv_accounts_summary_account_id_uq
    ON mv_accounts_summary (account_id);

COMMIT;
