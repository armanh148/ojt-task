const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

let DB_PATH = process.env.DB_PATH;

if (!DB_PATH) {
    if (process.env.VERCEL) {
        // Vercel serverless functions run in a read-only environment except /tmp
        const tmpDbPath = path.join('/tmp', 'pos_enterprise.db');
        const sourceDbPath = path.join(__dirname, '..', '..', 'data', 'pos_enterprise.db');

        if (!fs.existsSync(tmpDbPath)) {
            if (fs.existsSync(sourceDbPath)) {
                try {
                    fs.copyFileSync(sourceDbPath, tmpDbPath);
                } catch (e) {
                    console.error('Error copying seed DB to /tmp:', e);
                }
            }
        }
        DB_PATH = tmpDbPath;
    } else {
        DB_PATH = path.join(__dirname, '..', '..', 'data', 'pos_enterprise.db');
    }
}

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    try {
        fs.mkdirSync(dbDir, { recursive: true });
    } catch (e) {
        // Ignore if directory already exists
    }
}

// Initialize SQLite connection
const db = new DatabaseSync(DB_PATH);

// Optimize for high-speed POS checkout and concurrency safety:
db.exec('PRAGMA foreign_keys = ON;');
if (!process.env.VERCEL) {
    db.exec('PRAGMA journal_mode = WAL;');
} else {
    db.exec('PRAGMA journal_mode = DELETE;');
}
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA busy_timeout = 5000;');

// Initialize schema
function initSchema() {
    try {
        const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
        db.exec(schemaSql);
    } catch (e) {
        console.error('Schema initialization error:', e);
    }
}

// Transaction wrapper with IMMEDIATE lock to prevent race conditions during checkout
function withImmediateTransaction(callback) {
    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
        const result = callback(db);
        db.exec('COMMIT;');
        return result;
    } catch (err) {
        try {
            db.exec('ROLLBACK;');
        } catch (rollbackErr) {
            console.error('Rollback error:', rollbackErr);
        }
        throw err;
    }
}

// Standard transaction wrapper
function withTransaction(callback) {
    db.exec('BEGIN TRANSACTION;');
    try {
        const result = callback(db);
        db.exec('COMMIT;');
        return result;
    } catch (err) {
        try {
            db.exec('ROLLBACK;');
        } catch (rollbackErr) {
            console.error('Rollback error:', rollbackErr);
        }
        throw err;
    }
}

// Initialize tables on startup
initSchema();

module.exports = {
    db,
    withTransaction,
    withImmediateTransaction,
    initSchema,
    DB_PATH
};
