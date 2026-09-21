'use strict';

/**
 * Intake receiver — lets trusted external pairing sites (e.g. the Render
 * pair site) register freshly-linked sessions straight into this server's
 * vault, so every site in the fleet mints canonical JUNE-X~ handles from
 * the same database.
 *
 *   POST /intake/session
 *   Authorization: Bearer <INTAKE_KEY>   (env; receiver disabled if unset)
 *   { phone, label?, snapshot: { sessionCreds: [{ key: 'creds', value }], ... } }
 *   → { ok: true, handle: "JUNE-X~xxxxxx", token: "JUNE-X~xxxxxx" }
 *
 * One-shot vending: only the creds row is stored — gzip+b64 behind the
 * prefix, byte-identical to native pairing. Signal key rows sent by the
 * client are not persisted; bots rebuild keys from the creds seed after
 * restore (the static-blob contract).
 */

const express = require('express');
const zlib = require('zlib');
const { isConfigured, saveSession } = require('../store/sessionStore');
const { SESSION_PREFIX, INTAKE_KEY } = require('../config');

const router = express.Router();

// In-memory rate limiter: 20 requests / hour / IP (intake is site-to-site).
const hits = new Map();
function limited(ip) {
    const now = Date.now();
    const windowStart = now - 3600000;
    const arr = (hits.get(ip) || []).filter((t) => t > windowStart);
    arr.push(now);
    hits.set(ip, arr);
    if (hits.size > 5000) hits.clear(); // crude GC; limiter resets
    return arr.length > 20;
}

router.post('/session', async (req, res) => {
    if (!INTAKE_KEY) {
        return res.status(503).json({ ok: false, error: 'intake_disabled', message: 'Intake is not configured on this server.' });
    }
    const auth = String(req.headers.authorization || '');
    if (auth !== `Bearer ${INTAKE_KEY}`) {
        return res.status(401).json({ ok: false, error: 'unauthorized', message: 'Bad intake key.' });
    }
    if (limited(req.ip)) {
        return res.status(429).json({ ok: false, error: 'rate_limited', message: 'Too many intake requests from this IP.' });
    }
    if (!isConfigured()) {
        return res.status(503).json({ ok: false, error: 'no_storage', message: 'Server has no session database configured.' });
    }

    const snap = req.body && req.body.snapshot;
    const credsRow =
        snap &&
        Array.isArray(snap.sessionCreds) &&
        snap.sessionCreds.find((r) => r && r.key === 'creds' && typeof r.value === 'string');
    if (!credsRow) {
        return res.status(400).json({ ok: false, error: 'bad_snapshot', message: 'snapshot.sessionCreds must include a creds row.' });
    }
    try {
        const creds = JSON.parse(credsRow.value);
        if (!creds || typeof creds !== 'object' || !creds.noiseKey) throw new Error('not a Baileys creds object');
    } catch (_) {
        return res.status(400).json({ ok: false, error: 'bad_creds', message: 'creds value is not valid WhatsApp credentials.' });
    }

    try {
        const b64data = zlib.gzipSync(credsRow.value).toString('base64');
        const shortId = await saveSession(SESSION_PREFIX + b64data);
        const handle = `${SESSION_PREFIX}${shortId}`;
        console.log(`[intake] stored session → ${handle}`);
        return res.json({ ok: true, handle, token: handle });
    } catch (e) {
        console.error('[intake] store failed:', e.message);
        return res.status(500).json({ ok: false, error: 'store_failed', message: 'Could not store the session.' });
    }
});

module.exports = router;
