from fastapi import APIRouter, HTTPException
from ..db import pool
from ..schemas.context import ContextOut, ContextSet

router = APIRouter(prefix="/context", tags=["context"])


@router.get("", response_model=ContextOut)
def get_context():
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, active_ca, active_chain, updated_ts FROM context WHERE id = 1;")
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=500, detail="context row missing")
    return {"id": row[0], "active_ca": row[1], "active_chain": row[2], "updated_ts": row[3]}


@router.post("", response_model=ContextOut)
def set_active_coin(payload: ContextSet):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # if active_ca is not null, ensure coin exists
            if payload.active_ca is not None:
                active_ca = payload.active_ca.lower()
                active_chain = payload.active_chain.lower() if payload.active_chain else None
                if active_chain:
                    cur.execute(
                        "SELECT 1 FROM coins WHERE ca = %s AND chain = %s;",
                        (active_ca, active_chain),
                    )
                    if cur.fetchone() is None:
                        raise HTTPException(status_code=404, detail="Coin not found")
                else:
                    cur.execute("SELECT chain FROM coins WHERE ca = %s LIMIT 2;", (active_ca,))
                    rows = cur.fetchall()
                    if not rows:
                        raise HTTPException(status_code=404, detail="Coin not found")
                    if len(rows) > 1:
                        raise HTTPException(status_code=409, detail="Multiple chains found for this CA")
                    active_chain = rows[0][0]
            else:
                active_ca = None
                active_chain = None

            cur.execute(
                "UPDATE context SET active_ca = %s, active_chain = %s WHERE id = 1 RETURNING id, active_ca, active_chain, updated_ts;",
                (active_ca, active_chain),
            )
            row = cur.fetchone()
            conn.commit()

    return {"id": row[0], "active_ca": row[1], "active_chain": row[2], "updated_ts": row[3]}
