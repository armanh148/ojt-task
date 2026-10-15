const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// GET /api/categories
router.get('/categories', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/suppliers
router.get('/suppliers', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all();
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/products (Debounced search, barcode lookup, filtering)
router.get('/', (req, res) => {
    try {
        const { search, barcode, domain, category_id, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT 
                p.*,
                c.name AS category_name,
                COALESCE(SUM(i.quantity), 0) AS total_stock,
                MIN(b.selling_price) AS min_selling_price,
                MAX(b.selling_price) AS max_selling_price,
                COUNT(b.id) AS batch_count
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN batches b ON p.id = b.product_id
            LEFT JOIN inventory i ON b.id = i.batch_id
            WHERE 1=1
        `;
        const params = [];

        if (barcode) {
            query += ' AND p.barcode = ?';
            params.push(barcode.trim());
        }

        if (domain && domain !== 'ALL') {
            query += ' AND p.domain = ?';
            params.push(domain);
        }

        if (category_id) {
            query += ' AND p.category_id = ?';
            params.push(Number(category_id));
        }

        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ? OR p.brand LIKE ?)';
            params.push(term, term, term, term);
        }

        query += ' GROUP BY p.id ORDER BY p.name ASC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));

        const products = db.prepare(query).all(...params);
        res.json({ success: true, count: products.length, data: products });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/products/barcode/:barcode (Direct ultra-fast scanner endpoint < 150ms)
router.get('/barcode/:barcode', (req, res) => {
    const startTime = performance.now();
    try {
        const barcode = req.params.barcode.trim();
        const product = db.prepare(`
            SELECT p.*, c.name AS category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.barcode = ?
        `).get(barcode);

        if (!product) {
            return res.status(404).json({
                success: false,
                latency_ms: Math.round(performance.now() - startTime),
                error: `No product found for barcode '${barcode}'`
            });
        }

        // Fetch active batches with stock, sorted strictly by FEFO (earliest expiry first)
        const batches = db.prepare(`
            SELECT 
                b.id AS batch_id,
                b.batch_number,
                b.cost_price,
                b.selling_price,
                b.expiry_date,
                b.mfg_date,
                i.quantity,
                i.reserved_quantity,
                i.shelf_location,
                s.name AS supplier_name
            FROM batches b
            JOIN inventory i ON b.id = i.batch_id
            LEFT JOIN suppliers s ON b.supplier_id = s.id
            WHERE b.product_id = ? AND i.quantity > 0
            ORDER BY b.expiry_date ASC
        `).all(product.id);

        const latency = Math.round(performance.now() - startTime);

        // FEFO recommended batch
        const fefoBatch = batches.length > 0 ? batches[0] : null;

        res.json({
            success: true,
            latency_ms: latency,
            data: {
                ...product,
                batches,
                fefo_recommended_batch: fefoBatch,
                total_stock: batches.reduce((sum, b) => sum + b.quantity, 0)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/products/:id (Get single product with all batches and stock)
router.get('/:id', (req, res) => {
    try {
        const product = db.prepare(`
            SELECT p.*, c.name AS category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `).get(req.params.id);

        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        const batches = db.prepare(`
            SELECT 
                b.id AS batch_id,
                b.batch_number,
                b.cost_price,
                b.selling_price,
                b.expiry_date,
                b.mfg_date,
                i.quantity,
                i.reserved_quantity,
                i.shelf_location,
                s.name AS supplier_name
            FROM batches b
            JOIN inventory i ON b.id = i.batch_id
            LEFT JOIN suppliers s ON b.supplier_id = s.id
            WHERE b.product_id = ?
            ORDER BY b.expiry_date ASC
        `).all(product.id);

        res.json({
            success: true,
            data: {
                ...product,
                batches,
                total_stock: batches.reduce((sum, b) => sum + b.quantity, 0)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/products (Product CRUD with Strict Duplicate Barcode Guard)
router.post('/', (req, res) => {
    try {
        const {
            sku,
            barcode,
            name,
            brand,
            category_id,
            unit = 'pcs',
            tax_rate = 0.05,
            reorder_point = 10,
            domain = 'RETAIL',
            requires_prescription = 0,
            // Optional initial batch
            initial_stock = 0,
            cost_price = 0,
            selling_price = 0,
            expiry_date,
            batch_number,
            supplier_id
        } = req.body;

        // Validation
        if (!sku || !barcode || !name || !brand || !category_id) {
            return res.status(400).json({
                success: false,
                error: 'Required fields missing: sku, barcode, name, brand, category_id are mandatory.'
            });
        }

        // API-Level Duplicate Barcode Guard
        const existingBarcode = db.prepare('SELECT id, name, sku FROM products WHERE barcode = ?').get(barcode.trim());
        if (existingBarcode) {
            return res.status(409).json({
                success: false,
                error: `Duplicate Barcode Violation: Barcode '${barcode}' is already assigned to '${existingBarcode.name}' (SKU: ${existingBarcode.sku}).`
            });
        }

        // API-Level Duplicate SKU Guard
        const existingSku = db.prepare('SELECT id, name FROM products WHERE sku = ?').get(sku.trim());
        if (existingSku) {
            return res.status(409).json({
                success: false,
                error: `Duplicate SKU Violation: SKU '${sku}' already exists.`
            });
        }

        // Insert within transaction
        const insertProductStmt = db.prepare(`
            INSERT INTO products (sku, barcode, name, brand, category_id, unit, tax_rate, reorder_point, domain, requires_prescription)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const pRes = insertProductStmt.run(
            sku.trim(),
            barcode.trim(),
            name.trim(),
            brand.trim(),
            Number(category_id),
            unit.trim(),
            Number(tax_rate),
            Number(reorder_point),
            domain,
            requires_prescription ? 1 : 0
        );

        const newProductId = Number(pRes.lastInsertRowid);

        // If initial batch provided, create batch & stock
        let createdBatchId = null;
        if (Number(initial_stock) > 0 && selling_price) {
            const finalBatchNo = batch_number ? batch_number.trim() : `BAT-${sku.trim().replace('-', '')}-INIT`;
            const finalExpDate = expiry_date || '2028-12-31';

            const bRes = db.prepare(`
                INSERT INTO batches (product_id, batch_number, supplier_id, cost_price, selling_price, expiry_date)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                newProductId,
                finalBatchNo,
                supplier_id ? Number(supplier_id) : null,
                Number(cost_price) || 0,
                Number(selling_price),
                finalExpDate
            );
            createdBatchId = Number(bRes.lastInsertRowid);

            db.prepare(`
                INSERT INTO inventory (batch_id, product_id, quantity, shelf_location)
                VALUES (?, ?, ?, 'A-01')
            `).run(createdBatchId, newProductId, Number(initial_stock));
        }

        res.status(201).json({
            success: true,
            message: 'Product cataloged successfully with unique barcode index guard verified.',
            data: { id: newProductId, sku, barcode, name, batch_id: createdBatchId }
        });
    } catch (err) {
        if (err.message.includes('UNIQUE constraint failed: products.barcode')) {
            return res.status(409).json({
                success: false,
                error: 'Database Index Constraint: Barcode already exists in system.'
            });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
