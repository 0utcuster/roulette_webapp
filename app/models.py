from __future__ import annotations
import enum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Enum, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

class TxType(str, enum.Enum):
    deposit = "deposit"
    spin = "spin"
    win = "win"
    withdraw = "withdraw"
    referral = "referral"
    admin_adjust = "admin_adjust"

class WithdrawStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    rejected = "rejected"

class PrizeReqStatus(str, enum.Enum):
    new = "new"
    processing = "processing"
    completed = "completed"

class PrizeKey(str, enum.Enum):
    ticket_sneakers = "ticket_sneakers"
    ticket_bracelet = "ticket_bracelet"
    discount_10 = "discount_10"
    discount_20 = "discount_20"
    discount_50 = "discount_50"
    stars_150 = "stars_150"
    stars_500 = "stars_500"
    stars_1000 = "stars_1000"

class User(Base):
    __tablename__ = "users"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    balance: Mapped[int] = mapped_column(Integer, default=0)
    tickets_sneakers: Mapped[int] = mapped_column(Integer, default=0)
    tickets_bracelet: Mapped[int] = mapped_column(Integer, default=0)
    referrer_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user", cascade="all, delete-orphan")

class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), index=True)
    type: Mapped[TxType] = mapped_column(Enum(TxType), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    # DB column is named "title" (historical), but the app expects "description"
    description: Mapped[str] = mapped_column("title", String(140), default="")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    user: Mapped["User"] = relationship(back_populates="transactions")

    # Aliases for old code / templates
    @property
    def title(self) -> str:
        return self.description

    @title.setter
    def title(self, v: str) -> None:
        self.description = v

    @property
    def date(self):
        return self.created_at


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    telegram_payment_charge_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    total_amount: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

class PrizeRequest(Base):
    __tablename__ = "prize_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), index=True)
    prize_type: Mapped[str] = mapped_column(String(20))
    status: Mapped[PrizeReqStatus] = mapped_column(Enum(PrizeReqStatus), default=PrizeReqStatus.new, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

class WithdrawRequest(Base):
    __tablename__ = "withdraw_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    status: Mapped[WithdrawStatus] = mapped_column(Enum(WithdrawStatus), default=WithdrawStatus.pending, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

class PrizeConfig(Base):
    __tablename__ = "prize_config"
    key: Mapped[PrizeKey] = mapped_column(Enum(PrizeKey), primary_key=True)
    weight: Mapped[int] = mapped_column(Integer, default=1)
    is_enabled: Mapped[int] = mapped_column(Integer, default=1)

Index("ix_transactions_user_created", Transaction.user_id, Transaction.created_at.desc())
