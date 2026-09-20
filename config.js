require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 50900,
    // set DEBUG=true for full per-event pairing logs (default: quiet)
    DEBUG: /^(1|true|yes|on)$/i.test(String(process.env.DEBUG || '')),
    SESSION_PREFIX: process.env.SESSION_PREFIX || "JUNE-X~",
    GC_JID: process.env.GC_JID || "FiJ0HpoqKOS0llgeS1uydN",
    DATABASE_URL: process.env.DATABASE_URL || "",
    BOT_REPO: process.env.BOT_REPO || "https://github.com/eminentboy11/velvet-sparrow-sessions",
    WA_CHANNEL: process.env.WA_CHANNEL || "https://whatsapp.com/channel/0029VbBzXBN2kNFoxm7LiG3Q",
    MSG_FOOTER: process.env.MSG_FOOTER || "> *JUNE X SESSIONS*",
    // Main June session server (dbapi) intake — when set, fresh sessions are
    // pushed there and the returned fleet-wide JUNE-X~ handle is delivered
    // instead of a local one. Leave empty to use local database IDs only.
    INTAKE_URL: process.env.INTAKE_URL || "",
    INTAKE_KEY: process.env.INTAKE_KEY || "",
};
