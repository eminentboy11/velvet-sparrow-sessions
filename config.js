require('dotenv').config();

module.exports = {
    PORT: process.env.PORT || 50900,
    SESSION_PREFIX: process.env.SESSION_PREFIX || "JUNE-X~",
    GC_JID: process.env.GC_JID || "",
    DATABASE_URL: process.env.DATABASE_URL || "",
    BOT_REPO: process.env.BOT_REPO || "https://github.com/eminentboy11/velvet-sparrow-sessions",
    WA_CHANNEL: process.env.WA_CHANNEL || "https://github.com/eminentboy11/velvet-sparrow-sessions",
    MSG_FOOTER: process.env.MSG_FOOTER || "> *JUNE X SESSIONS*",
};
