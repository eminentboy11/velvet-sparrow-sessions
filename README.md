# velvet-sparrow-sessions

WhatsApp session server for the June X fleet — pairing-code + QR login, short session IDs, MongoDB or PostgreSQL storage.

> Forked from [mrfr8nk/sessions-server](https://github.com/mrfr8nk/sessions-server) (MIT). Rebranded for June X; logic unchanged.

## Endpoints

| Route | What it does |
|---|---|
| `GET /` | Landing page |
| `GET /pair` | Pair-code login page |
| `GET /qr` | QR login page |
| `GET /code?number=2547xxxxxxx` | Request a pairing code |
| `GET /qr?number=2547xxxxxxx` | Get a QR code (scan in WhatsApp → Linked Devices) |
| `GET /session/:id` | Fetch a stored session blob |
| `GET /health` | Health + storage backend |

## Env vars

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | *(empty)* | `mongodb://` / `mongodb+srv://` / `postgres://`. Empty = inline long session IDs (no DB). |
| `SESSION_PREFIX` | `JUNE-X~` | Session ID prefix |
| `GC_JID` | *(empty)* | Optional WhatsApp group invite JID to auto-join on pair |
| `BOT_REPO` | this repo | Shown in the session-delivery buttons |
| `WA_CHANNEL` | this repo | Shown in the session-delivery buttons |
| `MSG_FOOTER` | `> *JUNE X SESSIONS*` | Footer on delivered messages |
| `PORT` | `50900` | Listen port |

## Deploy

Works on Render / Railway / Koyeb / Heroku (see `app.json`) / cPanel (`deploy/cpanel.yml`) / VPS (`npm start`, pm2).

## License

MIT — see LICENSE (original copyright retained per MIT).
