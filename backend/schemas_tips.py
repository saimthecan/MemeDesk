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


class AccountCreate(BaseModel):
    platform: str = Field(min_length=1)
    handle: str = Field(min_length=1)


class AccountOut(BaseModel):
    account_id: int
    platform: str
    handle: str
    created_ts: datetime


class TipCreate(BaseModel):
    ca: str = Field(min_length=3)
    account_id: int
    post_ts: datetime
    post_mcap_usd: float = Field(gt=0)
    bubbles: Optional[BubblesData] = None
    scoring: Optional[ScoringData] = None


class TipUpdate(BaseModel):
    peak_mcap_usd: Optional[float] = Field(default=None, gt=0)
    trough_mcap_usd: Optional[float] = Field(default=None, gt=0)
    rug_flag: Optional[int] = Field(default=None)  # 0/1


class TipOut(BaseModel):
    tip_id: int
    ca: str
    coin_name: str
    account_id: int
    platform: str
    handle: str
    post_ts: datetime
    post_mcap_usd: float
    peak_mcap_usd: Optional[float] = None
    trough_mcap_usd: Optional[float] = None
    rug_flag: Optional[int] = None
    gain_pct: Optional[float] = None
    drop_pct: Optional[float] = None
    effect_pct: Optional[float] = None
    
    # Tip-specific bubbles and scoring
    bubbles: Optional[BubblesData] = None
    scoring: Optional[ScoringData] = None


class TipsPageOut(BaseModel):
    items: List[TipOut]
    total_count: int
    next_cursor: Optional[str] = None
