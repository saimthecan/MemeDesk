from fastapi import APIRouter, HTTPException, Query
from ..db import pool


router = APIRouter(tags=["snapshot"])


def _accounts_table(cur) -> str:
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts';"
    )
    return "accounts" if cur.fetchone() else "social_accounts"


def _has_matview(cur, name: str) -> bool:
    cur.execute(
        "SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = %s;",
        (name,),
    )
    return cur.fetchone() is not None


@router.get("/assistant_snapshot")
def assistant_snapshot(
    ca: str | None = Query(default=None, min_length=3),
    chain: str | None = None,
    limit: int = Query(default=200, ge=1, le=2000),
):
    """Returns a JSON bundle that you can copy-paste to ChatGPT.

    - If `ca` is omitted: returns a global view (coins summary + recent trades/tips + accounts).
    - If `ca` is provided: returns ONLY coin_detail for that coin (all trades/tips with their own bubbles + scoring).
    """

    snap: dict = {}

    with pool.connection() as conn:
        with conn.cursor() as cur:
            if chain:
                chain = chain.lower()
            # If CA is provided, return ONLY coin_detail
            if ca:
                ca = ca.lower()
                if not chain:
                    cur.execute("SELECT chain FROM coins WHERE ca = %s LIMIT 2;", (ca,))
                    rows = cur.fetchall()
                    if not rows:
                        raise HTTPException(status_code=404, detail="Coin not found")
                    if len(rows) > 1:
                        raise HTTPException(status_code=409, detail="Multiple chains found for this CA")
                    chain = rows[0][0]

                # coin trades with their own bubbles and scoring
                cur.execute(
                    """
                    SELECT
                      id, trade_id, ca, coin_name,
                      entry_ts, entry_mcap_usd, size_usd,
                      exit_ts, exit_mcap_usd, exit_reason,
                      pnl_pct, pnl_usd
                    FROM v_trades_pnl
                    WHERE ca = %s AND chain = %s
                    ORDER BY entry_ts DESC;
                    """,
                    (ca, chain),
                )
                coin_trades_raw = cur.fetchall()
                coin_trades = []
                trade_ids = [r[1] for r in coin_trades_raw]
                clusters_by_trade: dict[str, list[dict]] = {}
                others_by_trade: dict[str, list[dict]] = {}
                scoring_by_trade: dict[str, int] = {}

                if trade_ids:
                    cur.execute(
                        """
                        SELECT trade_id, cluster_rank, pct
                        FROM trade_bubbles
                        WHERE trade_id = ANY(%s)
                        ORDER BY trade_id ASC, cluster_rank ASC;
                        """,
                        (trade_ids,),
                    )
                    for trade_id, rank, pct in cur.fetchall():
                        clusters_by_trade.setdefault(trade_id, []).append(
                            {"rank": rank, "pct": float(pct)}
                        )

                    cur.execute(
                        """
                        SELECT trade_id, other_rank, pct
                        FROM trade_bubbles_others
                        WHERE trade_id = ANY(%s)
                        ORDER BY trade_id ASC, other_rank ASC;
                        """,
                        (trade_ids,),
                    )
                    for trade_id, rank, pct in cur.fetchall():
                        others_by_trade.setdefault(trade_id, []).append(
                            {"rank": rank, "pct": float(pct)}
                        )

                    cur.execute(
                        """
                        SELECT DISTINCT ON (trade_id) trade_id, intuition_score
                        FROM trade_scoring
                        WHERE trade_id = ANY(%s)
                        ORDER BY trade_id ASC, scored_ts DESC;
                        """,
                        (trade_ids,),
                    )
                    for trade_id, score in cur.fetchall():
                        scoring_by_trade[trade_id] = score

                for r in coin_trades_raw:
                    trade_id = r[1]
                    clusters = clusters_by_trade.get(trade_id, [])
                    others = others_by_trade.get(trade_id, [])
                    intuition_score = scoring_by_trade.get(trade_id)

                    coin_trades.append({
                        "id": r[0],
                        "trade_id": r[1],
                        "chain": chain,
                        "entry_ts": r[4].isoformat() if r[4] else None,
                        "entry_mcap_usd": float(r[5]) if r[5] is not None else None,
                        "size_usd": float(r[6]) if r[6] is not None else None,
                        "exit_ts": r[7].isoformat() if r[7] else None,
                        "exit_mcap_usd": float(r[8]) if r[8] is not None else None,
                        "exit_reason": r[9],
                        "pnl_pct": float(r[10]) if r[10] is not None else None,
                        "pnl_usd": float(r[11]) if r[11] is not None else None,
                        "bubbles": {"clusters": clusters, "others": others},
                        "scoring": {"intuition_score": intuition_score},
                    })

                # coin tips with their own bubbles and scoring
                cur.execute(
                    """
                    SELECT
                      tip_id, ca, coin_name, account_id, platform, handle,
                      post_ts, post_mcap_usd, peak_mcap_usd, trough_mcap_usd, rug_flag,
                      gain_pct, drop_pct, effect_pct
                    FROM v_tip_gain_loss
                    WHERE ca = %s AND chain = %s
                    ORDER BY post_ts DESC;
                    """,
                    (ca, chain),
                )
                coin_tips_raw = cur.fetchall()
                coin_tips = []
                tip_ids = [r[0] for r in coin_tips_raw]
                clusters_by_tip: dict[int, list[dict]] = {}
                others_by_tip: dict[int, list[dict]] = {}
                scoring_by_tip: dict[int, int] = {}

                if tip_ids:
                    cur.execute(
                        """
                        SELECT tip_id, cluster_rank, pct
                        FROM tip_bubbles
                        WHERE tip_id = ANY(%s)
                        ORDER BY tip_id ASC, cluster_rank ASC;
                        """,
                        (tip_ids,),
                    )
                    for tip_id, rank, pct in cur.fetchall():
                        clusters_by_tip.setdefault(tip_id, []).append(
                            {"rank": rank, "pct": float(pct)}
                        )

                    cur.execute(
                        """
                        SELECT tip_id, other_rank, pct
                        FROM tip_bubbles_others
                        WHERE tip_id = ANY(%s)
                        ORDER BY tip_id ASC, other_rank ASC;
                        """,
                        (tip_ids,),
                    )
                    for tip_id, rank, pct in cur.fetchall():
                        others_by_tip.setdefault(tip_id, []).append(
                            {"rank": rank, "pct": float(pct)}
                        )

                    cur.execute(
                        """
                        SELECT DISTINCT ON (tip_id) tip_id, intuition_score
                        FROM tip_scoring
                        WHERE tip_id = ANY(%s)
                        ORDER BY tip_id ASC, scored_ts DESC;
                        """,
                        (tip_ids,),
                    )
                    for tip_id, score in cur.fetchall():
                        scoring_by_tip[tip_id] = score

                for r in coin_tips_raw:
                    tip_id = r[0]
                    clusters = clusters_by_tip.get(tip_id, [])
                    others = others_by_tip.get(tip_id, [])
                    intuition_score = scoring_by_tip.get(tip_id)

                    coin_tips.append({
                        "tip_id": r[0],
                        "chain": chain,
                        "account_id": r[3],
                        "platform": r[4],
                        "handle": r[5],
                        "post_ts": r[6].isoformat() if r[6] else None,
                        "post_mcap_usd": float(r[7]) if r[7] is not None else None,
                        "peak_mcap_usd": float(r[8]) if r[8] is not None else None,
                        "trough_mcap_usd": float(r[9]) if r[9] is not None else None,
                        "rug_flag": r[10],
                        "gain_pct": float(r[11]) if r[11] is not None else None,
                        "drop_pct": float(r[12]) if r[12] is not None else None,
                        "effect_pct": float(r[13]) if r[13] is not None else None,
                        "bubbles": {"clusters": clusters, "others": others},
                        "scoring": {"intuition_score": intuition_score},
                    })

                snap["coin_detail"] = {
                    "ca": ca,
                    "chain": chain,
                    "trades": coin_trades,
                    "tips": coin_tips,
                }
                return snap

            # If CA is NOT provided, return GLOBAL view (no coin_detail)
            # --- Coins summary ---
            sql = """
                SELECT
                  c.ca, c.name, c.symbol, c.launch_ts, c.chain, c.source_type, c.created_ts,
                  COALESCE(t.trades_total, 0) AS trades_total,
                  COALESCE(t.trades_open, 0) AS trades_open,
                  COALESCE(x.tips_total, 0) AS tips_total
                FROM coins c
                LEFT JOIN LATERAL (
                  SELECT
                    COUNT(*) AS trades_total,
                    COUNT(*) FILTER (WHERE exit_ts IS NULL) AS trades_open
                  FROM trades
                  WHERE trades.ca = c.ca AND trades.chain = c.chain
                ) t ON true
                LEFT JOIN LATERAL (
                  SELECT
                    COUNT(*) AS tips_total
                  FROM tips
                  WHERE tips.ca = c.ca AND tips.chain = c.chain
                ) x ON true
            """
            params = []
            if chain:
                sql += " WHERE c.chain = %s"
                params.append(chain)
            sql += " ORDER BY c.created_ts DESC;"
            cur.execute(sql, tuple(params))
            coins = cur.fetchall()
            snap["coins"] = [
                {
                    "ca": r[0],
                    "name": r[1],
                    "symbol": r[2],
                    "launch_ts": r[3].isoformat() if r[3] else None,
                    "chain": r[4],
                    "source_type": r[5],
                    "created_ts": r[6].isoformat() if r[6] else None,
                    "trades_total": int(r[7]),
                    "trades_open": int(r[8]),
                    "tips_total": int(r[9]),
                }
                for r in coins
            ]

            # --- Recent trades (global) with their own bubbles and scoring ---
            sql = """
                SELECT
                  id, trade_id, ca, chain, coin_name,
                  entry_ts, entry_mcap_usd, size_usd,
                  exit_ts, exit_mcap_usd, exit_reason,
                  pnl_pct, pnl_usd
                FROM v_trades_pnl
            """
            params = []
            if chain:
                sql += " WHERE chain = %s"
                params.append(chain)
            sql += " ORDER BY entry_ts DESC LIMIT %s;"
            params.append(limit)
            cur.execute(sql, tuple(params))
            trades = cur.fetchall()
            snap["trades_recent"] = []
            trade_ids = [r[1] for r in trades]
            clusters_by_trade: dict[str, list[dict]] = {}
            others_by_trade: dict[str, list[dict]] = {}
            scoring_by_trade: dict[str, int] = {}

            if trade_ids:
                cur.execute(
                    """
                    SELECT trade_id, cluster_rank, pct
                    FROM trade_bubbles
                    WHERE trade_id = ANY(%s)
                    ORDER BY trade_id ASC, cluster_rank ASC;
                    """,
                    (trade_ids,),
                )
                for trade_id, rank, pct in cur.fetchall():
                    clusters_by_trade.setdefault(trade_id, []).append(
                        {"rank": rank, "pct": float(pct)}
                    )

                cur.execute(
                    """
                    SELECT trade_id, other_rank, pct
                    FROM trade_bubbles_others
                    WHERE trade_id = ANY(%s)
                    ORDER BY trade_id ASC, other_rank ASC;
                    """,
                    (trade_ids,),
                )
                for trade_id, rank, pct in cur.fetchall():
                    others_by_trade.setdefault(trade_id, []).append(
                        {"rank": rank, "pct": float(pct)}
                    )

                cur.execute(
                    """
                    SELECT DISTINCT ON (trade_id) trade_id, intuition_score
                    FROM trade_scoring
                    WHERE trade_id = ANY(%s)
                    ORDER BY trade_id ASC, scored_ts DESC;
                    """,
                    (trade_ids,),
                )
                for trade_id, score in cur.fetchall():
                    scoring_by_trade[trade_id] = score

            for r in trades:
                trade_id = r[1]
                clusters = clusters_by_trade.get(trade_id, [])
                others = others_by_trade.get(trade_id, [])
                intuition_score = scoring_by_trade.get(trade_id)

                snap["trades_recent"].append({
                    "id": r[0],
                    "trade_id": r[1],
                    "ca": r[2],
                    "chain": r[3],
                    "coin_name": r[4],
                    "entry_ts": r[5].isoformat() if r[5] else None,
                    "entry_mcap_usd": float(r[6]) if r[6] is not None else None,
                    "size_usd": float(r[7]) if r[7] is not None else None,
                    "exit_ts": r[8].isoformat() if r[8] else None,
                    "exit_mcap_usd": float(r[9]) if r[9] is not None else None,
                    "exit_reason": r[10],
                    "pnl_pct": float(r[11]) if r[11] is not None else None,
                    "pnl_usd": float(r[12]) if r[12] is not None else None,
                    "bubbles": {"clusters": clusters, "others": others},
                    "scoring": {"intuition_score": intuition_score},
                })

            # --- Accounts summary (global) ---
            if not chain and _has_matview(cur, "mv_accounts_summary"):
                cur.execute(
                    """
                    SELECT
                      account_id,
                      platform,
                      handle,
                      tips_total,
                      win_rate_50p,
                      rug_rate,
                      avg_effect_pct
                    FROM mv_accounts_summary
                    ORDER BY tips_total DESC, avg_effect_pct DESC NULLS LAST;
                    """
                )
            else:
                accounts_table = _accounts_table(cur)
                sql = f"""
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
                    FROM {accounts_table} a
                    LEFT JOIN tips t ON a.account_id = t.account_id
                    LEFT JOIN v_tip_gain_loss v ON t.tip_id = v.tip_id
                """
                params = []
                if chain:
                    sql += " WHERE t.chain = %s"
                    params.append(chain)
                sql += " GROUP BY a.account_id, a.platform, a.handle"
                sql += " ORDER BY tips_total DESC, avg_effect_pct DESC NULLS LAST;"
                cur.execute(sql, tuple(params))
            accs = cur.fetchall()
            snap["accounts"] = [
                {
                    "account_id": r[0],
                    "platform": r[1],
                    "handle": r[2],
                    "tips_total": int(r[3]) if r[3] else 0,
                    "win_rate_50p": float(r[4]) if r[4] is not None else None,
                    "rug_rate": float(r[5]) if r[5] is not None else None,
                    "avg_effect_pct": float(r[6]) if r[6] is not None else None,
                }
                for r in accs
            ]

            # --- Recent tips (global) with their own bubbles and scoring ---
            sql = """
                SELECT
                  tip_id, ca, chain, coin_name, account_id, platform, handle,
                  post_ts, post_mcap_usd, peak_mcap_usd, trough_mcap_usd, rug_flag,
                  gain_pct, drop_pct, effect_pct
                FROM v_tip_gain_loss
            """
            params = []
            if chain:
                sql += " WHERE chain = %s"
                params.append(chain)
            sql += " ORDER BY post_ts DESC LIMIT %s;"
            params.append(limit)
            cur.execute(sql, tuple(params))
            tips = cur.fetchall()
            snap["tips_recent"] = []
            tip_ids = [r[0] for r in tips]
            clusters_by_tip: dict[int, list[dict]] = {}
            others_by_tip: dict[int, list[dict]] = {}
            scoring_by_tip: dict[int, int] = {}

            if tip_ids:
                cur.execute(
                    """
                    SELECT tip_id, cluster_rank, pct
                    FROM tip_bubbles
                    WHERE tip_id = ANY(%s)
                    ORDER BY tip_id ASC, cluster_rank ASC;
                    """,
                    (tip_ids,),
                )
                for tip_id, rank, pct in cur.fetchall():
                    clusters_by_tip.setdefault(tip_id, []).append(
                        {"rank": rank, "pct": float(pct)}
                    )

                cur.execute(
                    """
                    SELECT tip_id, other_rank, pct
                    FROM tip_bubbles_others
                    WHERE tip_id = ANY(%s)
                    ORDER BY tip_id ASC, other_rank ASC;
                    """,
                    (tip_ids,),
                )
                for tip_id, rank, pct in cur.fetchall():
                    others_by_tip.setdefault(tip_id, []).append(
                        {"rank": rank, "pct": float(pct)}
                    )

                cur.execute(
                    """
                    SELECT DISTINCT ON (tip_id) tip_id, intuition_score
                    FROM tip_scoring
                    WHERE tip_id = ANY(%s)
                    ORDER BY tip_id ASC, scored_ts DESC;
                    """,
                    (tip_ids,),
                )
                for tip_id, score in cur.fetchall():
                    scoring_by_tip[tip_id] = score

            for r in tips:
                tip_id = r[0]
                clusters = clusters_by_tip.get(tip_id, [])
                others = others_by_tip.get(tip_id, [])
                intuition_score = scoring_by_tip.get(tip_id)

                snap["tips_recent"].append({
                    "tip_id": r[0],
                    "ca": r[1],
                    "chain": r[2],
                    "coin_name": r[3],
                    "account_id": r[4],
                    "platform": r[5],
                    "handle": r[6],
                    "post_ts": r[7].isoformat() if r[7] else None,
                    "post_mcap_usd": float(r[8]) if r[8] is not None else None,
                    "peak_mcap_usd": float(r[9]) if r[9] is not None else None,
                    "trough_mcap_usd": float(r[10]) if r[10] is not None else None,
                    "rug_flag": r[11],
                    "gain_pct": float(r[12]) if r[12] is not None else None,
                    "drop_pct": float(r[13]) if r[13] is not None else None,
                    "effect_pct": float(r[14]) if r[14] is not None else None,
                    "bubbles": {"clusters": clusters, "others": others},
                    "scoring": {"intuition_score": intuition_score},
                })

    return snap
