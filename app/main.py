from __future__ import annotations

import json
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, Request, Depends, HTTPException, Query, Header, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.db import SessionLocal, init_db
from app.models import (
    User, Transaction, PrizeRequest, WithdrawRequest, Payment,
    PrizeConfig, PrizeKey, TxType, WithdrawStatus, PrizeReqStatus
)
from app.schemas import SpinIn, WithdrawIn, InvoiceIn
from app.config import settings
from app.telegram_session import get_tg_user_id

from app.roulette import spin_once, ensure_case_configs, list_cases, save_cases  # spin_once(db, user, roulette_id) -> dict


app = FastAPI()

@app.on_event("startup")
def _startup():
    init_db()
    db = SessionLocal()
    try:
        ensure_case_configs(db)
    finally:
        db.close()


app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")
MEDIA_CONFIG_PATH = Path("app/static/prizes/roulettes.json")
UPLOADS_DIR = Path("app/static/uploads")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_user(db: Session, user_id: int) -> User:
    u = db.query(User).filter(User.user_id == user_id).first()
    if not u:
        u = User(
            user_id=user_id,
            balance=0,
            tickets_sneakers=0,
            tickets_bracelet=0,
            referrer_id=None,
        )
        db.add(u)
        db.commit()
        db.refresh(u)
    return u


def bind_referrer(db: Session, user: User, referrer_id: int | None) -> bool:
    """Bind referrer once (idempotent) if user has no referrer yet."""
    if not referrer_id:
        return False
    referrer_id = int(referrer_id)
    if referrer_id <= 0 or referrer_id == int(user.user_id):
        return False
    if user.referrer_id:
        return False
    user.referrer_id = referrer_id
    db.add(user)
    db.commit()
    db.refresh(user)
    return True


def is_admin(user_id: int | None) -> bool:
    if not user_id:
        return False
    return user_id in set(settings.admin_ids or [])


def require_admin(uid: int | None):
    if not is_admin(uid):
        raise HTTPException(status_code=403, detail="Forbidden")


def load_media_config() -> dict:
    if not MEDIA_CONFIG_PATH.exists():
        return {"event": {}, "roulettes": {}, "ticket_targets": {}, "economy": {}, "contact": {}}
    with MEDIA_CONFIG_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        return {"event": {}, "roulettes": {}, "ticket_targets": {}, "economy": {}, "contact": {}}
    data.setdefault("event", {})
    data.setdefault("roulettes", {})
    data.setdefault("ticket_targets", {})
    data.setdefault("economy", {})
    data.setdefault("contact", {})
    return data


def save_media_config(payload: dict) -> None:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="payload must be object")
    payload.setdefault("event", {})
    payload.setdefault("roulettes", {})
    payload.setdefault("ticket_targets", {})
    payload.setdefault("economy", {})
    payload.setdefault("contact", {})
    MEDIA_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with MEDIA_CONFIG_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def _human_code_title(code: str) -> str:
    mapping = {
        "shoes": "Обувь",
        "women_shoes": "Женская обувь",
        "limited_shoes": "Лимит обувь",
        "hoodie": "Толстовка",
        "women_hoodie": "Женская толстовка",
        "exclusive_hoodie": "Эксклюзив худи",
        "tshirt": "Футболка",
        "jeans": "Джинсы",
        "bracelet": "Браслет",
        "cert_3000": "Сертификат 3000₽",
        "full_look": "Полный образ",
        "vip_key": "VIP-ключ",
    }
    return mapping.get(code, code.replace("_", " ").strip() or "Приз")


def _rarity_title(v: str) -> str:
    return {
        "blue": "Синий",
        "purple": "Фиолетовый",
        "red": "Красный",
        "yellow": "Жёлтый",
    }.get(str(v or "").lower(), "Синий")


def _ticket_sell_percent(media: dict) -> int:
    economy = media.get("economy") if isinstance(media.get("economy"), dict) else {}
    return max(0, min(100, int((economy or {}).get("ticket_sell_percent") or 50)))


def _ticket_sell_lots(db: Session, user: User, media: dict) -> list[dict]:
    sell_percent = _ticket_sell_percent(media)
    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == int(user.user_id), Transaction.type == TxType.win)
        .order_by(Transaction.id.desc())
        .all()
    )
    lots: list[dict] = []
    for t in rows:
        meta = dict(t.meta or {})
        added = int(meta.get("hidden_tickets_added") or 0)
        sold = int(meta.get("hidden_tickets_sold") or 0)
        left = max(0, added - sold)
        if left <= 0:
            continue
        code = str(meta.get("prize_code") or "")
        if not code:
            continue
        case_cost = max(0, int(meta.get("case_cost") or 0))
        unit_price = (case_cost * sell_percent) // 100 if case_cost > 0 else 0
        lots.append(
            {
                "tx_id": int(t.id),
                "code": code,
                "title": _human_code_title(code),
                "ticket_kind": str(meta.get("hidden_ticket_kind") or ("bracelet" if code == "bracelet" else "sneakers")),
                "rarity": str(meta.get("rarity") or "blue"),
                "rarity_title": _rarity_title(str(meta.get("rarity") or "blue")),
                "left": left,
                "case_id": str(meta.get("roulette_id") or ""),
                "case_cost": case_cost,
                "sell_percent": sell_percent,
                "unit_sell_price": unit_price,
                "sell_price_total": unit_price * left,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
        )
    return lots


# ---------------- PUBLIC PAGES ----------------

@app.get("/", response_class=HTMLResponse)
def page_root(request: Request):
    return templates.TemplateResponse("index_mobile.html", {"request": request})


@app.get("/admin", response_class=HTMLResponse)
def admin_page(request: Request):
    return templates.TemplateResponse("admin.html", {"request": request})


# ---------------- PUBLIC API (MiniApp) ----------------

@app.get("/api/me")
def api_me(request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    u = ensure_user(db, uid)

    bot_username = getattr(settings, "bot_username", None) or "ruletkakawedka_bot"
    ref_link = f"https://t.me/{bot_username}?start=ref_{uid}"

    return {
        "user_id": uid,
        "balance": int(u.balance),
        "tickets_sneakers": int(u.tickets_sneakers),
        "tickets_bracelet": int(u.tickets_bracelet),
        "is_admin": is_admin(uid),
        "ref_link": ref_link,
    }


@app.get("/api/cases")
def api_cases(db: Session = Depends(get_db)):
    media = load_media_config()
    media_roulettes = media.get("roulettes") if isinstance(media.get("roulettes"), dict) else {}
    items: list[dict] = []
    for c in list_cases(db):
        if not int(c.get("is_enabled") or 0):
            continue
        rid = str(c.get("id") or "")
        media_case = media_roulettes.get(rid) if isinstance(media_roulettes, dict) else {}
        if not isinstance(media_case, dict):
            media_case = {}
        media_items = media_case.get("items") if isinstance(media_case.get("items"), dict) else {}
        prizes = []
        for p in (c.get("prizes") or []):
            if not int(p.get("is_enabled") or 0):
                continue
            code = str(p.get("code") or "")
            prizes.append(
                {
                    "code": code,
                    "title": str(p.get("title") or code or "Приз"),
                    "type": str(p.get("type") or "item"),
                    "amount": int(p.get("amount") or 0),
                    "weight": int(p.get("weight") or 0),
                    "rarity": str(p.get("rarity") or "blue"),
                    "images": list(media_items.get(code) or []),
                }
            )
        items.append(
            {
                "id": rid,
                "title": str(c.get("title") or rid),
                "spin_cost": int(c.get("spin_cost") or 0),
                "slots": int(c.get("slots") or 0),
                "desc": str(media_case.get("desc") or ""),
                "avatar": str(media_case.get("avatar") or ""),
                "prizes": prizes,
            }
        )

    event = media.get("event") if isinstance(media.get("event"), dict) else {}
    contact = media.get("contact") if isinstance(media.get("contact"), dict) else {}
    economy = media.get("economy") if isinstance(media.get("economy"), dict) else {}
    return {
        "items": items,
        "event": event,
        "contact": contact,
        "economy": {
            "ticket_sell_percent": _ticket_sell_percent(media),
            "near_target_ticket_boost_percent": max(0, min(100, int((economy or {}).get("near_target_ticket_boost_percent") or 0))),
        },
    }


@app.post("/api/spin")
def api_spin(payload: SpinIn, request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    u = ensure_user(db, uid)
    roulette_id = payload.roulette_id or "r1"

    result = spin_once(db, u, roulette_id)
    if not result.get("ok", False):
        raise HTTPException(status_code=400, detail=result.get("message", "Spin error"))

    return {
        "roulette_id": roulette_id,
        "prize_key": (result.get("prize") or {}).get("code"),
        "prize": (result.get("prize") or {}),
        "message": (result.get("ui") or {}).get("win_text") or "OK",
        "balance": int(u.balance),
        "tickets_sneakers": int(u.tickets_sneakers),
        "tickets_bracelet": int(u.tickets_bracelet),
    }


@app.post("/api/stars/invoice")
def api_invoice(payload: InvoiceIn, request: Request, db: Session = Depends(get_db)):
    """Create invoice_link (the actual credit happens in /api/internal/payment/confirm)."""
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    amount = int(payload.amount)
    if amount <= 0 or amount > 1_000_000:
        raise HTTPException(status_code=400, detail="Invalid amount")

    from app.telegram_stars import create_invoice_link

    invoice_link = create_invoice_link(
        bot_token=settings.bot_token,
        title=payload.title or "Пополнение",
        description=payload.description or f"Пополнение на {amount} Stars",
        amount=amount,
        payload=f"deposit:{uid}:{amount}",
    )
    return {"invoice_link": invoice_link}


@app.post("/api/withdraw")
def api_withdraw(payload: WithdrawIn, request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    u = ensure_user(db, uid)
    amount = int(payload.amount)

    if amount < 1000:
        raise HTTPException(status_code=400, detail="Minimum withdraw is 1000 Stars")
    if amount > u.balance:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    u.balance -= amount
    wr = WithdrawRequest(user_id=uid, amount=amount, status=WithdrawStatus.pending)
    db.add(wr)
    db.add(Transaction(
        user_id=uid,
        type=TxType.withdraw,
        amount=-amount,
        description="Вывод Stars (заявка)",
        meta={"withdraw_id": None},
    ))
    db.add(u)
    db.commit()
    return {"ok": True, "balance": int(u.balance)}


@app.get("/api/history")
def api_history(request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == uid)
        .order_by(Transaction.id.desc())
        .limit(50)
        .all()
    )
    return {
        "items": [
            {
                "id": int(t.id),
                "type": (t.type.value if hasattr(t.type, "value") else str(t.type)),
                "amount": int(t.amount),
                "description": t.description,
                "date": t.created_at.isoformat() if t.created_at else None,
            }
            for t in rows
        ]
    }


@app.get("/api/inventory")
def api_inventory(request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")
    u = ensure_user(db, uid)

    rows = (
        db.query(Transaction)
        .filter(Transaction.user_id == uid, Transaction.type == TxType.win)
        .order_by(Transaction.id.desc())
        .limit(5000)
        .all()
    )

    items: dict[str, int] = {}
    for t in rows:
        meta = t.meta or {}
        code = str(meta.get("prize_code") or "")
        added = int(meta.get("hidden_tickets_added") or 0)
        sold = int(meta.get("hidden_tickets_sold") or 0)
        left = max(0, added - sold)
        if code and left > 0:
            items[code] = int(items.get(code, 0)) + left

    media = load_media_config()
    raw_targets = media.get("ticket_targets") or {}
    if not isinstance(raw_targets, dict):
        raw_targets = {}

    item_codes: set[str] = set()
    for c in list_cases(db):
        for p in (c.get("prizes") or []):
            if str(p.get("type") or "") == "item":
                item_codes.add(str(p.get("code") or ""))
    item_codes = {x for x in item_codes if x}
    item_codes.update(items.keys())
    item_codes.update(raw_targets.keys())

    image_map: dict[str, str] = {}
    for rid, r in (media.get("roulettes") or {}).items():
        if not isinstance(r, dict):
            continue
        items_map = r.get("items") or {}
        if not isinstance(items_map, dict):
            continue
        for code, arr in items_map.items():
            if isinstance(arr, list) and arr:
                image_map[str(code)] = str(arr[0])

    progress = []
    for code in sorted(item_codes):
        target_default = 10 if code in {"shoes"} else 5
        target = max(1, int(raw_targets.get(code) or target_default))
        now = int(items.get(code, 0))
        progress.append(
            {
                "code": code,
                "title": _human_code_title(code),
                "current": now,
                "target": target,
                "left": max(0, target - now),
                "percent": min(100, int((now / target) * 100)),
                "image": image_map.get(code) or "",
            }
        )

    return {
        "items": [{"code": k, "count": int(v)} for k, v in sorted(items.items(), key=lambda kv: kv[0])],
        "total": int(sum(items.values())),
        "progress": progress,
        "lots": _ticket_sell_lots(db, u, media),
        "economy": {"ticket_sell_percent": _ticket_sell_percent(media)},
    }


@app.post("/api/tickets/sell")
def api_tickets_sell(payload: dict, request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    tx_id = int(payload.get("tx_id") or 0)
    if tx_id <= 0:
        raise HTTPException(status_code=400, detail="tx_id required")

    u = ensure_user(db, uid)
    row = (
        db.query(Transaction)
        .filter(Transaction.id == tx_id, Transaction.user_id == int(uid), Transaction.type == TxType.win)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Ticket lot not found")

    meta = dict(row.meta or {})
    added = int(meta.get("hidden_tickets_added") or 0)
    sold = int(meta.get("hidden_tickets_sold") or 0)
    left = max(0, added - sold)
    if left <= 0:
        raise HTTPException(status_code=400, detail="Лот уже продан")

    ticket_kind = str(meta.get("hidden_ticket_kind") or ("bracelet" if str(meta.get("prize_code") or "") == "bracelet" else "sneakers"))
    if ticket_kind == "bracelet":
        if int(u.tickets_bracelet or 0) < left:
            raise HTTPException(status_code=400, detail="Недостаточно тикетов браслета")
    else:
        if int(u.tickets_sneakers or 0) < left:
            raise HTTPException(status_code=400, detail="Недостаточно тикетов обуви")

    media = load_media_config()
    sell_percent = _ticket_sell_percent(media)
    case_cost = max(0, int(meta.get("case_cost") or 0))
    unit_price = (case_cost * sell_percent) // 100 if case_cost > 0 else 0
    total_credit = unit_price * left
    if total_credit <= 0:
        raise HTTPException(status_code=400, detail="Для этого лота нет цены выкупа")

    if ticket_kind == "bracelet":
        u.tickets_bracelet = max(0, int(u.tickets_bracelet or 0) - left)
    else:
        u.tickets_sneakers = max(0, int(u.tickets_sneakers or 0) - left)
    u.balance = int(u.balance or 0) + total_credit

    meta["hidden_tickets_sold"] = sold + left
    row.meta = meta
    db.add(row)
    db.add(u)
    db.add(Transaction(
        user_id=int(uid),
        type=TxType.win,
        amount=int(total_credit),
        description=f"Продажа тикетов: {_human_code_title(str(meta.get('prize_code') or 'ticket'))}",
        meta={"ticket_sell_tx_id": int(tx_id), "ticket_count": int(left), "unit_price": int(unit_price), "case_cost": int(case_cost)},
    ))
    db.commit()
    db.refresh(u)
    return {
        "ok": True,
        "credited": int(total_credit),
        "balance": int(u.balance),
        "tickets_sneakers": int(u.tickets_sneakers),
        "tickets_bracelet": int(u.tickets_bracelet),
    }


@app.get("/api/referrals/my")
def api_referrals_my(request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    invitees = (
        db.query(User)
        .filter(User.referrer_id == int(uid))
        .order_by(User.created_at.desc())
        .limit(300)
        .all()
    )
    if not invitees:
        return {"items": [], "count": 0}

    ids = [int(u.user_id) for u in invitees]
    dep_rows = (
        db.query(
            Transaction.user_id,
            func.coalesce(func.sum(Transaction.amount), 0).label("deposit_sum"),
        )
        .filter(Transaction.type == TxType.deposit, Transaction.user_id.in_(ids))
        .group_by(Transaction.user_id)
        .all()
    )
    dep_map = {int(r.user_id): int(r.deposit_sum) for r in dep_rows}

    return {
        "count": len(invitees),
        "items": [
            {
                "user_id": int(u.user_id),
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "deposit_sum": int(dep_map.get(int(u.user_id), 0)),
            }
            for u in invitees
        ],
    }


@app.post("/api/prize/request")
def api_prize_request(request: Request, payload: dict, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    u = ensure_user(db, uid)
    prize_type = payload.get("prize_type")
    if prize_type not in ("sneakers", "bracelet"):
        raise HTTPException(status_code=400, detail="Invalid prize_type")

    if prize_type == "sneakers":
        if u.tickets_sneakers < 10:
            raise HTTPException(status_code=400, detail="Not enough tickets")
        u.tickets_sneakers -= 10
    else:
        if u.tickets_bracelet < 5:
            raise HTTPException(status_code=400, detail="Not enough tickets")
        u.tickets_bracelet -= 5

    pr = PrizeRequest(user_id=uid, prize_type=prize_type, status=PrizeReqStatus.new)
    db.add(pr)
    db.add(Transaction(
        user_id=uid,
        type=TxType.win,
        amount=0,
        description=f"Запрос приза: {prize_type}",
        meta={"prize_request_id": None},
    ))
    db.add(u)
    db.commit()
    return {"ok": True}


# ---------------- INTERNAL API (Bot callback) ----------------

@app.post("/api/internal/payment/confirm")
def api_internal_payment_confirm(
    user_id: int = Query(...),
    telegram_payment_charge_id: str = Query(..., min_length=1, max_length=512),
    total_amount: int = Query(..., ge=1),
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    db: Session = Depends(get_db),
):
    """Idempotent credit after successful Telegram Stars payment.

    Bot sends: user_id, telegram_payment_charge_id, total_amount (Stars).
    """
    if settings.internal_api_token:
        if (x_internal_token or "") != settings.internal_api_token:
            raise HTTPException(status_code=403, detail="Forbidden")

    # already processed?
    exists = db.query(Payment).filter(Payment.telegram_payment_charge_id == telegram_payment_charge_id).first()
    if exists:
        return {"ok": True, "already": True}

    u = ensure_user(db, int(user_id))

    # record payment + deposit tx
    pay = Payment(
        user_id=int(user_id),
        telegram_payment_charge_id=telegram_payment_charge_id,
        total_amount=int(total_amount),
    )
    db.add(pay)

    u.balance += int(total_amount)
    db.add(Transaction(
        user_id=int(user_id),
        type=TxType.deposit,
        amount=int(total_amount),
        description="Пополнение Stars",
        meta={"telegram_payment_charge_id": telegram_payment_charge_id},
    ))

    # referral bonus (optional)
    bonus_percent = int(getattr(settings, "referral_bonus_percent", 0) or 0)
    if bonus_percent > 0 and u.referrer_id:
        bonus = (int(total_amount) * bonus_percent) // 100
        if bonus > 0:
            ref_u = ensure_user(db, int(u.referrer_id))
            ref_u.balance += bonus
            db.add(ref_u)
            db.add(Transaction(
                user_id=int(ref_u.user_id),
                type=TxType.referral,
                amount=bonus,
                description=f"Реферальный бонус {bonus_percent}% за депозит приглашённого {u.user_id}",
                meta={"invitee_id": int(u.user_id), "payment_charge_id": telegram_payment_charge_id},
            ))

    db.add(u)
    db.commit()
    return {"ok": True, "credited": int(total_amount)}


@app.post("/api/internal/referral/bind")
def api_internal_referral_bind(
    user_id: int = Query(..., ge=1),
    referrer_id: int = Query(..., ge=1),
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
    db: Session = Depends(get_db),
):
    """Bind referral relation from bot /start deep-link (`ref_<id>`)."""
    if settings.internal_api_token:
        if (x_internal_token or "") != settings.internal_api_token:
            raise HTTPException(status_code=403, detail="Forbidden")

    u = ensure_user(db, int(user_id))
    changed = bind_referrer(db, u, int(referrer_id))
    if changed:
        ref_u = ensure_user(db, int(referrer_id))
        bonus_ref = int(getattr(settings, "referral_signup_bonus_referrer", 0) or 0)
        bonus_inv = int(getattr(settings, "referral_signup_bonus_invitee", 0) or 0)

        if bonus_ref > 0:
            ref_u.balance += bonus_ref
            db.add(ref_u)
            db.add(Transaction(
                user_id=int(ref_u.user_id),
                type=TxType.referral,
                amount=int(bonus_ref),
                description=f"Бонус за приглашение пользователя {int(u.user_id)}",
                meta={"invitee_id": int(u.user_id)},
            ))

        if bonus_inv > 0:
            u.balance += bonus_inv
            db.add(u)
            db.add(Transaction(
                user_id=int(u.user_id),
                type=TxType.referral,
                amount=int(bonus_inv),
                description=f"Приветственный бонус по рефералке от {int(ref_u.user_id)}",
                meta={"referrer_id": int(ref_u.user_id)},
            ))

        db.commit()
        db.refresh(u)
    return {
        "ok": True,
        "bound": bool(changed),
        "user_id": int(u.user_id),
        "referrer_id": int(u.referrer_id) if u.referrer_id else None,
    }


# ---------------- ADMIN API ----------------

@app.get("/api/admin/cases")
def admin_cases(request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    require_admin(uid)
    return {"items": list_cases(db)}


@app.put("/api/admin/cases")
def admin_cases_put(payload: dict, request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    require_admin(uid)
    items = payload.get("items") or []
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items must be list")
    save_cases(db, items)
    return {"ok": True}


@app.get("/api/admin/media_config")
def admin_media_config(request: Request):
    uid = get_tg_user_id(request)
    require_admin(uid)
    return load_media_config()


@app.put("/api/admin/media_config")
def admin_media_config_put(payload: dict, request: Request):
    uid = get_tg_user_id(request)
    require_admin(uid)
    save_media_config(payload)
    return {"ok": True}


@app.post("/api/admin/upload_image")
async def admin_upload_image(request: Request, file: UploadFile = File(...)):
    uid = get_tg_user_id(request)
    require_admin(uid)

    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed")

    raw_name = file.filename or "image"
    ext = Path(raw_name).suffix.lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        ext = ".png"
    stem = re.sub(r"[^a-zA-Z0-9_-]+", "-", Path(raw_name).stem).strip("-") or "image"
    out_name = f"{stem}-{uuid4().hex[:10]}{ext}"

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = UPLOADS_DIR / out_name
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    out_path.write_bytes(data)
    return {"url": f"/static/uploads/{out_name}"}


@app.get("/api/admin/prizes")
def admin_prizes(request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    require_admin(uid)

    # ensure rows exist for all enum keys
    existing = {str(r.key.value if hasattr(r.key, "value") else r.key): r for r in db.query(PrizeConfig).all()}
    for k in PrizeKey:
        key = k.value
        if key not in existing:
            db.add(PrizeConfig(key=k, weight=1, is_enabled=1))
    db.commit()

    rows = db.query(PrizeConfig).all()
    return {"items": [
        {"key": (r.key.value if hasattr(r.key, "value") else str(r.key)), "weight": int(r.weight), "is_enabled": bool(int(r.is_enabled))}
        for r in sorted(rows, key=lambda x: (x.key.value if hasattr(x.key,"value") else str(x.key)))
    ]}


@app.put("/api/admin/prizes")
def admin_prizes_put(payload: dict, request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    require_admin(uid)

    items = payload.get("items") or []
    for it in items:
        key = str(it.get("key") or "")
        try:
            ek = PrizeKey(key)
        except Exception:
            continue
        row = db.query(PrizeConfig).filter(PrizeConfig.key == ek).first()
        if not row:
            row = PrizeConfig(key=ek)
            db.add(row)
        row.weight = max(0, int(it.get("weight") or 0))
        row.is_enabled = 1 if bool(it.get("is_enabled")) else 0

    db.commit()
    return {"ok": True}


@app.get("/api/admin/withdraws")
def admin_withdraws(request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    require_admin(uid)
    rows = db.query(WithdrawRequest).order_by(WithdrawRequest.id.desc()).limit(200).all()
    return {"items": [
        {"id": int(r.id), "user_id": int(r.user_id), "amount": int(r.amount), "status": (r.status.value if hasattr(r.status,"value") else str(r.status))}
        for r in rows
    ]}


@app.get("/api/admin/prize_requests")
def admin_prize_requests(request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    require_admin(uid)
    rows = db.query(PrizeRequest).order_by(PrizeRequest.id.desc()).limit(200).all()
    return {"items": [
        {"id": int(r.id), "user_id": int(r.user_id), "prize_type": r.prize_type, "status": (r.status.value if hasattr(r.status,"value") else str(r.status))}
        for r in rows
    ]}


@app.post("/api/admin/adjust")
def admin_adjust(payload: dict, request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    require_admin(uid)

    user_id = int(payload.get("user_id") or 0)
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    u = ensure_user(db, user_id)
    bal = int(payload.get("balance_delta") or 0)
    ts = int(payload.get("tickets_sneakers_delta") or 0)
    tb = int(payload.get("tickets_bracelet_delta") or 0)
    note = str(payload.get("note") or "admin adjust")[:200]

    u.balance += bal
    u.tickets_sneakers += ts
    u.tickets_bracelet += tb

    db.add(Transaction(
        user_id=user_id,
        type=TxType.admin_adjust,
        amount=bal,
        description=f"Admin adjust: {note}",
        meta={"by": int(uid), "balance_delta": bal, "tickets_sneakers_delta": ts, "tickets_bracelet_delta": tb},
    ))
    db.add(u)
    db.commit()
    return {"ok": True}


def _parse_date(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        # accept YYYY-MM-DD
        return datetime.fromisoformat(s)
    except Exception:
        try:
            return datetime.combine(date.fromisoformat(s), datetime.min.time())
        except Exception:
            return None


@app.get("/api/admin/referrals/summary")
def admin_referrals_summary(
    request: Request,
    q: str = Query(default=""),
    from_: str = Query(default="", alias="from"),
    to: str = Query(default=""),
    db: Session = Depends(get_db),
):
    uid = get_tg_user_id(request)
    require_admin(uid)

    dt_from = _parse_date(from_)
    dt_to = _parse_date(to)
    q = (q or "").strip()

    u_filter = [User.referrer_id.isnot(None)]
    if q.isdigit():
        # filter by referrer_id exact or invitee id exact
        qid = int(q)
        u_filter.append((User.referrer_id == qid) | (User.user_id == qid))

    if dt_from:
        u_filter.append(User.created_at >= dt_from)
    if dt_to:
        u_filter.append(User.created_at <= dt_to)

    sub_invited = db.query(
        User.referrer_id.label("referrer_id"),
        func.count(User.user_id).label("invited_count"),
    ).filter(and_(*u_filter)).group_by(User.referrer_id).subquery()

    # deposits of invitees
    dep = db.query(
        User.referrer_id.label("referrer_id"),
        func.coalesce(func.sum(Transaction.amount), 0).label("total_deposit"),
    ).join(Transaction, Transaction.user_id == User.user_id).filter(
        and_(
            User.referrer_id.isnot(None),
            Transaction.type == TxType.deposit,
            *( [User.created_at >= dt_from] if dt_from else [] ),
            *( [User.created_at <= dt_to] if dt_to else [] ),
            *( [(User.referrer_id == int(q)) | (User.user_id == int(q))] if q.isdigit() else [] ),
        )
    ).group_by(User.referrer_id).subquery()

    # referral bonuses earned by referrers
    bonus = db.query(
        Transaction.user_id.label("referrer_id"),
        func.coalesce(func.sum(Transaction.amount), 0).label("total_bonus"),
    ).filter(Transaction.type == TxType.referral).group_by(Transaction.user_id).subquery()

    rows = db.query(
        sub_invited.c.referrer_id,
        sub_invited.c.invited_count,
        func.coalesce(dep.c.total_deposit, 0),
        func.coalesce(bonus.c.total_bonus, 0),
    ).outerjoin(dep, dep.c.referrer_id == sub_invited.c.referrer_id
    ).outerjoin(bonus, bonus.c.referrer_id == sub_invited.c.referrer_id
    ).order_by(sub_invited.c.invited_count.desc()).limit(500).all()

    return {"items": [
        {"referrer_id": int(r[0]), "invited_count": int(r[1]), "total_deposit": int(r[2]), "total_bonus": int(r[3])}
        for r in rows
    ]}


@app.get("/api/admin/referrals/details")
def admin_referrals_details(
    request: Request,
    referrer_id: int = Query(...),
    q: str = Query(default=""),
    from_: str = Query(default="", alias="from"),
    to: str = Query(default=""),
    db: Session = Depends(get_db),
):
    uid = get_tg_user_id(request)
    require_admin(uid)

    dt_from = _parse_date(from_)
    dt_to = _parse_date(to)
    q = (q or "").strip()

    filters = [User.referrer_id == int(referrer_id)]
    if q.isdigit():
        filters.append(User.user_id == int(q))
    if dt_from:
        filters.append(User.created_at >= dt_from)
    if dt_to:
        filters.append(User.created_at <= dt_to)

    invitees = db.query(User).filter(and_(*filters)).order_by(User.created_at.desc()).limit(2000).all()
    if not invitees:
        return {"invitees": []}

    ids = [u.user_id for u in invitees]
    dep_rows = db.query(
        Transaction.user_id,
        func.coalesce(func.sum(Transaction.amount), 0).label("deposit_sum"),
    ).filter(
        Transaction.type == TxType.deposit,
        Transaction.user_id.in_(ids),
    ).group_by(Transaction.user_id).all()
    dep_map = {int(r.user_id): int(r.deposit_sum) for r in dep_rows}

    return {"invitees": [
        {"user_id": int(u.user_id), "created_at": u.created_at.isoformat() if u.created_at else None, "deposit_sum": dep_map.get(int(u.user_id), 0)}
        for u in invitees
    ]}


@app.get("/api/admin/stats")
def admin_stats(
    request: Request,
    from_: str = Query(default="", alias="from"),
    to: str = Query(default=""),
    db: Session = Depends(get_db),
):
    uid = get_tg_user_id(request)
    require_admin(uid)

    dt_from = _parse_date(from_)
    dt_to = _parse_date(to)

    tx_filters = []
    if dt_from:
        tx_filters.append(Transaction.created_at >= dt_from)
    if dt_to:
        tx_filters.append(Transaction.created_at <= dt_to)
    tx_rows = db.query(Transaction).filter(*tx_filters).order_by(Transaction.created_at.asc()).all()

    by_day: dict[str, dict] = {}
    by_case: dict[str, dict] = {}
    users_set: set[int] = set()
    totals = {
        "spins_count": 0,
        "spent_on_spins": 0,
        "deposits": 0,
        "wins_stars": 0,
        "ticket_sales": 0,
        "withdraws": 0,
        "unique_users": 0,
    }

    for t in tx_rows:
        day_key = t.created_at.date().isoformat() if t.created_at else "unknown"
        day = by_day.setdefault(day_key, {
            "date": day_key,
            "spins_count": 0,
            "spent_on_spins": 0,
            "deposits": 0,
            "wins_stars": 0,
            "ticket_sales": 0,
            "withdraws": 0,
            "unique_users_set": set(),
        })
        day["unique_users_set"].add(int(t.user_id))
        users_set.add(int(t.user_id))

        amt = int(t.amount or 0)
        meta = t.meta or {}
        if t.type == TxType.spin:
            spend = abs(amt)
            day["spins_count"] += 1
            day["spent_on_spins"] += spend
            totals["spins_count"] += 1
            totals["spent_on_spins"] += spend
            rid = str(meta.get("roulette_id") or "")
            if not rid:
                m = re.search(r"\((r\d+)\)$", str(t.description or ""))
                rid = m.group(1) if m else ""
            if rid:
                case_row = by_case.setdefault(rid, {"case_id": rid, "spins_count": 0, "spent_on_spins": 0})
                case_row["spins_count"] += 1
                case_row["spent_on_spins"] += spend
        elif t.type == TxType.deposit:
            val = max(0, amt)
            day["deposits"] += val
            totals["deposits"] += val
        elif t.type == TxType.withdraw:
            val = abs(amt)
            day["withdraws"] += val
            totals["withdraws"] += val
        elif t.type == TxType.win:
            val = max(0, amt)
            if meta.get("ticket_sell_tx_id"):
                day["ticket_sales"] += val
                totals["ticket_sales"] += val
            else:
                day["wins_stars"] += val
                totals["wins_stars"] += val

    by_day_out = []
    for k in sorted(by_day.keys()):
        row = by_day[k]
        by_day_out.append({
            "date": row["date"],
            "spins_count": int(row["spins_count"]),
            "spent_on_spins": int(row["spent_on_spins"]),
            "deposits": int(row["deposits"]),
            "wins_stars": int(row["wins_stars"]),
            "ticket_sales": int(row["ticket_sales"]),
            "withdraws": int(row["withdraws"]),
            "unique_users": len(row["unique_users_set"]),
        })

    totals["unique_users"] = len(users_set)
    return {
        "totals": totals,
        "by_day": by_day_out,
        "by_case": sorted(by_case.values(), key=lambda x: x["spins_count"], reverse=True),
    }
