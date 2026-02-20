from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from fastapi import FastAPI, Request, Depends, HTTPException, Query, Header
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

from app.roulette_sets import ROULETTES
from app.roulette import spin_once  # spin_once(db, user, roulette_id) -> dict


app = FastAPI()

@app.on_event("startup")
def _startup():
    init_db()


app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")


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


@app.post("/api/spin")
def api_spin(payload: SpinIn, request: Request, db: Session = Depends(get_db)):
    uid = get_tg_user_id(request)
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthorized")

    u = ensure_user(db, uid)
    roulette_id = payload.roulette_id or "r1"

    if roulette_id not in ROULETTES:
        raise HTTPException(status_code=400, detail="Unknown roulette")

    result = spin_once(db, u, roulette_id)
    if not result.get("ok", False):
        raise HTTPException(status_code=400, detail=result.get("message", "Spin error"))

    return {
        "roulette_id": roulette_id,
        "prize_key": (result.get("prize") or {}).get("code"),
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
    telegram_payment_charge_id: str = Query(..., min_length=1, max_length=128),
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
