const crypto = require('crypto');

let storageBackend = null;
let mongoModel = null;
let pgPool = null;

// Exact-length alphanumeric session ID (a-z A-Z 0-9).
// Length controlled via SESSION_ID_LENGTH (default 6 → "JUNE-X~" + 6 = 13 chars total).
const SESSION_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateShortId() {
    const length = parseInt(process.env.SESSION_ID_LENGTH, 10) || 6;
    if (length < 4 || length > 20) throw new Error('SESSION_ID_LENGTH must be 4–20');
    let out = '';
    while (out.length < length) {
        // rejection sampling keeps the alphabet uniform (no modulo bias)
        const bytes = crypto.randomBytes(length * 2);
        for (const b of bytes) {
            if (out.length >= length) break;
            if (b >= 248) continue; // 248 = 62 * 4; reject tail to avoid bias
            out += SESSION_ID_ALPHABET[b % 62];
        }
    }
    return out;
}

function detectDbType(url) {
    if (!url) return null;
    if (url.startsWith('mongodb://') || url.startsWith('mongodb+srv://')) return 'mongodb';
    if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql';
    return null;
}

async function init(config) {
    const dbType = detectDbType(config.DATABASE_URL);

    if (dbType === 'mongodb') {
        try {
            const mongoose = require('mongoose');
            await mongoose.connect(config.DATABASE_URL);
            const sessionSchema = new mongoose.Schema({
                shortId: { type: String, required: true, unique: true, index: true },
                data: { type: String, required: true },
                createdAt: { type: Date, default: Date.now }
            });
            mongoModel = mongoose.models.JuneSession || mongoose.model('JuneSession', sessionSchema);
            storageBackend = 'mongodb';
            console.log('Session storage: MongoDB connected');
        } catch (e) {
            console.error('MongoDB connection failed:', e.message);
        }
    } else if (dbType === 'postgresql') {
        try {
            const { Pool } = require('pg');
            pgPool = new Pool({ connectionString: config.DATABASE_URL, ssl: { rejectUnauthorized: false } });
            await pgPool.query(`
                CREATE TABLE IF NOT EXISTS june_sessions (
                    short_id VARCHAR(20) PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            `);
            storageBackend = 'postgresql';
            console.log('Session storage: PostgreSQL connected');
        } catch (e) {
            console.error('PostgreSQL connection failed:', e.message);
        }
    } else {
        console.log('Session storage: No DATABASE_URL set — pairing will be REFUSED (short IDs require a database)');
    }
}

function isConfigured() {
    return storageBackend !== null;
}

async function saveSession(fullSessionString) {
    const shortId = generateShortId();

    if (storageBackend === 'mongodb') {
        await mongoModel.create({ shortId, data: fullSessionString });
    } else if (storageBackend === 'postgresql') {
        await pgPool.query(
            'INSERT INTO june_sessions (short_id, data) VALUES ($1, $2)',
            [shortId, fullSessionString]
        );
    }

    return shortId;
}

async function getSession(id) {
    const safeId = id.replace(/[^a-zA-Z0-9]/g, '');

    if (storageBackend === 'mongodb') {
        const doc = await mongoModel.findOne({ shortId: safeId });
        return doc ? doc.data : null;
    } else if (storageBackend === 'postgresql') {
        const result = await pgPool.query(
            'SELECT data FROM june_sessions WHERE short_id = $1',
            [safeId]
        );
        return result.rows[0] ? result.rows[0].data : null;
    }

    return null;
}

module.exports = { init, isConfigured, saveSession, getSession, generateShortId };
