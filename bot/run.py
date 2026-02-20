import os
import sys
import re

# Ensure project root is on PYTHONPATH when running as a script (pm2, cron, etc.)
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import asyncio
from aiogram import Bot, Dispatcher, F
from aiogram.types import Message, PreCheckoutQuery
from aiogram.filters import CommandStart
from aiogram.utils.keyboard import InlineKeyboardBuilder
import httpx

from app.config import settings

dp = Dispatcher()

def webapp_kb():
    kb = InlineKeyboardBuilder()
    kb.button(text="⭐ Открыть Stars Roulette", web_app={"url": settings.webapp_url})
    return kb.as_markup()


def extract_referrer_id(start_payload: str | None) -> int | None:
    payload = (start_payload or "").strip()
    m = re.fullmatch(r"ref_(\d+)", payload)
    if not m:
        return None
    ref_id = int(m.group(1))
    return ref_id if ref_id > 0 else None


async def bind_referral(user_id: int, referrer_id: int) -> None:
    if not settings.public_base_url:
        return
    url = f"{settings.public_base_url.rstrip('/')}/api/internal/referral/bind"
    headers = {}
    if getattr(settings, "internal_api_token", ""):
        headers["X-Internal-Token"] = settings.internal_api_token
    async with httpx.AsyncClient(timeout=20) as client:
        await client.post(
            url,
            params={"user_id": int(user_id), "referrer_id": int(referrer_id)},
            headers=headers,
        )


@dp.message(CommandStart())
async def start(m: Message):
    payload = ""
    if m.text:
        parts = m.text.split(maxsplit=1)
        payload = parts[1].strip() if len(parts) > 1 else ""

    referrer_id = extract_referrer_id(payload)
    if referrer_id and m.from_user and int(m.from_user.id) != int(referrer_id):
        try:
            await bind_referral(user_id=int(m.from_user.id), referrer_id=int(referrer_id))
        except Exception:
            # Referral bind must not block /start UX
            pass

    await m.answer(
        "⭐ Stars Roulette\n\nОткройте мини-приложение и крутите рулетку за Stars.",
        reply_markup=webapp_kb(),
    )

@dp.pre_checkout_query()
async def on_pre_checkout(q: PreCheckoutQuery, bot: Bot):
    await bot.answer_pre_checkout_query(q.id, ok=True)

@dp.message(F.successful_payment)
async def on_success(m: Message):
    sp = m.successful_payment
    uid = m.from_user.id
    charge_id = sp.telegram_payment_charge_id
    total = sp.total_amount  # XTR units for Stars

    async with httpx.AsyncClient(timeout=20) as client:
        url = f"{settings.public_base_url.rstrip('/')}/api/internal/payment/confirm"
        headers = {}
        if getattr(settings, 'internal_api_token', ''):
            headers['X-Internal-Token'] = settings.internal_api_token
        await client.post(url, params={
            "user_id": uid,
            "telegram_payment_charge_id": charge_id,
            "total_amount": total,
        }, headers=headers)

    await m.answer(f"✅ Оплата прошла! Начислено: {total}⭐")

async def main():
    if not settings.bot_token:
        raise SystemExit("BOT_TOKEN not set in .env")
    bot = Bot(token=settings.bot_token)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
