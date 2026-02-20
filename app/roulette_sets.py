import json
from pathlib import Path

# Грузим список рулеток из JSON, без PrizeKey/Enum
DATA_FILE = Path(__file__).resolve().parent / "static" / "prizes" / "roulettes.json"

def load_roulettes():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

ROULETTES = load_roulettes()
