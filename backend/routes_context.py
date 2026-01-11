from fastapi import APIRouter, HTTPException
from db import pool
from schemas import ContextOut, ContextSet

router = APIRouter(prefix="/context", tags=["context"])


@router.get("", response_model=ContextOut)
def get_context():
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, active_ca, updated_ts FROM context WHERE id = 1;")
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=500, detail="context row missing")
    return {"id": row[0], "active_ca": row[1], "updated_ts": row[2]}


@router.post("", response_model=ContextOut)
def set_active_coin(payload: ContextSet):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # if active_ca is not null, ensure coin exists
            if payload.active_ca is not None:
                cur.execute("SELECT 1 FROM coins WHERE ca = %s;", (payload.active_ca,))
                if cur.fetchone() is None:
                    raise HTTPException(status_code=404, detail="Coin not found")

            cur.execute(
                "UPDATE context SET active_ca = %s WHERE id = 1 RETURNING id, active_ca, updated_ts;",
                (payload.active_ca,),
            )
            row = cur.fetchone()
            conn.commit()

    return {"id": row[0], "active_ca": row[1], "updated_ts": row[2]}