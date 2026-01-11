from fastapi import APIRouter, HTTPException, Query
from db import pool
from schemas_scoring import ScoreCreate, ScoreOut

router = APIRouter(prefix="/scoring", tags=["scoring"])


@router.post("", response_model=dict)
def add_score(payload: ScoreCreate):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            ca = payload.ca
            cur.execute("SELECT 1 FROM coins WHERE ca = %s;", (ca,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Coin not found")
            cur.execute(
                """
                INSERT INTO scoring (ca, intuition_score)
                VALUES (%s, %s)
                RETURNING id, ca, scored_ts, intuition_score;
                """,
                (ca, payload.intuition_score),
            )
            row = cur.fetchone()
            conn.commit()

    return {"ok": True, "score": {"id": row[0], "ca": row[1], "scored_ts": row[2], "intuition_score": row[3]}}


@router.get("", response_model=list[ScoreOut])
def list_scores(
    limit: int = Query(default=200, ge=1, le=1000),
    ca: str | None = None,
):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            params = []
            sql = """
                SELECT id, ca, scored_ts, intuition_score
                FROM scoring
            """
            if ca:
                sql += " WHERE ca = %s"
                params.append(ca)
            sql += " ORDER BY scored_ts DESC LIMIT %s;"
            params.append(limit)
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

    return [{"id": r[0], "ca": r[1], "scored_ts": r[2], "intuition_score": r[3]} for r in rows]