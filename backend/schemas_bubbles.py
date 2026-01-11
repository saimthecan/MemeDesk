from pydantic import BaseModel, Field
from typing import List


class BubbleRow(BaseModel):
    rank: int = Field(gt=0)
    pct: float = Field(ge=0)


class BubblesSet(BaseModel):
    ca: str | None = None
    clusters: List[BubbleRow] = []
    others: List[BubbleRow] = []