from typing import Optional

from fastapi import Request, HTTPException

from .config import settings
from .telegram_auth import verify_init_data


def get_tg_user_id(request: Request) -> Optional[int]:
    """Extract Telegram user id from WebApp initData (headers or query params)."""
    init_data = (
        request.headers.get("X-Tg-Init-Data")
        or request.headers.get("x-tg-init-data")
        or request.query_params.get("initData")
        or request.query_params.get("init_data")
    )
    if not init_data:
        return None

    if not settings.bot_token:
        raise HTTPException(status_code=500, detail="BOT_TOKEN not set")

    try:
        v = verify_init_data(init_data, settings.bot_token)
        u = v.get("user") or {}
        return int(u["id"]) if isinstance(u, dict) and "id" in u else None
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Telegram initData invalid: {e}")
