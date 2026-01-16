import base64
import hashlib
import hmac
import json
import os
import time
from fastapi import HTTPException, Request


ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
ADMIN_TOKEN_SECRET = os.getenv("ADMIN_TOKEN_SECRET")
ADMIN_TOKEN_TTL_SECONDS = int(os.getenv("ADMIN_TOKEN_TTL_SECONDS", "10800"))


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload_b64: str, secret: str) -> str:
    mac = hmac.new(secret.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256)
    return _b64url_encode(mac.digest())


def create_admin_token() -> str:
    if not ADMIN_TOKEN_SECRET:
        raise HTTPException(status_code=500, detail="admin_token_secret_missing")
    now = int(time.time())
    payload = {"sub": "admin", "iat": now, "exp": now + ADMIN_TOKEN_TTL_SECONDS}
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = _sign(payload_b64, ADMIN_TOKEN_SECRET)
    return f"{payload_b64}.{sig}"


def verify_admin_token(token: str) -> dict:
    if not ADMIN_TOKEN_SECRET:
        raise HTTPException(status_code=500, detail="admin_token_secret_missing")
    parts = token.split(".")
    if len(parts) != 2:
        raise HTTPException(status_code=401, detail="invalid_token")
    payload_b64, sig = parts
    expected_sig = _sign(payload_b64, ADMIN_TOKEN_SECRET)
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=401, detail="invalid_token")
    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="invalid_token")
    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        raise HTTPException(status_code=401, detail="token_expired")
    return payload


def require_admin(request: Request) -> dict:
    token = None
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        token = request.cookies.get("admin_token")
    if not token:
        raise HTTPException(status_code=401, detail="admin_required")
    return verify_admin_token(token)
