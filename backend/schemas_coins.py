# schemas_coins.py
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class CoinCreate(BaseModel):
    ca: str = Field(min_length=3)
    name: str = Field(min_length=1)
    symbol: Optional[str] = None
    chain: str = Field(default="solana")
    launch_ts: Optional[datetime] = None
    source_type: str = Field(default="trades")


class CoinOut(BaseModel):
    ca: str
    name: str
    symbol: Optional[str] = None
    chain: str
    launch_ts: Optional[datetime] = None
    source_type: str
    created_ts: Optional[datetime] = None
