from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime


SourceType = Literal["dex", "influencer", "both"]


class CoinCreate(BaseModel):
    ca: str = Field(min_length=3)
    name: str = Field(min_length=1)
    symbol: Optional[str] = None
    launch_ts: Optional[datetime] = None
    source_type: SourceType
    chain: Optional[str] = None  

class CoinOut(BaseModel):
    ca: str
    name: str
    symbol: Optional[str] = None
    launch_ts: Optional[datetime] = None
    source_type: SourceType
    chain: Optional[str] = None   
    created_ts: datetime


class ContextOut(BaseModel):
    id: int
    active_ca: Optional[str] = None
    active_chain: Optional[str] = None
    updated_ts: datetime


class ContextSet(BaseModel):
    active_ca: Optional[str] = None  # null -> unset active coin
    active_chain: Optional[str] = None
