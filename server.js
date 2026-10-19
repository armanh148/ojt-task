const express = require('express');
const cors = require('cors');
const path = require('node:path');
const { db } = require('./src/db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// Request performance logger for hardware scanner SLA monitoring (<150ms)
app.use((req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
        const duration = Math.round(performance.now() - start);
        if (req.path.startsWith('/api/')) {
            const statusColor = res.statusCode >= 400 ? '❌' : '⚡';
            // Only log if not health check
            if (req.path !== '/api/health') {
                console.log(`${statusColor} [${req.method}] ${req.path} -> ${res.statusCode} (${duration}ms)`);
            }
        }
    });
    next();
});

// Mount Routes
app.use('/api/products', require('./src/routes/products'));
app.use('/api/inventory', require('./src/routes/inventory'));
app.use('/api/inward', require('./src/routes/inward'));
app.use('/api/checkout', require('./src/routes/checkout'));
app.use('/api/reports', require('./src/routes/reports'));
app.use('/api/docs', require('./src/routes/docs'));

// Health & Metrics
app.get('/api/health', (req, res) => {
    try {
        const prodCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
        const batchCount = db.prepare('SELECT COUNT(*) AS count FROM batches').get().count;
        const invoiceCount = db.prepare('SELECT COUNT(*) AS count FROM invoices').get().count;
        res.json({
            status: 'HEALTHY',
            database: 'SQLite 3 (WAL mode, Foreign Keys Enabled, ACID Immediate Locking)',
            stats: {
                products_cataloged: prodCount,
                active_batches: batchCount,
                invoices_processed: invoiceCount
            },
            uptime_seconds: Math.round(process.uptime()),
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ status: 'UNHEALTHY', error: err.message });
    }
});

// Fallback to index.html for client-side navigation
app.use((req, res) => {
    if (!req.path.startsWith('/api/')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ error: 'Endpoint not found' });
    }
});

let server = null;
if (!process.env.VERCEL) {
    server = app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`🚀 ENTERPRISE POS & INVENTORY MANAGEMENT SAAS READY!`);
        console.log(`📍 URL: http://localhost:${PORT}`);
        console.log(`📋 API Docs: http://localhost:${PORT}/api/docs/spec`);
        console.log(`⚡ Hardware Scanner Listener: Active (<150ms SLA)`);
        console.log(`🏥 FEFO Batch Engine: Enabled (Earliest-Expiring First)`);
        console.log(`🔒 ACID Transaction Concurrency Guard: ACTIVE`);
        console.log(`=======================================================`);
    });
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
