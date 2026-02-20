import json
from pathlib import Path

# Грузим список рулеток из JSON, без PrizeKey/Enum
DATA_FILE = Path(__file__).resolve().parent / "static" / "prizes" / "roulettes.json"

def load_roulettes():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

ROULETTES = load_roulettes()


DEFAULT_CASES = [
    {
        "id": "r1",
        "title": "Обувной",
        "spin_cost": 259,
        "slots": 20,
        "prizes": [
            {"code": "shoes", "title": "Обувь", "type": "item", "amount": 1, "weight": 10, "is_enabled": 1},
            {"code": "discount_20", "title": "Скидка 20%", "type": "discount", "amount": 20, "weight": 2, "is_enabled": 1},
            {"code": "discount_10", "title": "Скидка 10%", "type": "discount", "amount": 10, "weight": 3, "is_enabled": 1},
            {"code": "stars_200", "title": "200 ⭐", "type": "stars", "amount": 200, "weight": 3, "is_enabled": 1},
            {"code": "stars_100", "title": "100 ⭐", "type": "stars", "amount": 100, "weight": 2, "is_enabled": 1},
        ],
    },
    {
        "id": "r2",
        "title": "Стрит",
        "spin_cost": 229,
        "slots": 20,
        "prizes": [
            {"code": "hoodie", "title": "Толстовки", "type": "item", "amount": 1, "weight": 8, "is_enabled": 1},
            {"code": "tshirt", "title": "Футболки", "type": "item", "amount": 1, "weight": 4, "is_enabled": 1},
            {"code": "jeans", "title": "Джинсы", "type": "item", "amount": 1, "weight": 2, "is_enabled": 1},
            {"code": "discount_10", "title": "Скидка 10%", "type": "discount", "amount": 10, "weight": 3, "is_enabled": 1},
            {"code": "stars_100", "title": "100 ⭐", "type": "stars", "amount": 100, "weight": 3, "is_enabled": 1},
        ],
    },
    {
        "id": "r3",
        "title": "Вумен",
        "spin_cost": 239,
        "slots": 20,
        "prizes": [
            {"code": "women_shoes", "title": "Женская обувь", "type": "item", "amount": 1, "weight": 5, "is_enabled": 1},
            {"code": "women_hoodie", "title": "Женские толстовки", "type": "item", "amount": 1, "weight": 5, "is_enabled": 1},
            {"code": "discount_20", "title": "Скидка 20%", "type": "discount", "amount": 20, "weight": 3, "is_enabled": 1},
            {"code": "discount_10", "title": "Скидка 10%", "type": "discount", "amount": 10, "weight": 5, "is_enabled": 1},
            {"code": "stars_100", "title": "100 ⭐", "type": "stars", "amount": 100, "weight": 2, "is_enabled": 1},
        ],
    },
    {
        "id": "r4",
        "title": "LIMITED DROP 🔥",
        "spin_cost": 299,
        "slots": 20,
        "prizes": [
            {"code": "limited_shoes", "title": "Лимит обувь", "type": "item", "amount": 1, "weight": 3, "is_enabled": 1},
            {"code": "exclusive_hoodie", "title": "Эксклюзив худи", "type": "item", "amount": 1, "weight": 4, "is_enabled": 1},
            {"code": "tshirt", "title": "Футболка", "type": "item", "amount": 1, "weight": 5, "is_enabled": 1},
            {"code": "discount_30", "title": "Скидка 30%", "type": "discount", "amount": 30, "weight": 2, "is_enabled": 1},
            {"code": "stars_300", "title": "300 ⭐", "type": "stars", "amount": 300, "weight": 2, "is_enabled": 1},
            {"code": "stars_150", "title": "150 ⭐", "type": "stars", "amount": 150, "weight": 4, "is_enabled": 1},
        ],
    },
    {
        "id": "r5",
        "title": "GOLD VIBE ✨",
        "spin_cost": 279,
        "slots": 20,
        "prizes": [
            {"code": "bracelet", "title": "Браслет", "type": "item", "amount": 1, "weight": 5, "is_enabled": 1},
            {"code": "cert_3000", "title": "Сертификат 3000₽", "type": "item", "amount": 1, "weight": 3, "is_enabled": 1},
            {"code": "discount_25", "title": "Скидка 25%", "type": "discount", "amount": 25, "weight": 3, "is_enabled": 1},
            {"code": "discount_15", "title": "Скидка 15%", "type": "discount", "amount": 15, "weight": 6, "is_enabled": 1},
            {"code": "stars_200", "title": "200 ⭐", "type": "stars", "amount": 200, "weight": 3, "is_enabled": 1},
        ],
    },
    {
        "id": "r6",
        "title": "ULTIMATE STREET BOX 🚀",
        "spin_cost": 329,
        "slots": 20,
        "prizes": [
            {"code": "full_look", "title": "Полный образ", "type": "item", "amount": 1, "weight": 2, "is_enabled": 1},
            {"code": "shoes", "title": "Обувь", "type": "item", "amount": 1, "weight": 5, "is_enabled": 1},
            {"code": "hoodie", "title": "Толстовка", "type": "item", "amount": 1, "weight": 5, "is_enabled": 1},
            {"code": "discount_20", "title": "Скидка 20%", "type": "discount", "amount": 20, "weight": 4, "is_enabled": 1},
            {"code": "stars_150", "title": "150 ⭐", "type": "stars", "amount": 150, "weight": 4, "is_enabled": 1},
        ],
    },
    {
        "id": "r7",
        "title": "STAR JACKPOT 🎰",
        "spin_cost": 199,
        "slots": 36,
        "prizes": [
            {"code": "stars_1000", "title": "1000 ⭐", "type": "stars", "amount": 1000, "weight": 1, "is_enabled": 1},
            {"code": "stars_500", "title": "500 ⭐", "type": "stars", "amount": 500, "weight": 2, "is_enabled": 1},
            {"code": "stars_300", "title": "300 ⭐", "type": "stars", "amount": 300, "weight": 3, "is_enabled": 1},
            {"code": "stars_150", "title": "150 ⭐", "type": "stars", "amount": 150, "weight": 5, "is_enabled": 1},
            {"code": "stars_50", "title": "50 ⭐", "type": "stars", "amount": 50, "weight": 10, "is_enabled": 1},
            {"code": "stars_0", "title": "0 ⭐", "type": "stars", "amount": 0, "weight": 15, "is_enabled": 1},
        ],
    },
    {
        "id": "r8",
        "title": "SECRET LEVEL 🔐",
        "spin_cost": 289,
        "slots": 20,
        "prizes": [
            {"code": "shoes", "title": "Обувь", "type": "item", "amount": 1, "weight": 5, "is_enabled": 1},
            {"code": "hoodie", "title": "Толстовка", "type": "item", "amount": 1, "weight": 5, "is_enabled": 1},
            {"code": "discount_30", "title": "Скидка 30%", "type": "discount", "amount": 30, "weight": 2, "is_enabled": 1},
            {"code": "stars_200", "title": "200 ⭐", "type": "stars", "amount": 200, "weight": 3, "is_enabled": 1},
            {"code": "stars_100", "title": "100 ⭐", "type": "stars", "amount": 100, "weight": 5, "is_enabled": 1},
            {"code": "vip_key", "title": "VIP-ключ", "type": "item", "amount": 1, "weight": 0, "is_enabled": 0},
        ],
    },
]
