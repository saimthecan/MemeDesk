from fastapi import APIRouter, HTTPException, Query
from db import pool
from schemas_coins import CoinCreate, CoinOut

router = APIRouter(prefix="/coins", tags=["coins"])


@router.post("", response_model=CoinOut)
def add_coin(payload: CoinCreate):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            ca = payload.ca.lower()
            try:
                cur.execute(
                    """
                    INSERT INTO coins (ca, name, symbol, chain, launch_ts, source_type)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING ca, name, symbol, chain, launch_ts, source_type, created_ts;
                    """,
                    (
                        ca,
                        payload.name,
                        payload.symbol,
                        payload.chain,
                        payload.launch_ts,
                        payload.source_type,
                    ),
                )
                row = cur.fetchone()
                conn.commit()
            except Exception as e:
                conn.rollback()
                if "coins_ca_key" in str(e):
                    raise HTTPException(status_code=409, detail="Coin already exists")
                raise

    return {
        "ca": row[0],
        "name": row[1],
        "symbol": row[2],
        "chain": row[3],
        "launch_ts": row[4].isoformat() if row[4] else None,
        "source_type": row[5],
        "created_ts": row[6].isoformat() if row[6] else None,
    }


@router.get("/summary")
def coins_summary():
    """One-row-per-coin summary for the UI (counts + latest activity)."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                  c.ca, c.name, c.symbol, c.launch_ts, c.chain, c.source_type, c.created_ts,
                  (SELECT COUNT(*) FROM trades t WHERE t.ca = c.ca) AS trades_total,
                  (SELECT COUNT(*) FROM trades t WHERE t.ca = c.ca AND t.exit_ts IS NULL) AS trades_open,
                  (SELECT COUNT(*) FROM tips x WHERE x.ca = c.ca) AS tips_total,
                  NULLIF(GREATEST(
                    COALESCE((SELECT MAX(entry_ts) FROM trades t WHERE t.ca=c.ca), '-infinity'::timestamptz),
                    COALESCE((SELECT MAX(post_ts) FROM tips x WHERE x.ca=c.ca), '-infinity'::timestamptz)
                  ), '-infinity'::timestamptz) AS last_activity_ts
                FROM coins c
                ORDER BY last_activity_ts DESC NULLS LAST, c.created_ts DESC;
                """
            )
            rows = cur.fetchall()

    return [
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
            "last_activity_ts": r[10].isoformat() if r[10] else None,
        }
        for r in rows
    ]


@router.get("/{ca}", response_model=CoinOut)
@router.get("/{ca}/detail", response_model=CoinOut) # ADDED THIS LINE
def get_coin(ca: str):
    ca = ca.lower()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ca, name, symbol, chain, launch_ts, source_type, created_ts
                FROM coins
                WHERE ca = %s;
                """,
                (ca,),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Coin not found")

    return {
        "ca": row[0],
        "name": row[1],
        "symbol": row[2],
        "chain": row[3],
        "launch_ts": row[4].isoformat() if row[4] else None,
        "source_type": row[5],
        "created_ts": row[6].isoformat() if row[6] else None,
    }


@router.get("", response_model=list[CoinOut])
def list_coins(
    limit: int = Query(default=200, ge=1, le=2000),
    ca: str | None = Query(default=None, min_length=3),
):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if ca:
                cur.execute(
                    """
                    SELECT ca, name, symbol, chain, launch_ts, source_type, created_ts
                    FROM coins
                    WHERE ca = %s;
                    """,
                    (ca.lower(),),
                )
            else:
                cur.execute(
                    """
                    SELECT ca, name, symbol, chain, launch_ts, source_type, created_ts
                    FROM coins
                    ORDER BY created_ts DESC
                    LIMIT %s;
                    """,
                    (limit,),
                )
            rows = cur.fetchall()

    return [
        {
            "ca": r[0],
            "name": r[1],
            "symbol": r[2],
            "chain": r[3],
            "launch_ts": r[4].isoformat() if r[4] else None,
            "source_type": r[5],
            "created_ts": r[6].isoformat() if r[6] else None,
        }
        for r in rows
    ]


@router.delete("/{ca}")
def delete_coin(ca: str):
    """Delete a coin and cascade delete all related data (trades, tips, account_coin_metrics, and their bubbles/scoring)."""
    ca = ca.lower()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # Check if coin exists
            cur.execute("SELECT 1 FROM coins WHERE ca = %s;", (ca,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Coin not found")
            
            # Get all trade_ids for this coin to delete their bubbles/scoring
            cur.execute("SELECT trade_id FROM trades WHERE ca = %s;", (ca,))
            trade_ids = [row[0] for row in cur.fetchall()]
            
            # Get all tip_ids for this coin to delete their bubbles/scoring
            cur.execute("SELECT tip_id FROM tips WHERE ca = %s;", (ca,))
            tip_ids = [row[0] for row in cur.fetchall()]
            
            # Delete trade-specific bubbles and scoring
            for trade_id in trade_ids:
                cur.execute("DELETE FROM trade_bubbles WHERE trade_id = %s;", (trade_id,))
                cur.execute("DELETE FROM trade_bubbles_others WHERE trade_id = %s;", (trade_id,))
                cur.execute("DELETE FROM trade_scoring WHERE trade_id = %s;", (trade_id,))
            
            # Delete tip-specific bubbles and scoring
            for tip_id in tip_ids:
                cur.execute("DELETE FROM tip_bubbles WHERE tip_id = %s;", (tip_id,))
                cur.execute("DELETE FROM tip_bubbles_others WHERE tip_id = %s;", (tip_id,))
                cur.execute("DELETE FROM tip_scoring WHERE tip_id = %s;", (tip_id,))
            
            # Delete account_coin_metrics for this coin (cascade will handle)
            cur.execute("DELETE FROM account_coin_metrics WHERE ca = %s;", (ca,))
            
            # Delete tips (cascade will handle tip_bubbles, tip_bubbles_others, tip_scoring)
            cur.execute("DELETE FROM tips WHERE ca = %s;", (ca,))
            
            # Delete trades (cascade will handle trade_bubbles, trade_bubbles_others, trade_scoring)
            cur.execute("DELETE FROM trades WHERE ca = %s;", (ca,))
            
            # Finally delete the coin
            cur.execute("DELETE FROM coins WHERE ca = %s;", (ca,))
            
            conn.commit()
    
    return {"ok": True, "message": f"Coin {ca} and all related data (trades, tips, account_coin_metrics, bubbles, scoring) deleted"}
