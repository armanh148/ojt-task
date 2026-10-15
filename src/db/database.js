const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'pos_enterprise.db');

// Ensure directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize SQLite connection
const db = new DatabaseSync(DB_PATH);

// Optimize for high-speed POS checkout and concurrency safety:
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA busy_timeout = 5000;');

// Initialize schema
function initSchema() {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schemaSql);
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
