const express = require("express");
const path = require("path");
const zlib = require("zlib");
const bodyParser = require("body-parser");
const config = require("./config");
const { PORT } = config;
const { qrRoute, pairRoute } = require("./routes");
const { init, isConfigured, getSession, updateSessionData } = require("./store/sessionStore");
const app = express();
app.set("json spaces", 2);

require("events").EventEmitter.defaultMaxListeners = 2000;

app.use(bodyParser.json({ limit: '30mb' })); // auth-state pushes from bots can carry MBs of key rows
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Pages are static files with __BOT_REPO__ placeholders, injected at request
// time so the "Source" link always follows the BOT_REPO env var (cached per value).
const pageCache = new Map();
function sendPage(name) {
    return (req, res) => {
        try {
            const repo = config.BOT_REPO;
            const key = name + "|" + repo;
            if (!pageCache.has(key)) {
                pageCache.set(key, require("fs")
                    .readFileSync(path.join(__dirname, "public", name), "utf8")
                    .split("__BOT_REPO__").join(repo));
            }
            res.type("html").send(pageCache.get(key));
        } catch (err) {
            res.status(500).send("Error serving page: " + err.message);
        }
    };
}

app.get("/pair", sendPage("pair.html"));
app.get("/", sendPage("index.html"));
app.get("/qr", sendPage("qr.html"));
app.use("/qr", qrRoute);
app.use("/code", pairRoute);

// ── dbapi-compatible JSON lane ─────────────────────────────────────────────
// June X bots speak the main June server's dialect: GET /v1/session/:handle
// returns { success, files }, auth-state GET/PUT + heartbeat keep the live
// lane quiet. Everything answers JSON — a bot must never receive HTML here.
const handleVersions = new Map(); // handle body -> auth-state version (memory)
const FAR_LEASE = 24 * 60 * 60 * 1000;

function handleFromValue(value) {
    let raw = String(value || '').trim();
    const tilde = raw.indexOf('~');
    if (tilde >= 0) raw = raw.slice(tilde + 1);
    return raw.replace(/[^a-zA-Z0-9]/g, '');
}
function bearerHandle(req) {
    return handleFromValue(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
}
function credsObjectFromBlob(blob) {
    let raw = String(blob);
    const tilde = raw.indexOf('~');
    if (tilde >= 0) raw = raw.slice(tilde + 1);
    return JSON.parse(zlib.gunzipSync(Buffer.from(raw, 'base64')).toString('utf8'));
}

// live-lane: version probe (bot adopts this before its first push)
app.get("/v1/session/auth-state", (req, res) => {
    const key = bearerHandle(req);
    if (!key) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'A valid session handle is required.' });
    res.json({ ok: true, version: handleVersions.get(key) || 0, leaseExpiresAt: Date.now() + FAR_LEASE });
});

// live-lane: auth-state push — keep the stored blob fresh as keys rotate
app.put("/v1/session/auth-state", async (req, res) => {
    try {
        const key = bearerHandle(req);
        if (!key) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'A valid session handle is required.' });
        const current = await getSession(key);
        if (!current) return res.status(404).json({ ok: false, error: 'session_unknown', message: 'Unknown or revoked session handle.' });
        const credsRow = Array.isArray(req.body?.state?.sessionCreds)
            && req.body.state.sessionCreds.find((r) => r && r.key === 'creds' && typeof r.value === 'string' && r.value.length > 2);
        if (!credsRow) return res.status(400).json({ ok: false, error: 'invalid_request', message: 'state.sessionCreds must carry the creds row.' });
        const version = handleVersions.get(key) || 0;
        const expected = req.body?.expectedVersion;
        if (expected !== undefined && Number(expected) !== version) {
            return res.status(409).json({ ok: false, error: 'version_conflict', message: 'Version conflict — re-fetch and retry.', version });
        }
        JSON.parse(credsRow.value); // refuse to store garbage over a good session
        let prefix = 'JUNE-X~';
        const t = current.indexOf('~');
        if (t > 0) prefix = current.slice(0, t + 1);
        const blob = prefix + zlib.gzipSync(Buffer.from(credsRow.value, 'utf8')).toString('base64');
        await updateSessionData(key, blob);
        handleVersions.set(key, version + 1);
        res.json({ ok: true, version: version + 1 });
    } catch (e) {
        res.status(500).json({ ok: false, error: 'internal', message: 'Failed to store auth-state: ' + e.message });
    }
});

// live-lane: heartbeat — keep the bot's local lease window happy
app.post("/v1/session/heartbeat", (req, res) => {
    const key = bearerHandle(req);
    if (!key) return res.status(401).json({ ok: false, error: 'unauthorized', message: 'A valid session handle is required.' });
    res.json({ ok: true, leaseExpiresAt: Date.now() + FAR_LEASE });
});

// restore: the boot fetch — full handle or bare id
app.get("/v1/session/:handle", async (req, res) => {
    try {
        const key = handleFromValue(req.params.handle);
        const session = key ? await getSession(key) : null;
        if (!session) return res.status(404).json({ success: false, message: 'This Session ID is unknown or was revoked' });
        let creds;
        try { creds = credsObjectFromBlob(session); } catch (_) {
            return res.status(500).json({ success: false, message: 'Stored session blob is corrupt' });
        }
        res.json({ success: true, files: { 'creds.json': creds } });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Internal error' });
    }
});

// JSON 404 for any other /v1 call — never let a bot see HTML
app.use("/v1", (req, res) => {
    res.status(404).json({ ok: false, error: 'not_available', message: 'This endpoint is not available on this session server.' });
});

app.get("/session/:id", async (req, res) => {
    if (!isConfigured()) {
        return res.status(503).send("No database configured on this server.");
    }
    try {
        const session = await getSession(req.params.id);
        if (!session) {
            return res.status(404).send("Session not found.");
        }
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.send(session);
    } catch (e) {
        res.status(500).send("Error retrieving session.");
    }
});

app.get("/health", (req, res) => {
    res.json({
        status: 200,
        success: true,
        service: "June X Sessions",
        storage: isConfigured() ? "database" : "inline-zlib",
        timestamp: new Date().toISOString(),
    });
});

app.listen(PORT, () => {
    console.log(
        `\nDeployment Successful!\n\n June X Session Server running on http://localhost:${PORT}`,
    );
    init(config);
});

module.exports = app;
