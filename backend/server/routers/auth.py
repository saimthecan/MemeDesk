from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..auth import ADMIN_PASSWORD, ADMIN_TOKEN_TTL_SECONDS, create_admin_token


router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
def login(payload: LoginRequest):
    if not ADMIN_PASSWORD:
        raise HTTPException(status_code=500, detail="admin_password_missing")
    if payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="invalid_password")
    token = create_admin_token()
    return {"ok": True, "token": token, "expires_in": ADMIN_TOKEN_TTL_SECONDS}
