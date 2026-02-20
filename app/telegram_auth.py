import hashlib
import hmac
import json
from typing import Dict
from urllib.parse import parse_qsl


def _secret_key(bot_token: str) -> bytes:
    # Telegram WebApp initData validation key:
    # secret_key = HMAC_SHA256("WebAppData", bot_token)
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def validate_init_data(init_data: str, bot_token: str) -> bool:
    """Return True if init_data hash is valid for this bot_token."""
    if not init_data or not bot_token:
        return False

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        return False

    data_check_string = "\n".join(f"{k}={pairs[k]}" for k in sorted(pairs.keys()))
    computed_hash = hmac.new(
        _secret_key(bot_token), data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(computed_hash, received_hash)


def verify_init_data(init_data: str, bot_token: str) -> Dict:
    """Validate init_data and return parsed dict with decoded JSON fields."""
    if not validate_init_data(init_data, bot_token):
        raise ValueError("invalid initData hash")

    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    pairs.pop("hash", None)

    for key in ("user", "chat", "receiver"):
        if key in pairs and isinstance(pairs[key], str):
            try:
                pairs[key] = json.loads(pairs[key])
            except Exception:
                pass

    return pairs
