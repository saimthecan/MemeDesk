from fastapi import APIRouter, HTTPException, Query
from ..db import pool
from ..schemas.bubbles import BubblesSet

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
            ca = payload.ca.lower() if payload.ca else None
            chain = payload.chain.lower() if payload.chain else None
            if not ca:
                raise HTTPException(status_code=422, detail="ca is required")

            # ensure coin exists
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

            # SET semantics: delete then insert
            cur.execute("DELETE FROM bubbles_clusters WHERE ca = %s AND chain = %s;", (ca, chain))
            cur.execute("DELETE FROM bubbles_others WHERE ca = %s AND chain = %s;", (ca, chain))

            for row in payload.clusters:
                cur.execute(
                    "INSERT INTO bubbles_clusters (ca, chain, cluster_rank, pct) VALUES (%s, %s, %s, %s);",
                    (ca, chain, row.rank, row.pct),
                )

            for row in payload.others:
                cur.execute(
                    "INSERT INTO bubbles_others (ca, chain, other_rank, pct) VALUES (%s, %s, %s, %s);",
                    (ca, chain, row.rank, row.pct),
                )

            conn.commit()

    return {
        "ok": True,
        "ca": ca,
        "chain": chain,
        "clusters_count": len(payload.clusters),
        "others_count": len(payload.others),
    }


@router.get("")
def get_bubbles(ca: str = Query(min_length=3), chain: str | None = None):
    ca = ca.lower()
    if chain:
        chain = chain.lower()
    with pool.connection() as conn:
        with conn.cursor() as cur:
            # ensure coin exists
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
                "SELECT cluster_rank, pct FROM bubbles_clusters WHERE ca = %s AND chain = %s ORDER BY cluster_rank ASC;",
                (ca, chain),
            )
            clusters = [{"rank": r[0], "pct": float(r[1])} for r in cur.fetchall()]

            cur.execute(
                "SELECT other_rank, pct FROM bubbles_others WHERE ca = %s AND chain = %s ORDER BY other_rank ASC;",
                (ca, chain),
            )
            others = [{"rank": r[0], "pct": float(r[1])} for r in cur.fetchall()]

    return {"ca": ca, "chain": chain, "clusters": clusters, "others": others}
