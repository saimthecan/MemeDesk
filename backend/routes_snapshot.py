from fastapi import APIRouter, Query
from db import pool


router = APIRouter(tags=["snapshot"])


@router.get("/assistant_snapshot")
def assistant_snapshot(
    ca: str | None = Query(default=None, min_length=3),
    limit: int = Query(default=200, ge=1, le=2000),
):
    """Returns a JSON bundle that you can copy-paste to ChatGPT.

    - If `ca` is omitted: returns a global view (coins summary + recent trades/tips + accounts).
    - If `ca` is provided: returns ONLY coin_detail for that coin (all trades/tips with their own bubbles + scoring).
    """

    snap: dict = {}

    with pool.connection() as conn:
        with conn.cursor() as cur:
            # If CA is provided, return ONLY coin_detail
            if ca:
                # coin trades with their own bubbles and scoring
                cur.execute(
                    """
                    SELECT
                      id, trade_id, ca, coin_name,
                      entry_ts, entry_mcap_usd, size_usd,
                      exit_ts, exit_mcap_usd, exit_reason,
                      pnl_pct, pnl_usd
                    FROM v_trades_pnl
                    WHERE LOWER(ca) = LOWER(%s)
                    ORDER BY entry_ts DESC;
                    """,
                    (ca,),
                )
                coin_trades_raw = cur.fetchall()
                coin_trades = []
                
                for r in coin_trades_raw:
                    trade_id = r[1]
                    
                    # Get bubbles for this trade
                    cur.execute(
                        "SELECT cluster_rank, pct FROM trade_bubbles WHERE trade_id = %s ORDER BY cluster_rank ASC;",
                        (trade_id,),
                    )
                    clusters = [{"rank": b[0], "pct": float(b[1])} for b in cur.fetchall()]
                    
                    cur.execute(
                        "SELECT other_rank, pct FROM trade_bubbles_others WHERE trade_id = %s ORDER BY other_rank ASC;",
                        (trade_id,),
                    )
                    others = [{"rank": b[0], "pct": float(b[1])} for b in cur.fetchall()]
                    
                    # Get scoring for this trade
                    cur.execute(
                        "SELECT intuition_score FROM trade_scoring WHERE trade_id = %s ORDER BY scored_ts DESC LIMIT 1;",
                        (trade_id,),
                    )
                    score_row = cur.fetchone()
                    intuition_score = score_row[0] if score_row else None
                    
                    coin_trades.append({
                        "id": r[0],
                        "trade_id": r[1],
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
                    WHERE LOWER(ca) = LOWER(%s)
                    ORDER BY post_ts DESC;
                    """,
                    (ca,),
                )
                coin_tips_raw = cur.fetchall()
                coin_tips = []
                
                for r in coin_tips_raw:
                    tip_id = r[0]
                    
                    # Get bubbles for this tip
                    cur.execute(
                        "SELECT cluster_rank, pct FROM tip_bubbles WHERE tip_id = %s ORDER BY cluster_rank ASC;",
                        (tip_id,),
                    )
                    clusters = [{"rank": b[0], "pct": float(b[1])} for b in cur.fetchall()]
                    
                    cur.execute(
                        "SELECT other_rank, pct FROM tip_bubbles_others WHERE tip_id = %s ORDER BY other_rank ASC;",
                        (tip_id,),
                    )
                    others = [{"rank": b[0], "pct": float(b[1])} for b in cur.fetchall()]
                    
                    # Get scoring for this tip
                    cur.execute(
                        "SELECT intuition_score FROM tip_scoring WHERE tip_id = %s ORDER BY scored_ts DESC LIMIT 1;",
                        (tip_id,),
                    )
                    score_row = cur.fetchone()
                    intuition_score = score_row[0] if score_row else None
                    
                    coin_tips.append({
                        "tip_id": r[0],
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
                    "trades": coin_trades,
                    "tips": coin_tips,
                }
                return snap

            # If CA is NOT provided, return GLOBAL view (no coin_detail)
            # --- Coins summary ---
            cur.execute(
                """
                SELECT
                  c.ca, c.name, c.symbol, c.launch_ts, c.source_type, c.created_ts,
                  (SELECT COUNT(*) FROM trades t WHERE t.ca = c.ca) AS trades_total,
                  (SELECT COUNT(*) FROM trades t WHERE t.ca = c.ca AND t.exit_ts IS NULL) AS trades_open,
                  (SELECT COUNT(*) FROM tips x WHERE x.ca = c.ca) AS tips_total
                FROM coins c
                ORDER BY c.created_ts DESC;
                """
            )
            coins = cur.fetchall()
            snap["coins"] = [
                {
                    "ca": r[0],
                    "name": r[1],
                    "symbol": r[2],
                    "launch_ts": r[3].isoformat() if r[3] else None,
                    "source_type": r[4],
                    "created_ts": r[5].isoformat() if r[5] else None,
                    "trades_total": int(r[6]),
                    "trades_open": int(r[7]),
                    "tips_total": int(r[8]),
                }
                for r in coins
            ]

            # --- Recent trades (global) with their own bubbles and scoring ---
            cur.execute(
                """
                SELECT
                  id, trade_id, ca, coin_name,
                  entry_ts, entry_mcap_usd, size_usd,
                  exit_ts, exit_mcap_usd, exit_reason,
                  pnl_pct, pnl_usd
                FROM v_trades_pnl
                ORDER BY entry_ts DESC
                LIMIT %s;
                """,
                (limit,),
            )
            trades = cur.fetchall()
            snap["trades_recent"] = []
            
            for r in trades:
                trade_id = r[1]
                
                # Get bubbles for this trade
                cur.execute(
                    "SELECT cluster_rank, pct FROM trade_bubbles WHERE trade_id = %s ORDER BY cluster_rank ASC;",
                    (trade_id,),
                )
                clusters = [{"rank": b[0], "pct": float(b[1])} for b in cur.fetchall()]
                
                cur.execute(
                    "SELECT other_rank, pct FROM trade_bubbles_others WHERE trade_id = %s ORDER BY other_rank ASC;",
                    (trade_id,),
                )
                others = [{"rank": b[0], "pct": float(b[1])} for b in cur.fetchall()]
                
                # Get scoring for this trade
                cur.execute(
                    "SELECT intuition_score FROM trade_scoring WHERE trade_id = %s ORDER BY scored_ts DESC LIMIT 1;",
                    (trade_id,),
                )
                score_row = cur.fetchone()
                intuition_score = score_row[0] if score_row else None
                
                snap["trades_recent"].append({
                    "id": r[0],
                    "trade_id": r[1],
                    "ca": r[2],
                    "coin_name": r[3],
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

            # --- Accounts summary (global) from v_accounts_summary ---
            cur.execute(
                """
                SELECT account_id, platform, handle, tips_total, win_rate_50p, rug_rate, avg_effect_pct
                FROM v_accounts_summary
                ORDER BY tips_total DESC, avg_effect_pct DESC NULLS LAST;
                """
            )
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
            cur.execute(
                """
                SELECT
                  tip_id, ca, coin_name, account_id, platform, handle,
                  post_ts, post_mcap_usd, peak_mcap_usd, trough_mcap_usd, rug_flag,
                  gain_pct, drop_pct, effect_pct
                FROM v_tip_gain_loss
                ORDER BY post_ts DESC
                LIMIT %s;
                """,
                (limit,),
            )
            tips = cur.fetchall()
            snap["tips_recent"] = []
            
            for r in tips:
                tip_id = r[0]
                
                # Get bubbles for this tip
                cur.execute(
                    "SELECT cluster_rank, pct FROM tip_bubbles WHERE tip_id = %s ORDER BY cluster_rank ASC;",
                    (tip_id,),
                )
                clusters = [{"rank": b[0], "pct": float(b[1])} for b in cur.fetchall()]
                
                cur.execute(
                    "SELECT other_rank, pct FROM tip_bubbles_others WHERE tip_id = %s ORDER BY other_rank ASC;",
                    (tip_id,),
                )
                others = [{"rank": b[0], "pct": float(b[1])} for b in cur.fetchall()]
                
                # Get scoring for this tip
                cur.execute(
                    "SELECT intuition_score FROM tip_scoring WHERE tip_id = %s ORDER BY scored_ts DESC LIMIT 1;",
                    (tip_id,),
                )
                score_row = cur.fetchone()
                intuition_score = score_row[0] if score_row else None
                
                snap["tips_recent"].append({
                    "tip_id": r[0],
                    "ca": r[1],
                    "coin_name": r[2],
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

    return snap
