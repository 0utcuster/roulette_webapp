from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import CaseConfig, Transaction, TxType, User
from app.roulette_sets import DEFAULT_CASES

MEDIA_CONFIG_PATH = Path(__file__).resolve().parent / "static" / "prizes" / "roulettes.json"


def _load_media_config() -> dict[str, Any]:
    try:
        with MEDIA_CONFIG_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _default_rarity(p: dict[str, Any]) -> str:
    p_type = str(p.get("type") or "item")
    code = str(p.get("code") or "")
    weight = max(0, int(p.get("weight") or 0))
    if p_type == "item":
        if any(x in code for x in ("vip", "full_look", "exclusive", "limited", "cert_3000")):
            return "yellow"
        if weight <= 2:
            return "red"
        if weight <= 5:
            return "purple"
        return "blue"
    if p_type == "stars":
        if any(code.endswith(x) for x in ("1000", "500")):
            return "yellow"
        if any(code.endswith(x) for x in ("300", "200")):
            return "purple"
        return "blue"
    if p_type == "discount":
        if "50" in code or "30" in code:
            return "red"
        if "25" in code or "20" in code:
            return "purple"
        return "blue"
    return "blue"


def _user_item_ticket_progress(db: Session, user_id: int) -> dict[str, int]:
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == int(user_id), Transaction.type == TxType.win)
        .all()
    )
    out: dict[str, int] = {}
    for t in rows:
        meta = t.meta or {}
        code = str(meta.get("prize_code") or "")
        added = int(meta.get("hidden_tickets_added") or 0)
        sold = int(meta.get("hidden_tickets_sold") or 0)
        if not code:
            continue
        out[code] = int(out.get(code, 0)) + added - sold
    return {k: v for k, v in out.items() if v > 0}


def _maybe_boost_near_target_ticket(db: Session, user: User, roulette: dict[str, Any], prize: dict[str, Any]) -> dict[str, Any]:
    prizes = list(roulette.get("prizes") or [])
    if not prizes:
        return prize

    media = _load_media_config()
    economy = media.get("economy") if isinstance(media.get("economy"), dict) else {}
    boost_percent = int((economy or {}).get("near_target_ticket_boost_percent") or 0)
    if boost_percent <= 0:
        return prize

    targets = media.get("ticket_targets") if isinstance(media.get("ticket_targets"), dict) else {}
    progress = _user_item_ticket_progress(db, int(user.user_id))

    one_left_codes: list[str] = []
    boosted_codes: list[str] = []
    left_map: dict[str, int] = {}
    for p in prizes:
        if str(p.get("type") or "") != "item":
            continue
        code = str(p.get("code") or "")
        if not code:
            continue
        default_target = 10 if code == "shoes" else 5
        target = max(1, int((targets or {}).get(code) or default_target))
        left = max(0, target - int(progress.get(code, 0)))
        left_map[code] = left
        if left == 1:
            one_left_codes.append(code)
        elif left in (2, 3):
            boosted_codes.append(code)

    current_code = str(prize.get("code") or "")
    current_type = str(prize.get("type") or "")

    # When only 1 ticket is left, make the drop intentionally much rarer than usual.
    if current_type == "item" and current_code in one_left_codes:
        penalty_roll = max(70, min(97, 100 - max(1, boost_percent // 2)))  # higher => rarer final ticket
        if random.randint(1, 100) <= penalty_roll:
            alt = [
                p for p in prizes
                if int(p.get("is_enabled") or 0) == 1
                and not (str(p.get("type") or "") == "item" and str(p.get("code") or "") in one_left_codes)
            ]
            if alt:
                weights = [max(1, int(p.get("weight") or 1)) for p in alt]
                return random.choices(alt, weights=weights, k=1)[0]

    if not boosted_codes:
        return prize
    if current_type == "item" and current_code in boosted_codes:
        return prize
    if random.random() > (boost_percent / 100.0):
        return prize

    boosted = [
        p for p in prizes
        if str(p.get("type") or "") == "item"
        and str(p.get("code") or "") in boosted_codes
        and int(p.get("is_enabled") or 0) == 1
    ]
    if not boosted:
        return prize
    weights = [max(1, int(p.get("weight") or 1)) for p in boosted]
    return random.choices(boosted, weights=weights, k=1)[0]


def _tx(db: Session, user_id: int, ttype: str, amount: int, desc: str, meta: Optional[dict] = None) -> None:
    try:
        tx_type = TxType(ttype)
    except Exception:
        tx_type = TxType.win
    db.add(Transaction(user_id=user_id, type=tx_type, amount=amount, description=desc, meta=meta or {}))


def _norm_prize(p: dict[str, Any]) -> dict[str, Any]:
    rarity = str(p.get("rarity") or _default_rarity(p)).lower().strip()
    if rarity not in {"blue", "purple", "red", "yellow"}:
        rarity = _default_rarity(p)
    return {
        "code": str(p.get("code") or "prize"),
        "title": str(p.get("title") or p.get("code") or "Приз"),
        "type": str(p.get("type") or "item"),
        "amount": int(p.get("amount") or 0),
        "weight": max(0, int(p.get("weight") or 0)),
        "is_enabled": 1 if bool(p.get("is_enabled", True)) else 0,
        "rarity": rarity,
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
    _tx(
        db,
        user.user_id,
        "spin",
        -cost,
        f"Spin {roulette.get('title', 'Case')} ({roulette.get('id', roulette_id)})",
        {"roulette_id": roulette.get("id", roulette_id), "case_cost": cost},
    )

    try:
        prize = _choose_prize(list(roulette.get("prizes") or []))
        prize = _maybe_boost_near_target_ticket(db, user, roulette, prize)
    except Exception:
        return {"ok": False, "message": "В кейсе нет доступных призов"}

    p_type = str(prize.get("type") or "item")
    p_title = str(prize.get("title") or "Приз")
    p_code = str(prize.get("code") or "prize")
    p_amount = int(prize.get("amount", 0) or 0)

    if p_type == "stars":
        user.balance += p_amount
        win_text = f"Вы выиграли ⭐ {p_amount} Stars"
        _tx(
            db,
            user.user_id,
            "win",
            p_amount,
            f"Win stars +{p_amount}",
            {"prize_code": p_code, "roulette_id": roulette.get("id"), "case_cost": cost, "rarity": prize.get("rarity")},
        )
    elif p_type == "discount":
        win_text = f"Вы выиграли {p_title}"
        _tx(
            db,
            user.user_id,
            "win",
            0,
            f"Win discount {p_title}",
            {"prize_code": p_code, "percent": p_amount, "roulette_id": roulette.get("id"), "case_cost": cost, "rarity": prize.get("rarity")},
        )
    else:
        # Hidden ticket accrual: user sees item drop text, while tickets are tracked internally.
        qty = max(1, p_amount or 1)
        ticket_kind = "bracelet" if p_code in {"bracelet"} else "sneakers"
        if ticket_kind == "bracelet":
            user.tickets_bracelet = int(user.tickets_bracelet or 0) + qty
        else:
            user.tickets_sneakers = int(user.tickets_sneakers or 0) + qty
        win_text = f"Вы выиграли {p_title}"
        _tx(
            db,
            user.user_id,
            "win",
            0,
            f"Win item {p_title}",
            {
                "prize_code": p_code,
                "amount": p_amount,
                "hidden_tickets_added": qty,
                "hidden_ticket_kind": ticket_kind,
                "hidden_tickets_sold": 0,
                "roulette_id": roulette.get("id"),
                "case_cost": cost,
                "rarity": prize.get("rarity"),
            },
        )

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
            "rarity": str(prize.get("rarity") or "blue"),
        },
        "ui": {
            "reel_label": p_title,
            "win_text": win_text,
        },
    }
