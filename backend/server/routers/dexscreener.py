from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from time import monotonic
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/dexscreener", tags=["dexscreener"])

DEX_BASE = "https://api.dexscreener.com"

SUPPORTED_CHAINS = [
    "solana",
    "ethereum",
    "bsc",
    "base",
    "arbitrum",
    "polygon",
    "avalanche",
    "fantom",
    "optimism",
]

CACHE_TTL_SEC = 300
MAX_RETRIES = 3
RETRY_BACKOFF_SEC = 0.3
RETRY_STATUS = {429, 500, 502, 503, 504}

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_cache_lock = asyncio.Lock()


def _cache_get(key: str) -> dict[str, Any] | None:
    item = _cache.get(key)
    if not item:
        return None
    expires_at, value = item
    if expires_at <= monotonic():
        _cache.pop(key, None)
        return None
    return value


async def _cache_get_async(key: str) -> dict[str, Any] | None:
    async with _cache_lock:
        return _cache_get(key)


async def _cache_set_async(key: str, value: dict[str, Any]) -> None:
    async with _cache_lock:
        _cache[key] = (monotonic() + CACHE_TTL_SEC, value)


def _ms_to_dt_utc(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)

async def check_chain(client: httpx.AsyncClient, chain: str, ca_l: str) -> tuple[str, list[dict]] | None:
    """Tek bir zinciri kontrol eden yardımcı asenkron fonksiyon"""
    url = f"{DEX_BASE}/token-pairs/v1/{chain}/{ca_l}"
    for attempt in range(MAX_RETRIES):
        resp = None
        try:
            resp = await client.get(url)
        except Exception:
            resp = None

        if resp is not None and resp.status_code == 200:
            try:
                data = resp.json()
            except Exception:
                return None
            if isinstance(data, list) and data:
                valid_pairs = [x for x in data if isinstance(x, dict)]
                if valid_pairs:
                    return chain, valid_pairs
            return None

        if resp is not None and resp.status_code not in RETRY_STATUS:
            return None

        if attempt < MAX_RETRIES - 1:
            await asyncio.sleep(RETRY_BACKOFF_SEC * (2 ** attempt))
    return None

@router.get("/token_meta")
async def token_meta(ca: str = Query(min_length=3)):
    """
    CA adresiyle tüm ağları PARALEL tarar,
    Dexscreener'dan metadata döner.
    """
    ca_l = ca.lower()
    cached = await _cache_get_async(ca_l)
    if cached:
        return cached

    
    # Tüm ağlara aynı anda istek atalım (Concurrency)
    async with httpx.AsyncClient(timeout=10) as client:
        tasks = [check_chain(client, chain, ca_l) for chain in SUPPORTED_CHAINS]
        results = await asyncio.gather(*tasks)

    # Sonuçlardan dolu olanı bulalım
    found_chain = None
    found_data = None

    for res in results:
        if res:
            found_chain, found_data = res
            break # İlk bulunanı al (veya mantığına göre en kalabalık olanı seçebilirsin)

    if not found_data or not found_chain:
        raise HTTPException(status_code=404, detail="Token herhangi bir desteklenen ağda bulunamadı.")

    # En uygun çifti seçelim
    chosen = None
    for p in found_data:
        # Base token adresi eşleşen çifti önceliklendir
        if str(p.get("baseToken", {}).get("address", "")).lower() == ca_l:
            chosen = p
            break
    
    if chosen is None:
        chosen = found_data[0]

    base = chosen.get("baseToken", {}) if isinstance(chosen, dict) else {}
    name = base.get("name")
    symbol = base.get("symbol")

    created_list = []
    for p in found_data:
        ts = p.get("pairCreatedAt")
        if isinstance(ts, (int, float)) and ts > 0:
            created_list.append(int(ts))

    launch_ts = _ms_to_dt_utc(min(created_list)).isoformat() if created_list else None

    result = {
        "name": name,
        "symbol": symbol,
        "launch_ts": launch_ts,
        "pairs_found": len(found_data),
        "chain": found_chain,
    }
    await _cache_set_async(ca_l, result)
    return result