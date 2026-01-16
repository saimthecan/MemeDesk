import os
import time
import uuid
import logging
import threading
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Header, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .db import pool
from .routers.coins import router as coins_router
from .routers.trades import router as trades_router
from .routers.tips import router as tips_router
from .routers.bubbles import router as bubbles_router
from .routers.scoring import router as scoring_router
from .routers.snapshot import router as snapshot_router
from .routers.dexscreener import router as dexscreener_router
from .routers.wizard import router as wizard_router
from .routers.context import router as context_router
from .routers.auth import router as auth_router

app = FastAPI(title="Memecoin Trade Tracker API")
logger = logging.getLogger("app")

VERCEL_FRONTEND_URL = os.getenv("VERCEL_FRONTEND_URL")
WARMUP_KEY = os.getenv("WARMUP_KEY")
ACCOUNTS_MV_REFRESH_SECONDS = os.getenv("ACCOUNTS_MV_REFRESH_SECONDS", "600")
ACCOUNTS_MV_REFRESH_LOCK_KEY = 941773

allow_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

if VERCEL_FRONTEND_URL:
    allow_origins.append(VERCEL_FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _parse_refresh_interval() -> int:
    try:
        return max(0, int(ACCOUNTS_MV_REFRESH_SECONDS))
    except ValueError:
        return 600


def _refresh_accounts_summary() -> dict:
    with pool.connection() as conn:
        old_autocommit = conn.autocommit
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_try_advisory_lock(%s);", (ACCOUNTS_MV_REFRESH_LOCK_KEY,))
                lock_acquired = cur.fetchone()[0]
                if not lock_acquired:
                    return {"ok": False, "detail": "refresh_in_progress", "status": 409}
                try:
                    cur.execute(
                        """
                        SELECT 1
                        FROM pg_matviews
                        WHERE schemaname = 'public' AND matviewname = 'mv_accounts_summary';
                        """
                    )
                    if cur.fetchone() is None:
                        return {
                            "ok": False,
                            "detail": "mv_accounts_summary not found",
                            "status": 404,
                        }
                    cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_accounts_summary;")
                    return {"ok": True, "detail": "refreshed", "status": 200}
                finally:
                    cur.execute("SELECT pg_advisory_unlock(%s);", (ACCOUNTS_MV_REFRESH_LOCK_KEY,))
        finally:
            conn.autocommit = old_autocommit


def _refresh_loop(stop_event: threading.Event, interval_seconds: int) -> None:
    if interval_seconds <= 0:
        return
    while not stop_event.wait(interval_seconds):
        try:
            _refresh_accounts_summary()
        except Exception:
            logger.exception("accounts_summary_refresh_failed")


@app.middleware("http")
async def request_logging(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or uuid.uuid4().hex
    request.state.request_id = request_id
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = (time.monotonic() - start) * 1000
    response.headers["x-request-id"] = request_id
    logger.info(
        "request method=%s path=%s status=%s duration_ms=%.2f request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id,
    )
    return response


def _error_payload(code: str, message: object, request_id: str | None) -> dict:
    return {"error": {"code": code, "message": message, "request_id": request_id}}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", None)
    payload = _error_payload("http_error", exc.detail, request_id)
    payload["detail"] = exc.detail
    response = JSONResponse(status_code=exc.status_code, content=payload)
    if request_id:
        response.headers["x-request-id"] = request_id
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", None)
    payload = _error_payload("validation_error", "validation failed", request_id)
    payload["detail"] = exc.errors()
    response = JSONResponse(status_code=422, content=payload)
    if request_id:
        response.headers["x-request-id"] = request_id
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.exception(
        "unhandled error method=%s path=%s request_id=%s",
        request.method,
        request.url.path,
        request_id,
    )
    payload = _error_payload("internal_error", "internal error", request_id)
    response = JSONResponse(status_code=500, content=payload)
    if request_id:
        response.headers["x-request-id"] = request_id
    return response

@app.get("/warmup")
def warmup(x_warmup_key: str | None = Header(default=None)):
    # basit koruma
    if WARMUP_KEY and x_warmup_key != WARMUP_KEY:
        raise HTTPException(status_code=401, detail="unauthorized")

    # Render + Neon uyansın diye DB ping
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
            one = cur.fetchone()[0]

    return {"ok": True, "db_select_1": one}

@app.post("/admin/refresh-accounts-summary")
def refresh_accounts_summary(x_refresh_key: str | None = Header(default=None)):
    if WARMUP_KEY and x_refresh_key != WARMUP_KEY:
        raise HTTPException(status_code=401, detail="unauthorized")
    result = _refresh_accounts_summary()
    if not result.get("ok"):
        status = result.get("status", 500)
        raise HTTPException(status_code=status, detail=result.get("detail"))
    return {"ok": True, "detail": result.get("detail")}

@app.on_event("startup")
def startup():
    pool.open()
    refresh_interval = _parse_refresh_interval()
    if refresh_interval > 0:
        stop_event = threading.Event()
        refresh_thread = threading.Thread(
            target=_refresh_loop,
            args=(stop_event, refresh_interval),
            daemon=True,
        )
        app.state.refresh_stop = stop_event
        app.state.refresh_thread = refresh_thread
        refresh_thread.start()

@app.on_event("shutdown")
def shutdown():
    stop_event = getattr(app.state, "refresh_stop", None)
    refresh_thread = getattr(app.state, "refresh_thread", None)
    if stop_event:
        stop_event.set()
    if refresh_thread:
        refresh_thread.join(timeout=5)
    pool.close()

@app.get("/health")
def health():
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1;")
            one = cur.fetchone()[0]
            row = None
            try:
                cur.execute("SELECT id, active_ca, active_chain, updated_ts FROM context WHERE id = 1;")
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
                "active_chain": row[2],
                "updated_ts": row[3].isoformat() if row and row[3] else None,
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
app.include_router(context_router)
app.include_router(auth_router)
