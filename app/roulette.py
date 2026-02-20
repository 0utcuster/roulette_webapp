from __future__ import annotations

import random
from typing import Dict, Any, Optional

from sqlalchemy.orm import Session

from app.models import User, Transaction, TxType, PrizeConfig
from app.config import settings

# Пытаемся взять наборы рулеток из roulette_sets.py
try:
    from app.roulette_sets import ROULETTES  # dict: roulette_id -> config
except Exception:
    ROULETTES = {}


def _choose_prize(prizes: list[dict]) -> dict:
    """
    prizes: [{ "code": "...", "title": "...", "type": "ticket|stars|discount",
               "amount": int, "weight": float/int, ... }]
    """
    weights = [float(p.get("weight", 1.0)) for p in prizes]
    return random.choices(prizes, weights=weights, k=1)[0]


def _default_roulette() -> dict:
    # fallback если roulette_sets сломан/пустой
    return {
        "id": "r1",
        "title": "Рулетка",
        "spin_cost": settings.spin_cost,
        "prizes": [
            {"code": "ticket_sneakers", "title": "Кроссовки", "type": "ticket", "amount": 1, "weight": 20},
            {"code": "ticket_bracelet", "title": "Браслет", "type": "ticket", "amount": 1, "weight": 25},
            {"code": "discount_10", "title": "Скидка 10%", "type": "discount", "amount": 10, "weight": 20},
            {"code": "discount_20", "title": "Скидка 20%", "type": "discount", "amount": 20, "weight": 15},
            {"code": "stars_150", "title": "150 Stars", "type": "stars", "amount": 150, "weight": 12},
            {"code": "stars_500", "title": "500 Stars", "type": "stars", "amount": 500, "weight": 6},
            {"code": "stars_1000", "title": "1000 Stars", "type": "stars", "amount": 1000, "weight": 2},
        ],
    }


def _get_roulette(roulette_id: str) -> dict:
    if ROULETTES and roulette_id in ROULETTES:
        r = dict(ROULETTES[roulette_id])
        # поддержка если в конфиге нет spin_cost
        r.setdefault("spin_cost", settings.spin_cost)
        return r
    # если id неизвестен — берём первую рулетку или дефолт
    if ROULETTES:
        first_key = next(iter(ROULETTES.keys()))
        r = dict(ROULETTES[first_key])
        r.setdefault("spin_cost", settings.spin_cost)
        return r
    return _default_roulette()


def _tx(db: Session, user_id: int, ttype: str, amount: int, desc: str, meta: Optional[dict]=None) -> None:
    try:
        tx_type = TxType(ttype)
    except Exception:
        tx_type = TxType.win
    db.add(Transaction(user_id=user_id, type=tx_type, amount=amount, description=desc, meta=meta or {}))


def spin_once(db: Session, user: User, roulette_id: str) -> Dict[str, Any]:
    """
    Ожидается в app/main.py
    Возвращает:
      {
        ok: bool,
        roulette_id,
        cost,
        balance,
        prize: {type, title, code, amount},
        ui: { reel_label, win_text }
      }
    """
    roulette = _get_roulette(roulette_id)
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

    # списываем стоимость
    user.balance -= cost
    _tx(db, user.user_id, "spin", -cost, f"Spin {roulette.get('title','Roulette')} ({roulette.get('id', roulette_id)})")

    # Apply admin-configurable weights / enabled flags (PrizeConfig)
    cfg_rows = db.query(PrizeConfig).all()
    cfg = {str(c.key.value if hasattr(c.key,'value') else c.key): c for c in cfg_rows}
    prizes = list(roulette.get("prizes", [])) or _default_roulette()["prizes"]
    filtered = []
    for p in prizes:
        code = str(p.get("code") or "")
        c = cfg.get(code)
        if c is not None and int(getattr(c, "is_enabled", 1)) == 0:
            continue
        pp = dict(p)
        if c is not None:
            pp["weight"] = int(getattr(c, "weight", pp.get("weight", 1)) or 0)
        filtered.append(pp)
    if filtered:
        prizes = filtered

    prize = _choose_prize(prizes)
    p_type = prize.get("type")
    p_amount = int(prize.get("amount", 0) or 0)

    # логика выигрыша
    win_text = ""
    reel_label = prize.get("title", "Prize")

    if p_type == "ticket":
        code = prize.get("code", "")
        if code == "ticket_sneakers":
            user.tickets_sneakers = (user.tickets_sneakers or 0) + p_amount
            # в выдаче пишем "тикет", а в ленте можно показывать "кроссы"
            win_text = f"Вы выиграли тикет на 👟 кроссовки (+{p_amount})"
            reel_label = "Кроссовки"
            _tx(db, user.user_id, "win", 0, f"Win ticket_sneakers +{p_amount}")
        elif code == "ticket_bracelet":
            user.tickets_bracelet = (user.tickets_bracelet or 0) + p_amount
            win_text = f"Вы выиграли тикет на 📿 браслет (+{p_amount})"
            reel_label = "Браслет"
            _tx(db, user.user_id, "win", 0, f"Win ticket_bracelet +{p_amount}")
        else:
            win_text = f"Вы выиграли тикет (+{p_amount})"
            _tx(db, user.user_id, "win", 0, f"Win ticket {code} +{p_amount}")

    elif p_type == "stars":
        user.balance += p_amount
        win_text = f"Вы выиграли ⭐ {p_amount} Stars"
        _tx(db, user.user_id, "win", p_amount, f"Win stars +{p_amount}")

    elif p_type == "discount":
        # скидку храним только в истории
        percent = p_amount
        win_text = f"Вы выиграли скидку 💸 {percent}%"
        _tx(db, user.user_id, "win", 0, f"Win discount {percent}%")

    else:
        win_text = f"Вы выиграли {prize.get('title','приз')}"
        _tx(db, user.user_id, "win", 0, f"Win {prize.get('title','prize')}")

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "ok": True,
        "roulette_id": roulette.get("id", roulette_id),
        "cost": cost,
        "balance": user.balance,
        "tickets": {
            "sneakers": int(user.tickets_sneakers or 0),
            "bracelet": int(user.tickets_bracelet or 0),
        },
        "prize": {
            "type": p_type,
            "code": prize.get("code"),
            "title": prize.get("title"),
            "amount": p_amount,
        },
        "ui": {
            "reel_label": reel_label,
            "win_text": win_text,
        },
    }
