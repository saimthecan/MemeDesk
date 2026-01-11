from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import pool
from routes_coins import router as coins_router
from routes_trades import router as trades_router
from routes_tips import router as tips_router
from routes_bubbles import router as bubbles_router
from routes_scoring import router as scoring_router
from routes_snapshot import router as snapshot_router
from routes_dexscreener import router as dexscreener_router
from routes_wizard import router as wizard_router




app = FastAPI(title="Memecoin Trade Tracker API")

app.add_middleware(
    CORSMiddleware,
     allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    pool.open()


@app.on_event("shutdown")
def shutdown():
    pool.close()


@app.get("/health")
def health():
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
            one = cur.fetchone()[0]
            # `context` is legacy (old "active coin" UX). It may exist in DB but
            # current app logic doesn't rely on it anymore.
            row = None
            try:
                cur.execute("SELECT id, active_ca, updated_ts FROM context WHERE id = 1;")
                row = cur.fetchone()
            except Exception:
                row = None

    return {
        "ok": True,
        "db_select_1": one,
        "context_row": (
            {
                "id": row[0],
                "active_ca": row[1],
                "updated_ts": row[2].isoformat() if row and row[2] else None,
            }
            if row
            else None
        ),
    }
    
app.include_router(coins_router)
app.include_router(trades_router)
app.include_router(tips_router)
app.include_router(bubbles_router)
app.include_router(scoring_router)
app.include_router(snapshot_router)
app.include_router(dexscreener_router)
app.include_router(wizard_router)
