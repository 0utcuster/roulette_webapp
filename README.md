# Telegram Stars Roulette — FastAPI + Telegram WebApp + Admin (v2)

Мобильная версия интерфейса (mobile-first) + интеграция Telegram:
- авторизация через **initData** (Telegram WebApp)
- пополнение через **Telegram Stars (XTR)**: WebApp -> invoice link -> openInvoice -> bot получает successful_payment -> начисляет баланс
- отдельная **админка**: `/admin` (доступ только Telegram-админам)
- правки по Вашей просьбе: **в ленте показываем “👟 Кроссовки / 📿 Браслет”**, а при выигрыше пишем **“тикет”**.

Документация Telegram:
- WebApps initData: https://core.telegram.org/bots/webapps
- Stars payments: https://core.telegram.org/bots/payments-stars

## Настройка .env
Скопируйте `.env.example` -> `.env`:
- `BOT_TOKEN`
- `PUBLIC_BASE_URL` (публичный URL сервера)
- `WEBAPP_URL` (URL webapp, обычно `PUBLIC_BASE_URL/`)
- `ADMIN_TELEGRAM_IDS` (через запятую)

## Запуск
```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Бот (DEV, long polling):
```bash
python -m bot.run
```


## Prize photos (premium reel)
Put your prize photos into:

- `app/static/prizes/`

Then edit:

- `app/static/prizes/prizes.json`

You can use JPG/PNG/WebP. Recommended:
- 900x1200 (or 3:4), high quality
- dark-friendly photos look best in the UI

The reel shows photos (e.g., sneakers), but the backend result message is **ticket** (as required).


## 6 roulette variants + photo reels
We now have **6 roulette variants**. Photos are loaded from:

- `app/static/prizes/roulettes.json`
- folders: `app/static/prizes/r1/ ... r6/`

### Replace placeholders with your photos
Put your images into the corresponding folder and keep filenames, e.g.:

- `app/static/prizes/r1/ticket_sneakers_1.webp`
- `app/static/prizes/r1/ticket_sneakers_2.webp`
- `app/static/prizes/r1/ticket_sneakers_3.webp`
- `app/static/prizes/r1/ticket_bracelet_1.webp`
- `app/static/prizes/r1/ticket_bracelet_2.webp`
- `app/static/prizes/r1/discount_10.webp`
- `app/static/prizes/r1/stars_150.webp`
... and so on for `r2`..`r6`.

Then update the paths in `app/static/prizes/roulettes.json` from `.svg` to your `.jpg/.png/.webp`.
Recommended size: **900x1200 (3:4)**.

Backend always awards **tickets** (not sneakers/bracelet directly), even though the reel shows the photos.
