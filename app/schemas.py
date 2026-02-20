from __future__ import annotations

from typing import Optional, Literal
from pydantic import BaseModel, Field


# --- API inputs ---

class SpinIn(BaseModel):
    roulette_id: str = Field(default="r1", min_length=1, max_length=50)


class WithdrawIn(BaseModel):
    amount: int = Field(..., ge=1)


class InvoiceIn(BaseModel):
    amount: int = Field(..., ge=1)
    title: Optional[str] = Field(default="Пополнение")
    description: Optional[str] = Field(default=None)


# --- (опционально) общие модели, если где-то используются ---
TransactionType = Literal["deposit", "spin", "win", "withdraw", "referral"]


class TxOut(BaseModel):
    id: int
    type: TransactionType
    amount: int
    description: str
    date: Optional[str] = None
