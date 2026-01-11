from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ScoreCreate(BaseModel):
    ca: str = Field(min_length=3)
    intuition_score: int = Field(ge=1, le=10)


class ScoreOut(BaseModel):
    id: int
    ca: str
    scored_ts: datetime
    intuition_score: int