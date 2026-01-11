from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from db import pool
from schemas_tips import (
    AccountCreate,
    AccountOut,
    TipCreate,
    TipUpdate,
    TipOut,
    TipsPageOut,
    BubblesData,
    ScoringData,
)

router = APIRouter(tags=["tips"])


def _parse_cursor(cursor: str) -> tuple[datetime, int]:
    parts = cursor.split(",", 1)
    if len(parts) != 2:
        raise HTTPException(status_code=422, detail="Invalid cursor")
    ts_raw, id_raw = parts[0].strip(), parts[1].strip()
    ts_raw = ts_raw.replace("Z", "+00:00")
    try:
        ts = datetime.fromisoformat(ts_raw)
        tip_id = int(id_raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail="Invalid cursor") from e
    return ts, tip_id


# -------- Accounts --------
@router.post("/accounts", response_model=AccountOut)
def add_account(payload: AccountCreate):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            try:
                # UPSERT: Mevcut account varsa ID'sini döndür, yoksa yeni oluştur
                cur.execute(
                    """
                    INSERT INTO accounts (platform, handle, tips_total, tips_win, tips_loss, win_rate_50p, rug_rate, avg_effect_pct)
                    VALUES (%s, %s, 0, 0, 0, NULL, NULL, NULL)
                    ON CONFLICT (platform, handle) DO UPDATE SET updated_ts = NOW()
                    RETURNING account_id, platform, handle, created_ts;
                    """,
                    (payload.platform, payload.handle),
                )
                row = cur.fetchone()
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise

    return {"account_id": row[0], "platform": row[1], "handle": row[2], "created_ts": row[3]}


@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(limit: int = Query(default=200, ge=1, le=1000)):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT account_id, platform, handle, created_ts
                FROM social_accounts
                ORDER BY created_ts DESC
                LIMIT %s;
                """,
                (limit,),
            )
            rows = cur.fetchall()

    return [{"account_id": r[0], "platform": r[1], "handle": r[2], "created_ts": r[3]} for r in rows]


# -------- Tips --------
@router.post("/tips", response_model=dict)
def add_tip(payload: TipCreate):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            ca = payload.ca

            # ensure coin exists
            cur.execute("SELECT 1 FROM coins WHERE ca = %s;", (ca,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Coin not found")

            # ensure account exists
            cur.execute("SELECT 1 FROM social_accounts WHERE account_id = %s;", (payload.account_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Account not found")

            cur.execute(
                """
                INSERT INTO tips (account_id, ca, post_ts, post_mcap_usd)
                VALUES (%s, %s, %s, %s)
                RETURNING tip_id;
                """,
                (payload.account_id, ca, payload.post_ts, payload.post_mcap_usd),
            )
            row = cur.fetchone()
            tip_id = row[0]
            
            # Save tip-specific bubbles if provided
            if payload.bubbles:
                for cluster in payload.bubbles.clusters:
                    cur.execute(
                        "INSERT INTO tip_bubbles (tip_id, cluster_rank, pct) VALUES (%s, %s, %s);",
                        (tip_id, cluster.rank, cluster.pct),
                    )
                
                for other in payload.bubbles.others:
                    cur.execute(
                        "INSERT INTO tip_bubbles_others (tip_id, other_rank, pct) VALUES (%s, %s, %s);",
                        (tip_id, other.rank, other.pct),
                    )
            
            # Save tip-specific scoring if provided
            if payload.scoring:
                cur.execute(
                    "INSERT INTO tip_scoring (tip_id, intuition_score) VALUES (%s, %s);",
                    (tip_id, payload.scoring.intuition_score),
                )
            
            conn.commit()

    return {"ok": True, "tip_id": tip_id}


@router.patch("/tips/{tip_id}", response_model=dict)
def update_tip(tip_id: int, payload: TipUpdate):
    # allow nulls: if field is omitted, do not touch it
    fields = []
    values = []

    if payload.peak_mcap_usd is not None:
        fields.append("peak_mcap_usd = %s")
        values.append(payload.peak_mcap_usd)

    if payload.trough_mcap_usd is not None:
        fields.append("trough_mcap_usd = %s")
        values.append(payload.trough_mcap_usd)

    if payload.rug_flag is not None:
        fields.append("rug_flag = %s")
        # 0 -> False, 1 -> True olarak gönderiyoruz
        values.append(bool(payload.rug_flag)) 



    if not fields:
        raise HTTPException(status_code=422, detail="No fields to update")

    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ca FROM tips WHERE tip_id = %s;", (tip_id,))
            row = cur.fetchone()
            if row is None:
                conn.rollback()
                raise HTTPException(status_code=404, detail="Tip not found")
            ca = row[0]

            values.extend([ca])
            cur.execute(
                f"""
                UPDATE tips
                SET {", ".join(fields)}
                WHERE ca = %s
                RETURNING tip_id;
                """,
                tuple(values),
            )
            row = cur.fetchone()
            conn.commit()

    return {"ok": True, "tip_id": row[0]}


@router.get("/tips", response_model=list[TipOut])
def list_tips(
    limit: int = Query(default=200, ge=1, le=1000),
    ca: str | None = None,
):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            params = []
            sql = """
                SELECT
                  tip_id, ca, coin_name, account_id, platform, handle,
                  post_ts, post_mcap_usd, peak_mcap_usd, trough_mcap_usd, rug_flag,
                  gain_pct, drop_pct, effect_pct
                FROM v_tip_gain_loss
            """
            if ca:
                sql += " WHERE ca = %s"
                params.append(ca)
            sql += " ORDER BY post_ts DESC LIMIT %s;"
            params.append(limit)
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

            tip_ids = [r[0] for r in rows]
            clusters_by_tip: dict[int, list[dict]] = {}
            others_by_tip: dict[int, list[dict]] = {}
            scoring_by_tip: dict[int, dict] = {}

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
                    scoring_by_tip[tip_id] = {"intuition_score": score}

    out = []
    for r in rows:
        tip_id = r[0]
        clusters = clusters_by_tip.get(tip_id, [])
        others = others_by_tip.get(tip_id, [])
        scoring = scoring_by_tip.get(tip_id)
        bubbles = {"clusters": clusters, "others": others} if (clusters or others) else None

        out.append(
            {
                "tip_id": r[0],
                "ca": r[1],
                "coin_name": r[2],
                "account_id": r[3],
                "platform": r[4],
                "handle": r[5],
                "post_ts": r[6],
                "post_mcap_usd": float(r[7]),
                "peak_mcap_usd": float(r[8]) if r[8] is not None else None,
                "trough_mcap_usd": float(r[9]) if r[9] is not None else None,
                "rug_flag": r[10],
                "gain_pct": float(r[11]) if r[11] is not None else None,
                "drop_pct": float(r[12]) if r[12] is not None else None,
                "effect_pct": float(r[13]) if r[13] is not None else None,
                "bubbles": bubbles,
                "scoring": scoring,
            }
        )
    return out


@router.get("/tips/paged", response_model=TipsPageOut)
def list_tips_paged(
    limit: int = Query(default=100, ge=1, le=500),
    ca: str | None = None,
    q: str | None = None,
    cursor: str | None = None,
):
    cursor_ts = None
    cursor_id = None
    if cursor:
        cursor_ts, cursor_id = _parse_cursor(cursor)

    q_like = None
    if q:
        q_like = f"%{q.strip()}%"

    with pool.connection() as conn:
        with conn.cursor() as cur:
            params = []
            where = []
            sql = """
                SELECT
                  v.tip_id, v.ca, v.coin_name, v.account_id, v.platform, v.handle,
                  v.post_ts, v.post_mcap_usd, v.peak_mcap_usd, v.trough_mcap_usd, v.rug_flag,
                  v.gain_pct, v.drop_pct, v.effect_pct
                FROM v_tip_gain_loss v
                LEFT JOIN coins c ON v.ca = c.ca
            """
            if ca:
                where.append("v.ca = %s")
                params.append(ca)
            if cursor_ts is not None and cursor_id is not None:
                where.append("(v.post_ts, v.tip_id) < (%s, %s)")
                params.extend([cursor_ts, cursor_id])
            if q_like:
                where.append(
                    "(v.coin_name ILIKE %s OR v.handle ILIKE %s OR v.platform ILIKE %s "
                    "OR v.ca ILIKE %s OR v.tip_id::text ILIKE %s OR c.symbol ILIKE %s)"
                )
                params.extend([q_like, q_like, q_like, q_like, q_like, q_like])
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY v.post_ts DESC, v.tip_id DESC LIMIT %s;"
            params.append(limit)
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

            count_params = []
            count_where = []
            count_sql = "SELECT COUNT(*) FROM v_tip_gain_loss v LEFT JOIN coins c ON v.ca = c.ca"
            if ca:
                count_where.append("v.ca = %s")
                count_params.append(ca)
            if q_like:
                count_where.append(
                    "(v.coin_name ILIKE %s OR v.handle ILIKE %s OR v.platform ILIKE %s "
                    "OR v.ca ILIKE %s OR v.tip_id::text ILIKE %s OR c.symbol ILIKE %s)"
                )
                count_params.extend([q_like, q_like, q_like, q_like, q_like, q_like])
            if count_where:
                count_sql += " WHERE " + " AND ".join(count_where)
            cur.execute(count_sql, tuple(count_params))
            total_count = cur.fetchone()[0]

            tip_ids = [r[0] for r in rows]
            clusters_by_tip: dict[int, list[dict]] = {}
            others_by_tip: dict[int, list[dict]] = {}
            scoring_by_tip: dict[int, dict] = {}

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
                    scoring_by_tip[tip_id] = {"intuition_score": score}

    items = []
    for r in rows:
        tip_id = r[0]
        clusters = clusters_by_tip.get(tip_id, [])
        others = others_by_tip.get(tip_id, [])
        scoring = scoring_by_tip.get(tip_id)
        bubbles = {"clusters": clusters, "others": others} if (clusters or others) else None

        items.append(
            {
                "tip_id": r[0],
                "ca": r[1],
                "coin_name": r[2],
                "account_id": r[3],
                "platform": r[4],
                "handle": r[5],
                "post_ts": r[6],
                "post_mcap_usd": float(r[7]),
                "peak_mcap_usd": float(r[8]) if r[8] is not None else None,
                "trough_mcap_usd": float(r[9]) if r[9] is not None else None,
                "rug_flag": r[10],
                "gain_pct": float(r[11]) if r[11] is not None else None,
                "drop_pct": float(r[12]) if r[12] is not None else None,
                "effect_pct": float(r[13]) if r[13] is not None else None,
                "bubbles": bubbles,
                "scoring": scoring,
            }
        )

    next_cursor = None
    if len(rows) == limit:
        last = rows[-1]
        last_ts = last[6].isoformat() if last[6] else ""
        next_cursor = f"{last_ts},{last[0]}"

    return {"items": items, "total_count": total_count, "next_cursor": next_cursor}


@router.delete("/tips/{tip_id}")
def delete_tip(tip_id: int):
    """Delete a single tip and its associated bubbles/scoring (does NOT affect the coin)."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM tips WHERE tip_id = %s;", (tip_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Tip not found")
            
            # Delete tip-specific bubbles (cascade will handle this via FK, but explicit for clarity)
            cur.execute("DELETE FROM tip_bubbles WHERE tip_id = %s;", (tip_id,))
            cur.execute("DELETE FROM tip_bubbles_others WHERE tip_id = %s;", (tip_id,))
            
            # Delete tip-specific scoring
            cur.execute("DELETE FROM tip_scoring WHERE tip_id = %s;", (tip_id,))
            
            # Delete the tip
            cur.execute("DELETE FROM tips WHERE tip_id = %s;", (tip_id,))
            
            conn.commit()
    
    return {"ok": True, "message": f"Tip {tip_id} and all associated data deleted"}
