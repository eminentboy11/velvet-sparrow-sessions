# velvet-sparrow-sessions

WhatsApp session server for the **June X** fleet — pairing-code + QR login, short session IDs only (`JUNE-X~` + 6 chars), MongoDB or PostgreSQL storage.

> Forked from [mrfr8nk/sessions-server](https://github.com/mrfr8nk/sessions-server) (MIT). Rebranded for June X — pairing logic unchanged, internals cleaned.

## Endpoints

| Route | What it does |
|---|---|
| `GET /` | Landing page |
| `GET /pair` | Pair-code login page |
| `GET /qr` | QR login page |
| `GET /code?number=2547xxxxxxx` | Request a pairing code → `{ code }` |
| `GET /qr/session` | Server-rendered QR page |
| `GET /session/:id` | Fetch the stored session blob for a short ID |
| `GET /health` | Health + active storage backend |

## Env vars

| Var | Default | Notes |
|---|---|---|
| `DATABASE_URL` | **required** | `postgresql://…` (Neon/Supabase/…) or `mongodb(srv)://…` (Atlas). Without it pairing is refused — there is no long-session fallback. |
| `SESSION_PREFIX` | `JUNE-X~` | Session ID prefix |
| `SESSION_ID_LENGTH` | `6` | Random part length of short IDs (4–20). Default gives 13-char handles (`JUNE-X~abcdef`) |
| `GC_JID` | `FiJ0HpoqKOS0llgeS1uydN` | WhatsApp group invite code auto-joined on pair. Empty = disabled. |
| `BOT_REPO` | this repo | Shown in the session-delivery buttons |
| `WA_CHANNEL` | June X channel | Shown in the session-delivery buttons |
| `MSG_FOOTER` | `> *JUNE X SESSIONS*` | Footer on delivered messages |
| `DEBUG` | `false` | `true` = full per-event pairing logs. Default logs ~4 lines per pairing (code issued, complete, sent, errors). |
| `INTAKE_URL` | *(empty)* | Optional: main June server intake endpoint (`https://…/v1/intake/session`). When set (with `INTAKE_KEY`), fresh sessions are pushed to the fleet vault and the returned handle works on **any** June X pairing site. |
| `INTAKE_KEY` | *(empty)* | The main server's `JUNE_INTAKE_KEY` (sent as Bearer). |
| `PORT` | `50900` | Listen port |

## Deploy

### Render
1. New → Web Service → connect this repo
2. Build `npm install` · Start `npm start` · Health check `/health`
3. Env vars: set `DATABASE_URL` (the rest have June X defaults)
4. Or import `render.yaml` (Blueprint) — everything pre-filled

### Koyeb
1. Create Service → GitHub → this repo
2. Builder: Buildpack · Run: `npm start` · Port: `50900` (or leave auto)
3. Env vars: same as above (`DATABASE_URL` is the only required one)

### Heroku
Deploy button in `app.json`, or:
```
heroku create
heroku config:set DATABASE_URL=postgres://… SESSION_PREFIX=JUNE-X~
git push heroku main
```

**Free-tier tip:** Render/Koyeb free instances sleep after ~15 min idle. Add an uptime monitor pinging `/health` every 10 minutes so pairing never hits a cold start.

## Multi-site intake (how the fleet stays connected)

When `INTAKE_URL` + `INTAKE_KEY` are configured, pairing on **this** site
registers the session in the **main** June session server's vault and delivers
the canonical `JUNE-X~xxxxxx` handle — the same handle a pairing done on the
main site would produce. Bots fetch it by handle exactly as usual, so it does
not matter which pairing site a user visited. If intake is unset or unreachable,
the site falls back to its own database IDs.

## Local run

```
cp .env.example .env   # add your DATABASE_URL
npm install
npm start              # or: node index.js
```

## License

MIT — see LICENSE (original copyright retained per MIT).
