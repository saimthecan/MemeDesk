from fastapi import APIRouter, HTTPException, Query
from ..db import pool
from ..schemas.coins import CoinCreate, CoinOut

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
                if "coins_ca_key" in str(e) or "coins_pkey" in str(e) or "uq_coins_chain_ca" in str(e):
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
def coins_summary(chain: str | None = None):
    """One-row-per-coin summary for the UI (counts + latest activity)."""
    if chain:
        chain = chain.lower()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            sql = """
                SELECT
                  c.ca, c.name, c.symbol, c.launch_ts, c.chain, c.source_type, c.created_ts,
                  COALESCE(t.trades_total, 0) AS trades_total,
                  COALESCE(t.trades_open, 0) AS trades_open,
                  COALESCE(x.tips_total, 0) AS tips_total,
                  NULLIF(GREATEST(
                    COALESCE(t.last_trade_ts, '-infinity'::timestamptz),
                    COALESCE(x.last_tip_ts, '-infinity'::timestamptz)
                  ), '-infinity'::timestamptz) AS last_activity_ts
                FROM coins c
                LEFT JOIN LATERAL (
                  SELECT
                    COUNT(*) AS trades_total,
                    COUNT(*) FILTER (WHERE exit_ts IS NULL) AS trades_open,
                    MAX(entry_ts) AS last_trade_ts
                  FROM trades
                  WHERE trades.ca = c.ca AND trades.chain = c.chain
                ) t ON true
                LEFT JOIN LATERAL (
                  SELECT
                    COUNT(*) AS tips_total,
                    MAX(post_ts) AS last_tip_ts
                  FROM tips
                  WHERE tips.ca = c.ca AND tips.chain = c.chain
                ) x ON true
            """
            params = []
            if chain:
                sql += " WHERE c.chain = %s"
                params.append(chain)
            sql += " ORDER BY last_activity_ts DESC NULLS LAST, c.created_ts DESC;"
            cur.execute(sql, tuple(params))
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
def get_coin(ca: str, chain: str | None = None):
    ca = ca.lower()
    if chain:
        chain = chain.lower()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if chain:
                cur.execute(
                    """
                    SELECT ca, name, symbol, chain, launch_ts, source_type, created_ts
                    FROM coins
                    WHERE ca = %s AND chain = %s;
                    """,
                    (ca, chain),
                )
                row = cur.fetchone()
                if row is None:
                    raise HTTPException(status_code=404, detail="Coin not found")
            else:
                cur.execute(
                    """
                    SELECT ca, name, symbol, chain, launch_ts, source_type, created_ts
                    FROM coins
                    WHERE ca = %s
                    LIMIT 2;
                    """,
                    (ca,),
                )
                rows = cur.fetchall()
                if not rows:
                    raise HTTPException(status_code=404, detail="Coin not found")
                if len(rows) > 1:
                    raise HTTPException(status_code=409, detail="Multiple chains found for this CA")
                row = rows[0]

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
    chain: str | None = Query(default=None, min_length=2),
):
    if ca:
        ca = ca.lower()
    if chain:
        chain = chain.lower()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            if ca:
                sql = """
                    SELECT ca, name, symbol, chain, launch_ts, source_type, created_ts
                    FROM coins
                    WHERE ca = %s
                """
                params = [ca]
                if chain:
                    sql += " AND chain = %s"
                    params.append(chain)
                sql += ";"
                cur.execute(sql, tuple(params))
            else:
                sql = """
                    SELECT ca, name, symbol, chain, launch_ts, source_type, created_ts
                    FROM coins
                """
                params = []
                if chain:
                    sql += " WHERE chain = %s"
                    params.append(chain)
                sql += " ORDER BY created_ts DESC LIMIT %s;"
                params.append(limit)
                cur.execute(sql, tuple(params))
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
def delete_coin(ca: str, chain: str | None = None):
    """Delete a coin and related data (FK cascades handle trades/tips and bubbles/scoring)."""
    ca = ca.lower()
    if chain:
        chain = chain.lower()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # Check if coin exists
            if chain:
                cur.execute("SELECT 1 FROM coins WHERE ca = %s AND chain = %s;", (ca, chain))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Coin not found")
            else:
                cur.execute("SELECT chain FROM coins WHERE ca = %s LIMIT 2;", (ca,))
                rows = cur.fetchall()
                if not rows:
                    raise HTTPException(status_code=404, detail="Coin not found")
                if len(rows) > 1:
                    raise HTTPException(status_code=409, detail="Multiple chains found for this CA")
                chain = rows[0][0]

            # Delete account_coin_metrics for this coin (if present)
            cur.execute(
                "DELETE FROM account_coin_metrics WHERE ca = %s AND chain = %s;",
                (ca, chain),
            )

            # Delete the coin; FK cascades clean related rows
            cur.execute("DELETE FROM coins WHERE ca = %s AND chain = %s;", (ca, chain))
            
            conn.commit()
    
    return {
        "ok": True,
        "message": f"Coin {ca} ({chain}) and all related data (trades, tips, account_coin_metrics, bubbles, scoring) deleted",
    }
