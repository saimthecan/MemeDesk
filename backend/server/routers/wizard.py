import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..db import pool
from ..auth import require_admin

router = APIRouter(prefix="/wizard", tags=["wizard"])


class BubbleRow(BaseModel):
    rank: int = Field(gt=0)
    pct: float = Field(ge=0)


class WizardBubbles(BaseModel):
    clusters: List[BubbleRow] = []
    others: List[BubbleRow] = []


class DexAdd(BaseModel):
    # Coin
    ca: str = Field(min_length=3)
    name: Optional[str] = None
    symbol: Optional[str] = None
    launch_ts: Optional[datetime] = None
    chain: Optional[str] = None

    # Trade
    entry_mcap_usd: float = Field(gt=0)
    size_usd: Optional[float] = Field(default=None, gt=0)

    # Extra blocks
    bubbles: WizardBubbles = WizardBubbles()
    intuition_score: Optional[int] = Field(default=None, ge=1, le=10)


class InfluencerAdd(BaseModel):
    # Coin
    ca: str = Field(min_length=3)
    name: Optional[str] = None
    symbol: Optional[str] = None
    launch_ts: Optional[datetime] = None
    chain: Optional[str] = None

    # Account + tip
    platform: str = Field(min_length=1)
    handle: str = Field(min_length=1)
    post_ts: datetime
    post_mcap_usd: float = Field(gt=0)

    # Extra blocks
    bubbles: WizardBubbles = WizardBubbles()
    intuition_score: Optional[int] = Field(default=None, ge=1, le=10)


def _merge_source_type(old: str | None, add: str) -> str:
    if not old:
        return add
    if old == add:
        return old
    return "both"


def _accounts_table(cur) -> str:
    cur.execute(
        "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounts';"
    )
    return "accounts" if cur.fetchone() else "social_accounts"


def _upsert_coin(
    cur,
    ca: str,
    name: Optional[str],
    symbol: Optional[str],
    launch_ts: Optional[datetime],
    chain: Optional[str],
    add_source: str,
):
    ca_l = ca.lower()

    # normalize chain
    chain_norm = (chain or "").strip().lower()
    if chain_norm in ("", "unknown"):
        chain_norm = "solana"

    cur.execute("SELECT source_type, chain FROM coins WHERE ca = %s AND chain = %s;", (ca_l, chain_norm))
    row = cur.fetchone()

    if row:
        old_source, old_chain = row
        new_source = _merge_source_type(old_source, add_source)
        
        # update if we have better info
        updates = []
        params = []
        if name:
            updates.append("name = %s")
            params.append(name)
        if symbol:
            updates.append("symbol = %s")
            params.append(symbol)
        if launch_ts:
            updates.append("launch_ts = %s")
            params.append(launch_ts)
        updates.append("source_type = %s")
        params.append(new_source)
        
        if updates:
            sql = f"UPDATE coins SET {', '.join(updates)} WHERE ca = %s AND chain = %s RETURNING ca, name, symbol, launch_ts, chain, source_type;"
            params.extend([ca_l, chain_norm])
            cur.execute(sql, tuple(params))
            return cur.fetchone()
        return (ca_l, name, symbol, launch_ts, old_chain, old_source)
    else:
        # insert
        cur.execute(
            """
            INSERT INTO coins (ca, name, symbol, launch_ts, chain, source_type)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING ca, name, symbol, launch_ts, chain, source_type;
            """,
            (ca_l, name or "Unknown", symbol, launch_ts, chain_norm, add_source),
        )
        return cur.fetchone()


def _set_trade_bubbles(cur, trade_id: str, bubbles: WizardBubbles):
    """Set bubbles for a specific trade (trade-based, not coin-based)"""
    # delete old
    cur.execute("DELETE FROM trade_bubbles WHERE trade_id = %s;", (trade_id,))
    cur.execute("DELETE FROM trade_bubbles_others WHERE trade_id = %s;", (trade_id,))

    # insert new
    for row in bubbles.clusters:
        cur.execute(
            "INSERT INTO trade_bubbles (trade_id, cluster_rank, pct) VALUES (%s, %s, %s);",
            (trade_id, row.rank, row.pct),
        )
    for row in bubbles.others:
        cur.execute(
            "INSERT INTO trade_bubbles_others (trade_id, other_rank, pct) VALUES (%s, %s, %s);",
            (trade_id, row.rank, row.pct),
        )


def _insert_trade_score(cur, trade_id: str, intuition_score: Optional[int]):
    """Insert scoring for a specific trade (trade-based, not coin-based)"""
    if intuition_score is None:
        return None
    cur.execute(
        """
        INSERT INTO trade_scoring (trade_id, intuition_score)
        VALUES (%s, %s)
        RETURNING id, scored_ts;
        """,
        (trade_id, intuition_score),
    )
    return cur.fetchone()


def _set_tip_bubbles(cur, tip_id: int, bubbles: WizardBubbles):
    """Set bubbles for a specific tip (tip-based, not coin-based)"""
    # delete old
    cur.execute("DELETE FROM tip_bubbles WHERE tip_id = %s;", (tip_id,))
    cur.execute("DELETE FROM tip_bubbles_others WHERE tip_id = %s;", (tip_id,))

    # insert new
    for row in bubbles.clusters:
        cur.execute(
            "INSERT INTO tip_bubbles (tip_id, cluster_rank, pct) VALUES (%s, %s, %s);",
            (tip_id, row.rank, row.pct),
        )
    for row in bubbles.others:
        cur.execute(
            "INSERT INTO tip_bubbles_others (tip_id, other_rank, pct) VALUES (%s, %s, %s);",
            (tip_id, row.rank, row.pct),
        )


def _insert_tip_score(cur, tip_id: int, intuition_score: Optional[int]):
    """Insert scoring for a specific tip (tip-based, not coin-based)"""
    if intuition_score is None:
        return None
    cur.execute(
        """
        INSERT INTO tip_scoring (tip_id, intuition_score)
        VALUES (%s, %s)
        RETURNING id, scored_ts;
        """,
        (tip_id, intuition_score),
    )
    return cur.fetchone()


@router.post("/dex_add", dependencies=[Depends(require_admin)])
def dex_add(payload: DexAdd):
    ca = payload.ca.lower()
    trade_id_str = f"trade_{uuid.uuid4().hex[:8]}" # Generate trade_id

    with pool.connection() as conn:
        with conn.cursor() as cur:
            coin = _upsert_coin(
                cur,
                ca,
                payload.name,
                payload.symbol,
                payload.launch_ts,
                payload.chain,
                "dex",
            )

            cur.execute(
                """
                INSERT INTO trades (ca, chain, entry_mcap_usd, size_usd, trade_id)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, trade_id, entry_ts;
                """,
                (ca, coin[4], payload.entry_mcap_usd, payload.size_usd, trade_id_str),
            )
            trade = cur.fetchone()
            trade_id_int = trade[0]  # Get the database ID (INTEGER)
            trade_id_str = trade[1]  # Get the STRING trade_id

            # Set bubbles and scoring for THIS TRADE (not coin)
            # Use STRING trade_id, not INTEGER id!
            _set_trade_bubbles(cur, trade_id_str, payload.bubbles)
            score = _insert_trade_score(cur, trade_id_str, payload.intuition_score)
            conn.commit()

    return {
        "ok": True,
        "coin": {
            "ca": coin[0],
            "name": coin[1],
            "symbol": coin[2],
            "launch_ts": coin[3].isoformat() if coin[3] else None,
            "chain": coin[4],
            "source_type": coin[5],
        },
        "trade": {
            "id": trade[0],
            "trade_id": trade[1],
            "entry_ts": trade[2].isoformat() if trade[2] else None,
        },
        "score": {"id": score[0], "scored_ts": score[1].isoformat()} if score else None,
    }


@router.post("/influencer_add", dependencies=[Depends(require_admin)])
def influencer_add(payload: InfluencerAdd):
    ca = payload.ca.lower()
    
    with pool.connection() as conn:
        with conn.cursor() as cur:
            coin = _upsert_coin(
                cur,
                ca,
                payload.name,
                payload.symbol,
                payload.launch_ts,
                payload.chain,
                "influencer",
            )

            accounts_table = _accounts_table(cur)
            cur.execute(
                f"""
                INSERT INTO {accounts_table} (platform, handle)
                VALUES (%s, %s)
                ON CONFLICT (platform, handle) DO UPDATE SET handle = EXCLUDED.handle
                RETURNING account_id;
                """,
                (payload.platform, payload.handle),
            )
            acc_id = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO tips (account_id, ca, chain, post_ts, post_mcap_usd)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING tip_id;
                """,
                (acc_id, ca, coin[4], payload.post_ts, payload.post_mcap_usd),
            )
            tip_id = cur.fetchone()[0]  # Get the INTEGER id

            # Set bubbles and scoring for THIS TIP (not coin)
            # For tips, we need to check the schema - use INTEGER id if tip_id is INTEGER
            _set_tip_bubbles(cur, tip_id, payload.bubbles)
            score = _insert_tip_score(cur, tip_id, payload.intuition_score)
            conn.commit()

    return {
        "ok": True,
        "coin": {
            "ca": coin[0],
            "name": coin[1],
            "symbol": coin[2],
            "launch_ts": coin[3].isoformat() if coin[3] else None,
            "chain": coin[4],
            "source_type": coin[5],
        },
        "tip_id": tip_id,
        "score": {"id": score[0], "scored_ts": score[1].isoformat()} if score else None,
    }
