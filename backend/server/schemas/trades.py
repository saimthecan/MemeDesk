from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class BubbleRow(BaseModel):
    rank: int = Field(gt=0)
    pct: float = Field(ge=0)


class BubblesData(BaseModel):
    clusters: List[BubbleRow] = []
    others: List[BubbleRow] = []


class ScoringData(BaseModel):
    intuition_score: int = Field(ge=1, le=10)


class TradeOpen(BaseModel):
    ca: str = Field(min_length=3)
    chain: Optional[str] = None
    entry_mcap_usd: float = Field(gt=0)
    size_usd: Optional[float] = Field(default=None, gt=0)
    bubbles: Optional[BubblesData] = None
    scoring: Optional[ScoringData] = None


class TradeClose(BaseModel):
    trade_id: Optional[str] = Field(default=None, min_length=3)
    exit_mcap_usd: float = Field(gt=0)
    exit_reason: Optional[str] = None


class TradeOut(BaseModel):
    id: int
    trade_id: str
    ca: str
    chain: Optional[str] = None
    coin_name: str

    entry_ts: datetime
    entry_mcap_usd: float
    size_usd: Optional[float] = None

    exit_ts: Optional[datetime] = None
    exit_mcap_usd: Optional[float] = None
    exit_reason: Optional[str] = None

    pnl_pct: Optional[float] = None
    pnl_usd: Optional[float] = None
    
    # Trade-specific bubbles and scoring
    bubbles: Optional[BubblesData] = None
    scoring: Optional[ScoringData] = None
    
# schemas_trades.py dosyasının sonuna eklendi
class TradeUpdate(BaseModel):
    entry_mcap_usd: Optional[float] = Field(default=None, gt=0)
    size_usd: Optional[float] = Field(default=None, gt=0)
    exit_mcap_usd: Optional[float] = Field(default=None, gt=0)
    exit_reason: Optional[str] = None


class TradesPageOut(BaseModel):
    items: List[TradeOut]
    total_count: int
    open_count: int
    closed_count: int
    next_cursor: Optional[str] = None
