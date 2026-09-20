'use strict';

/**
 * External intake client — pushes a freshly-linked WhatsApp auth snapshot to
 * the main June session server (dbapi) so the returned JUNE-X~ handle works
 * across the whole fleet (any bot, any lane), not just this site.
 *
 * Protocol (must match dbapi POST /v1/intake/session):
 *   POST <INTAKE_URL>
 *   Authorization: Bearer <INTAKE_KEY>
 *   { phone, snapshot: { sessionCreds[], sessionKeys[], sessionAuthMeta[] } }
 *   → { ok: true, handle: "JUNE-X~xxxxxx", token: same, fingerprint }
 */

const fs = require('fs');
const path = require('path');

// Same key-type taxonomy used by dbapi's pairing engine and the bot's
// auth-state restore path. The snapshot must round-trip through it.
const KEY_TYPES = [
    'app-state-sync-version',
    'app-state-sync-key',
    'sender-key-memory',
    'sender-key',
    'identity-key',
    'device-list',
    'lid-mapping',
    'pre-key',
    'session',
    'tctoken',
];

/** Ported from dbapi pairing: filename → {type, id}. */
function parseKeyFilename(filename) {
    if (!filename.endsWith('.json') || filename === 'creds.json') return null;
    const base = filename.slice(0, -'.json'.length);
    const type = KEY_TYPES.find((candidate) => base.startsWith(`${candidate}-`));
    if (!type) return null;
    const encodedId = base.slice(type.length + 1);
    if (!encodedId) return null;
    return { type, id: encodedId.replace(/__/g, '/').replace(/-/g, ':') };
}

/**
 * Build the snapshot in the exact shape dbapi's intake validator expects:
 * creds row + every parseable Signal key file + verified meta.
 * A single unparseable key file (Baileys mid-write) is skipped, not fatal.
 */
function harvestSnapshot(sessionDir) {
    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) throw new Error('creds.json missing after pairing');
    const credsValue = fs.readFileSync(credsPath, 'utf8');
    JSON.parse(credsValue); // validate (fatal if bad — creds are the session)

    const now = Date.now();
    const sessionKeys = [];
    for (const name of fs.readdirSync(sessionDir)) {
        const parsed = parseKeyFilename(name);
        if (!parsed) continue;
        let value;
        try {
            value = fs.readFileSync(path.join(sessionDir, name), 'utf8');
            JSON.parse(value); // may fail while Baileys is mid-write
        } catch (_) {
            continue; // that one key re-negotiates on demand at the bot
        }
        sessionKeys.push({ type: parsed.type, id: parsed.id, value, updated_at: now });
    }
    if (sessionKeys.length === 0) throw new Error('no signal key files were generated');

    return {
        version: 1,
        createdAt: now,
        sessionCreds: [{ key: 'creds', value: credsValue, updated_at: now }],
        sessionKeys,
        sessionAuthMeta: [
            { key: 'status', value: 'verified' },
            { key: 'source', value: 'june-session-server' },
        ],
    };
}

/** Push the snapshot to the main server; resolves with the canonical handle. */
async function intakeSession({ phone, snapshot, intakeUrl, intakeKey }) {
    if (typeof fetch !== 'function') throw new Error('fetch unavailable (Node >= 18 required)');
    const res = await fetch(intakeUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            authorization: 'Bearer ' + intakeKey,
        },
        body: JSON.stringify({ phone, snapshot }),
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data || !data.ok || !data.handle) {
        const msg = data && data.message ? data.message : `HTTP ${res.status}`;
        throw new Error(`intake rejected: ${msg}`);
    }
    return data.handle;
}

module.exports = { harvestSnapshot, intakeSession, parseKeyFilename };
