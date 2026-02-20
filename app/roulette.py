from __future__ import annotations

import random
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import CaseConfig, Transaction, TxType, User
from app.roulette_sets import DEFAULT_CASES


def _tx(db: Session, user_id: int, ttype: str, amount: int, desc: str, meta: Optional[dict] = None) -> None:
    try:
        tx_type = TxType(ttype)
    except Exception:
        tx_type = TxType.win
    db.add(Transaction(user_id=user_id, type=tx_type, amount=amount, description=desc, meta=meta or {}))


def _norm_prize(p: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": str(p.get("code") or "prize"),
        "title": str(p.get("title") or p.get("code") or "Приз"),
        "type": str(p.get("type") or "item"),
        "amount": int(p.get("amount") or 0),
        "weight": max(0, int(p.get("weight") or 0)),
        "is_enabled": 1 if bool(p.get("is_enabled", True)) else 0,
    }


def _norm_case(c: dict[str, Any]) -> dict[str, Any]:
    prizes = [_norm_prize(p) for p in (c.get("prizes") or [])]
    return {
        "id": str(c.get("id") or "r1"),
        "title": str(c.get("title") or "Кейс"),
        "spin_cost": max(1, int(c.get("spin_cost") or settings.spin_cost)),
        "slots": max(1, int(c.get("slots") or sum(max(0, int(p.get("weight") or 0)) for p in prizes) or 20)),
        "prizes": prizes,
        "is_enabled": 1 if bool(c.get("is_enabled", True)) else 0,
    }


def ensure_case_configs(db: Session) -> None:
    if db.query(CaseConfig).count() > 0:
        return
    for raw in DEFAULT_CASES:
        c = _norm_case(raw)
        db.add(
            CaseConfig(
                id=c["id"],
                title=c["title"],
                spin_cost=c["spin_cost"],
                slots=c["slots"],
                prizes=c["prizes"],
                is_enabled=c["is_enabled"],
            )
        )
    db.commit()


def list_cases(db: Session) -> list[dict[str, Any]]:
    ensure_case_configs(db)
    rows = db.query(CaseConfig).order_by(CaseConfig.id.asc()).all()
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            _norm_case(
                {
                    "id": r.id,
                    "title": r.title,
                    "spin_cost": r.spin_cost,
                    "slots": r.slots,
                    "prizes": r.prizes or [],
                    "is_enabled": r.is_enabled,
                }
            )
        )
    return out


def save_cases(db: Session, items: list[dict[str, Any]]) -> None:
    if not items:
        return

    seen_ids: set[str] = set()
    for raw in items:
        c = _norm_case(raw)
        cid = c["id"]
        if not cid:
            continue
        seen_ids.add(cid)
        row = db.query(CaseConfig).filter(CaseConfig.id == cid).first()
        if not row:
            row = CaseConfig(id=cid)
            db.add(row)
        row.title = c["title"]
        row.spin_cost = c["spin_cost"]
        row.slots = c["slots"]
        row.prizes = c["prizes"]
        row.is_enabled = c["is_enabled"]

    for row in db.query(CaseConfig).all():
        if row.id not in seen_ids:
            db.delete(row)
    db.commit()


def _get_case(db: Session, roulette_id: str) -> dict[str, Any]:
    cases = list_cases(db)
    if not cases:
        return _norm_case(DEFAULT_CASES[0])
    by_id = {c["id"]: c for c in cases}
    return by_id.get(roulette_id) or cases[0]


def _choose_prize(prizes: list[dict[str, Any]]) -> dict[str, Any]:
    enabled = [p for p in prizes if int(p.get("is_enabled") or 0) == 1 and int(p.get("weight") or 0) > 0]
    if not enabled:
        raise RuntimeError("No enabled prizes with positive weight")
    weights = [float(p.get("weight", 1.0)) for p in enabled]
    return random.choices(enabled, weights=weights, k=1)[0]


def spin_once(db: Session, user: User, roulette_id: str) -> Dict[str, Any]:
    roulette = _get_case(db, roulette_id)
    cost = int(roulette.get("spin_cost") or settings.spin_cost)

    if user.balance < cost:
        return {
            "ok": False,
            "error": "insufficient_balance",
            "message": "Недостаточно Stars",
            "roulette_id": roulette.get("id", roulette_id),
            "cost": cost,
            "balance": user.balance,
        }

    user.balance -= cost
    _tx(db, user.user_id, "spin", -cost, f"Spin {roulette.get('title', 'Case')} ({roulette.get('id', roulette_id)})")

    try:
        prize = _choose_prize(list(roulette.get("prizes") or []))
    except Exception:
        return {"ok": False, "message": "В кейсе нет доступных призов"}

    p_type = str(prize.get("type") or "item")
    p_title = str(prize.get("title") or "Приз")
    p_code = str(prize.get("code") or "prize")
    p_amount = int(prize.get("amount", 0) or 0)

    if p_type == "stars":
        user.balance += p_amount
        win_text = f"Вы выиграли ⭐ {p_amount} Stars"
        _tx(db, user.user_id, "win", p_amount, f"Win stars +{p_amount}", {"prize_code": p_code})
    elif p_type == "discount":
        win_text = f"Вы выиграли {p_title}"
        _tx(db, user.user_id, "win", 0, f"Win discount {p_title}", {"prize_code": p_code, "percent": p_amount})
    else:
        win_text = f"Вы выиграли {p_title}"
        _tx(db, user.user_id, "win", 0, f"Win item {p_title}", {"prize_code": p_code, "amount": p_amount})

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "ok": True,
        "roulette_id": roulette.get("id", roulette_id),
        "cost": cost,
        "balance": int(user.balance),
        "tickets": {
            "sneakers": int(user.tickets_sneakers or 0),
            "bracelet": int(user.tickets_bracelet or 0),
        },
        "prize": {
            "type": p_type,
            "code": p_code,
            "title": p_title,
            "amount": p_amount,
        },
        "ui": {
            "reel_label": p_title,
            "win_text": win_text,
        },
    }
