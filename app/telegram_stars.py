from __future__ import annotations

import httpx

TG_API = "https://api.telegram.org/bot{token}/{method}"


def create_invoice_link(*, bot_token: str, title: str, description: str, amount: int, payload: str) -> str:
    """Create Telegram Stars invoice link (currency XTR).

    amount: integer Stars amount (Telegram expects integer in XTR).
    """
    if not bot_token:
        raise RuntimeError("BOT_TOKEN is empty")

    from app.config import settings

    url = TG_API.format(token=bot_token, method="createInvoiceLink")
    data = {
        "title": title,
        "description": description,
        "payload": payload,
        "provider_token": "",
        "currency": "XTR",
        "prices": [{"label": title, "amount": int(amount)}],
        "start_parameter": "stars_deposit",
    }

    proxy = (settings.telegram_proxy or "").strip() or None
    with httpx.Client(timeout=20, proxy=proxy) as client:
        r = client.post(url, json=data)
        r.raise_for_status()
        j = r.json()
        if not j.get("ok"):
            raise RuntimeError(str(j))
        return j["result"]
