from fastapi import APIRouter, Depends, HTTPException, Query
from ..db import pool
from ..schemas.scoring import ScoreCreate, ScoreOut
from ..auth import require_admin

router = APIRouter(prefix="/scoring", tags=["scoring"])


@router.post("", response_model=dict, dependencies=[Depends(require_admin)])
def add_score(payload: ScoreCreate):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            ca = payload.ca.lower()
            chain = payload.chain.lower() if payload.chain else None
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
            cur.execute(
                """
                INSERT INTO scoring (ca, chain, intuition_score)
                VALUES (%s, %s, %s)
                RETURNING id, ca, chain, scored_ts, intuition_score;
                """,
                (ca, chain, payload.intuition_score),
            )
            row = cur.fetchone()
            conn.commit()

    return {
        "ok": True,
        "score": {
            "id": row[0],
            "ca": row[1],
            "chain": row[2],
            "scored_ts": row[3],
            "intuition_score": row[4],
        },
    }


@router.get("", response_model=list[ScoreOut])
def list_scores(
    limit: int = Query(default=200, ge=1, le=1000),
    ca: str | None = None,
    chain: str | None = None,
):
    if ca:
        ca = ca.lower()
    if chain:
        chain = chain.lower()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            params = []
            sql = """
                SELECT id, ca, chain, scored_ts, intuition_score
                FROM scoring
            """
            where = []
            if ca:
                where.append("ca = %s")
                params.append(ca)
            if chain:
                where.append("chain = %s")
                params.append(chain)
            if where:
                sql += " WHERE " + " AND ".join(where)
            sql += " ORDER BY scored_ts DESC LIMIT %s;"
            params.append(limit)
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "ca": r[1],
            "chain": r[2],
            "scored_ts": r[3],
            "intuition_score": r[4],
        }
        for r in rows
    ]
