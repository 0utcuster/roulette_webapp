from __future__ import annotations

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,   # ВАЖНО: фикс Вашей ошибки extra_forbidden
        case_sensitive=False,
    )

    # --- Telegram ---
    bot_token: str = Field(default="", alias="BOT_TOKEN")
    bot_username: str = Field(default="ruletkakawedka_bot", alias="BOT_USERNAME")

    # --- DB ---
    database_url: str = Field(default="sqlite:///./data/app.db", alias="DATABASE_URL")

    # --- URLs ---
    public_base_url: str = Field(default="", alias="PUBLIC_BASE_URL")
    webapp_url: str = Field(default="", alias="WEBAPP_URL")

    # --- Roulette ---
    spin_cost: int = Field(default=150, alias="SPIN_COST")

    # --- Admin ---
    admin_telegram_ids: str = Field(default="", alias="ADMIN_TELEGRAM_IDS")

    # --- Internal API (bot -> backend) ---
    internal_api_token: str = Field(default="", alias="INTERNAL_API_TOKEN")

    # --- Referrals ---
    referral_bonus_percent: int = Field(default=0, alias="REFERRAL_BONUS_PERCENT")
    referral_signup_bonus_referrer: int = Field(default=0, alias="REFERRAL_SIGNUP_BONUS_REFERRER")
    referral_signup_bonus_invitee: int = Field(default=0, alias="REFERRAL_SIGNUP_BONUS_INVITEE")


    @property
    def admin_ids(self) -> List[int]:
        return [
            int(x.strip())
            for x in (self.admin_telegram_ids or "").split(",")
            if x.strip().isdigit()
        ]


print("### LOADED CONFIG:", __file__)
settings = Settings()
