from datetime import datetime
import uuid
from fastapi import APIRouter, HTTPException, Query
from ..db import pool
from ..schemas.trades import (
    TradeOpen,
    TradeClose,
    TradeOut,
    TradesPageOut,
    BubblesData,
    ScoringData,
    TradeUpdate,
)

router = APIRouter(prefix="/trades", tags=["trades"])


def _parse_cursor(cursor: str) -> tuple[datetime, int]:
    parts = cursor.split(",", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=422, detail="Invalid cursor")
    ts_raw, id_raw = parts[0].strip(), parts[1].strip()
    ts_raw = ts_raw.replace("Z", "+00:00")
    try:
        ts = datetime.fromisoformat(ts_raw)
        row_id = int(id_raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail="Invalid cursor") from e
    return ts, row_id


@router.post("/open")
def open_trade(payload: TradeOpen):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            ca = payload.ca.lower()
            chain = payload.chain.lower() if payload.chain else None
            trade_id_str = f"trade_{uuid.uuid4().hex[:8]}"

            # coin name for response clarity
            if chain:
                cur.execute("SELECT name, chain FROM coins WHERE ca = %s AND chain = %s;", (ca, chain))
                coin_row = cur.fetchone()
                if coin_row is None:
                    raise HTTPException(status_code=404, detail="Coin not found")
                coin_name = coin_row[0]
                chain = coin_row[1]
            else:
                cur.execute("SELECT name, chain FROM coins WHERE ca = %s LIMIT 2;", (ca,))
                rows = cur.fetchall()
                if not rows:
                    raise HTTPException(status_code=404, detail="Coin not found")
                if len(rows) > 1:
                    raise HTTPException(status_code=409, detail="Multiple chains found for this CA")
                coin_name, chain = rows[0]

            cur.execute(
                """
                INSERT INTO trades (ca, chain, entry_mcap_usd, size_usd, trade_id)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, trade_id, entry_ts;
                """,
                (ca, chain, payload.entry_mcap_usd, payload.size_usd, trade_id_str),
            )
            row = cur.fetchone()
            # row[0] -> integer ID (Primary Key)
            # row[1] -> string Trade ID ("trade_xyz...")
            trade_id_str = row[1] 
            
            # DÜZELTME: Yan tablolara kayıt atarken STRING olan ID'yi kullanıyoruz.
            
            # Save trade-specific bubbles if provided
            if payload.bubbles:
                for cluster in payload.bubbles.clusters:
                    cur.execute(
                        "INSERT INTO trade_bubbles (trade_id, cluster_rank, pct) VALUES (%s, %s, %s);",
                        (trade_id_str, cluster.rank, cluster.pct), # <-- trade_id_str kullanıldı
                    )
                
                for other in payload.bubbles.others:
                    cur.execute(
                        "INSERT INTO trade_bubbles_others (trade_id, other_rank, pct) VALUES (%s, %s, %s);",
                        (trade_id_str, other.rank, other.pct), # <-- trade_id_str kullanıldı
                    )
            
            # Save trade-specific scoring if provided
            if payload.scoring:
                cur.execute(
                    "INSERT INTO trade_scoring (trade_id, intuition_score) VALUES (%s, %s);",
                    (trade_id_str, payload.scoring.intuition_score), # <-- trade_id_str kullanıldı
                )
            
            conn.commit()

    return {
        "ok": True,
        "id": row[0],
        "trade_id": row[1],
        "entry_ts": row[2],
        "ca": ca,
        "chain": chain,
        "coin_name": coin_name,
    }


@router.post("/{trade_id}/close")
def close_trade(trade_id: str, payload: TradeClose):
    """Close a trade by its trade_id (string format like 'trade_8cd09a1a')."""
    if payload.trade_id and payload.trade_id != trade_id:
        raise HTTPException(status_code=422, detail="Trade ID mismatch")
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # Close only if still open
            # Burada WHERE koşulunda zaten trade_id (string) kullanıyorsun, bu doğruydu.
            cur.execute(
                """
                UPDATE trades
                SET exit_ts = now(),
                    exit_mcap_usd = %s,
                    exit_reason = %s
                WHERE trade_id = %s
                  AND exit_ts IS NULL
                RETURNING id, trade_id, exit_ts;
                """,
                (payload.exit_mcap_usd, payload.exit_reason, trade_id),
            )
            row = cur.fetchone()
            if row is None:
                conn.rollback()
                raise HTTPException(status_code=404, detail="Open trade not found")
            conn.commit()

    return {"ok": True, "id": row[0], "trade_id": row[1], "exit_ts": row[2]}


@router.get("", response_model=list[TradeOut])
def list_trades(
    limit: int = Query(default=100, ge=1, le=1000),
    ca: str | None = None,
    chain: str | None = None,
    only_open: bool = False,
):
    if ca:
        ca = ca.lower()
    if chain:
        chain = chain.lower()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            where = []
            params = []
            if ca:
                where.append("ca = %s")
                params.append(ca)
            if chain:
                where.append("chain = %s")
                params.append(chain)
            if only_open:
                where.append("exit_ts IS NULL")

            sql = """
                SELECT
                  id, trade_id, ca, chain, coin_name,
                  entry_ts, entry_mcap_usd, size_usd,
                  exit_ts, exit_mcap_usd, exit_reason,
                  pnl_pct, pnl_usd
                FROM v_trades_pnl
            """
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY entry_ts DESC LIMIT %s;"
            params.append(limit)
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

            trade_ids = [r[1] for r in rows]
            clusters_by_trade: dict[str, list[dict]] = {}
            others_by_trade: dict[str, list[dict]] = {}
            scoring_by_trade: dict[str, dict] = {}

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
                    scoring_by_trade[trade_id] = {"intuition_score": score}

            trades_list = []
            for r in rows:
                trade_id_str = r[1]
                clusters = clusters_by_trade.get(trade_id_str, [])
                others = others_by_trade.get(trade_id_str, [])
                scoring = scoring_by_trade.get(trade_id_str)
                bubbles = {"clusters": clusters, "others": others} if (clusters or others) else None

                trades_list.append(
                    {
                        "id": r[0],
                        "trade_id": r[1],
                        "ca": r[2],
                        "chain": r[3],
                        "coin_name": r[4],
                        "entry_ts": r[5],
                        "entry_mcap_usd": float(r[6]),
                        "size_usd": float(r[7]) if r[7] is not None else None,
                        "exit_ts": r[8],
                        "exit_mcap_usd": float(r[9]) if r[9] is not None else None,
                        "exit_reason": r[10],
                        "pnl_pct": float(r[11]) if r[11] is not None else None,
                        "pnl_usd": float(r[12]) if r[12] is not None else None,
                        "bubbles": bubbles,
                        "scoring": scoring,
                    }
                )

    return trades_list


@router.get("/paged", response_model=TradesPageOut)
def list_trades_paged(
    limit: int = Query(default=100, ge=1, le=500),
    ca: str | None = None,
    chain: str | None = None,
    scope: str = "all",
    q: str | None = None,
    cursor: str | None = None,
):
    if ca:
        ca = ca.lower()
    if chain:
        chain = chain.lower()
    cursor_ts = None
    cursor_id = None
    if cursor:
        cursor_ts, cursor_id = _parse_cursor(cursor)

    q_like = None
    if q:
        q_like = f"%{q.strip()}%"

    with pool.connection() as conn:
        with conn.cursor() as cur:
            where = []
            params = []
            if ca:
                where.append("v.ca = %s")
                params.append(ca)
            if chain:
                where.append("v.chain = %s")
                params.append(chain)
            if scope not in ("all", "open", "closed"):
                raise HTTPException(status_code=422, detail="Invalid scope")
            if scope == "open":
                where.append("v.exit_ts IS NULL")
            elif scope == "closed":
                where.append("v.exit_ts IS NOT NULL")
            if cursor_ts is not None and cursor_id is not None:
                where.append("(v.entry_ts, v.id) < (%s, %s)")
                params.extend([cursor_ts, cursor_id])
            if q_like:
                where.append(
                    "(v.coin_name ILIKE %s OR v.ca ILIKE %s OR v.trade_id::text ILIKE %s OR c.symbol ILIKE %s)"
                )
                params.extend([q_like, q_like, q_like, q_like])

            sql = """
                SELECT
                  v.id, v.trade_id, v.ca, v.chain, v.coin_name,
                  v.entry_ts, v.entry_mcap_usd, v.size_usd,
                  v.exit_ts, v.exit_mcap_usd, v.exit_reason,
                  v.pnl_pct, v.pnl_usd
                FROM v_trades_pnl v
                LEFT JOIN coins c ON v.ca = c.ca AND v.chain = c.chain
            """
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY v.entry_ts DESC, v.id DESC LIMIT %s;"
            params.append(limit)
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

            count_params = []
            count_where = []
            count_sql = """
                SELECT
                  COUNT(*) AS total_count,
                  COUNT(*) FILTER (WHERE t.exit_ts IS NULL) AS open_count,
                  COUNT(*) FILTER (WHERE t.exit_ts IS NOT NULL) AS closed_count
                FROM trades t
                JOIN coins c ON t.ca = c.ca AND t.chain = c.chain
            """
            if ca:
                count_where.append("t.ca = %s")
                count_params.append(ca)
            if chain:
                count_where.append("t.chain = %s")
                count_params.append(chain)
            if q_like:
                count_where.append(
                    "(c.name ILIKE %s OR t.ca ILIKE %s OR t.trade_id::text ILIKE %s OR c.symbol ILIKE %s)"
                )
                count_params.extend([q_like, q_like, q_like, q_like])
            if count_where:
                count_sql += " WHERE " + " AND ".join(count_where)
            cur.execute(count_sql, tuple(count_params))
            total_count, open_count, closed_count = cur.fetchone()

            trade_ids = [r[1] for r in rows]
            clusters_by_trade: dict[str, list[dict]] = {}
            others_by_trade: dict[str, list[dict]] = {}
            scoring_by_trade: dict[str, dict] = {}

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
                    scoring_by_trade[trade_id] = {"intuition_score": score}

    items = []
    for r in rows:
        trade_id_str = r[1]
        clusters = clusters_by_trade.get(trade_id_str, [])
        others = others_by_trade.get(trade_id_str, [])
        scoring = scoring_by_trade.get(trade_id_str)
        bubbles = {"clusters": clusters, "others": others} if (clusters or others) else None

        items.append(
            {
                "id": r[0],
                "trade_id": r[1],
                "ca": r[2],
                "chain": r[3],
                "coin_name": r[4],
                "entry_ts": r[5],
                "entry_mcap_usd": float(r[6]),
                "size_usd": float(r[7]) if r[7] is not None else None,
                "exit_ts": r[8],
                "exit_mcap_usd": float(r[9]) if r[9] is not None else None,
                "exit_reason": r[10],
                "pnl_pct": float(r[11]) if r[11] is not None else None,
                "pnl_usd": float(r[12]) if r[12] is not None else None,
                "bubbles": bubbles,
                "scoring": scoring,
            }
        )

    next_cursor = None
    if len(rows) == limit:
        last = rows[-1]
        last_ts = last[5].isoformat() if last[5] else ""
        next_cursor = f"{last_ts},{last[0]}"

    return {
        "items": items,
        "total_count": total_count,
        "open_count": open_count,
        "closed_count": closed_count,
        "next_cursor": next_cursor,
    }


@router.delete("/{trade_id}")
def delete_trade(trade_id: str):
    """Delete a single trade and its associated bubbles/scoring (does NOT affect the coin)."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # String ID ile kontrol ediyoruz
            cur.execute("SELECT id FROM trades WHERE trade_id = %s;", (trade_id,))
            trade_row = cur.fetchone()
            if trade_row is None:
                raise HTTPException(status_code=404, detail="Trade not found")
            
            # Yan tabloları temizle (String ID kullanarak)
            cur.execute("DELETE FROM trade_bubbles WHERE trade_id = %s;", (trade_id,))
            cur.execute("DELETE FROM trade_bubbles_others WHERE trade_id = %s;", (trade_id,))
            cur.execute("DELETE FROM trade_scoring WHERE trade_id = %s;", (trade_id,))
            
            # Ana tabloyu temizle (String ID kullanarak)
            cur.execute("DELETE FROM trades WHERE trade_id = %s;", (trade_id,))
            
            conn.commit()
    
    return {"ok": True, "message": f"Trade {trade_id} and all associated data deleted"}

# routes_trades.py dosyasının sonuna eklendi
@router.patch("/{trade_id}")
def update_trade(trade_id: str, payload: TradeUpdate):
    fields = []
    values = []

    if payload.entry_mcap_usd is not None:
        fields.append("entry_mcap_usd = %s")
        values.append(payload.entry_mcap_usd)

    if payload.size_usd is not None:
        fields.append("size_usd = %s")
        values.append(payload.size_usd)

    if payload.exit_mcap_usd is not None:
        fields.append("exit_mcap_usd = %s")
        values.append(payload.exit_mcap_usd)

    if payload.exit_reason is not None:
        fields.append("exit_reason = %s")
        values.append(payload.exit_reason)

    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update")

    with pool.connection() as conn:
        with conn.cursor() as cur:
            values.append(trade_id)
            cur.execute(
                f"UPDATE trades SET {', '.join(fields)} WHERE trade_id = %s RETURNING trade_id;",
                tuple(values),
            )
            row = cur.fetchone()
            if row is None:
                conn.rollback()
                raise HTTPException(status_code=404, detail="Trade not found")
            conn.commit()
    return {"ok": True}
