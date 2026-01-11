from fastapi import APIRouter, HTTPException, Query
from db import pool
from schemas_bubbles import BubblesSet

router = APIRouter(prefix="/bubbles", tags=["bubbles"])


@router.post("/set")
def set_bubbles(payload: BubblesSet):
    # validate duplicate ranks in input (avoid silent overwrite)
    cluster_ranks = [r.rank for r in payload.clusters]
    other_ranks = [r.rank for r in payload.others]
    if len(set(cluster_ranks)) != len(cluster_ranks):
        raise HTTPException(status_code=422, detail="Duplicate cluster ranks in input")
    if len(set(other_ranks)) != len(other_ranks):
        raise HTTPException(status_code=422, detail="Duplicate other ranks in input")

    with pool.connection() as conn:
        with conn.cursor() as cur:
            ca = payload.ca
            if not ca:
                raise HTTPException(status_code=422, detail="ca is required")

            # ensure coin exists
            cur.execute("SELECT 1 FROM coins WHERE ca = %s;", (ca,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Coin not found")

            # SET semantics: delete then insert
            cur.execute("DELETE FROM bubbles_clusters WHERE ca = %s;", (ca,))
            cur.execute("DELETE FROM bubbles_others WHERE ca = %s;", (ca,))

            for row in payload.clusters:
                cur.execute(
                    "INSERT INTO bubbles_clusters (ca, cluster_rank, pct) VALUES (%s, %s, %s);",
                    (ca, row.rank, row.pct),
                )

            for row in payload.others:
                cur.execute(
                    "INSERT INTO bubbles_others (ca, other_rank, pct) VALUES (%s, %s, %s);",
                    (ca, row.rank, row.pct),
                )

            conn.commit()

    return {"ok": True, "clusters_count": len(payload.clusters), "others_count": len(payload.others)}


@router.get("")
def get_bubbles(ca: str = Query(min_length=3)):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # ensure coin exists
            cur.execute("SELECT 1 FROM coins WHERE ca = %s;", (ca,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Coin not found")

            cur.execute(
                "SELECT cluster_rank, pct FROM bubbles_clusters WHERE ca = %s ORDER BY cluster_rank ASC;",
                (ca,),
            )
            clusters = [{"rank": r[0], "pct": float(r[1])} for r in cur.fetchall()]

            cur.execute(
                "SELECT other_rank, pct FROM bubbles_others WHERE ca = %s ORDER BY other_rank ASC;",
                (ca,),
            )
            others = [{"rank": r[0], "pct": float(r[1])} for r in cur.fetchall()]

    return {"ca": ca, "clusters": clusters, "others": others}