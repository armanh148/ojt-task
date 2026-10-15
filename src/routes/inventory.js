const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// GET /api/inventory (Inventory overview across all products)
router.get('/', (req, res) => {
    try {
        const { domain, low_stock, search, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT 
                p.id AS product_id,
                p.sku,
                p.barcode,
                p.name,
                p.brand,
                p.unit,
                p.reorder_point,
                p.domain,
                c.name AS category_name,
                COALESCE(SUM(i.quantity), 0) AS total_quantity,
                COALESCE(SUM(i.reserved_quantity), 0) AS total_reserved,
                COUNT(DISTINCT b.id) AS active_batches,
                MIN(b.expiry_date) AS nearest_expiry,
                CASE 
                    WHEN COALESCE(SUM(i.quantity), 0) = 0 THEN 'OUT_OF_STOCK'
                    WHEN COALESCE(SUM(i.quantity), 0) <= p.reorder_point THEN 'LOW_STOCK'
                    ELSE 'IN_STOCK'
                END AS stock_status
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN batches b ON p.id = b.product_id
            LEFT JOIN inventory i ON b.id = i.batch_id
            WHERE 1=1
        `;
        const params = [];

        if (domain && domain !== 'ALL') {
            query += ' AND p.domain = ?';
            params.push(domain);
        }

        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            query += ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)';
            params.push(term, term, term);
        }

        query += ' GROUP BY p.id';

        if (low_stock === 'true') {
            query += ' HAVING total_quantity <= p.reorder_point';
        }

        query += ' ORDER BY total_quantity ASC, p.name ASC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));

        const rows = db.prepare(query).all(...params);
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/inventory/low-stock (Dashboard Low Stock Alerts / Reorder Point ROP trigger)
router.get('/low-stock', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT 
                p.id AS product_id,
                p.sku,
                p.barcode,
                p.name,
                p.brand,
                p.unit,
                p.reorder_point,
                p.domain,
                c.name AS category_name,
                COALESCE(SUM(i.quantity), 0) AS current_stock,
                (p.reorder_point - COALESCE(SUM(i.quantity), 0)) AS shortfall,
                MIN(b.expiry_date) AS earliest_expiry
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN batches b ON p.id = b.product_id
            LEFT JOIN inventory i ON b.id = i.batch_id
            GROUP BY p.id
            HAVING current_stock <= p.reorder_point
            ORDER BY current_stock ASC, shortfall DESC
        `).all();

        res.json({
            success: true,
            alert_count: rows.length,
            message: rows.length > 0 ? `${rows.length} items require immediate restocking!` : 'Stock levels optimal.',
            data: rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/inventory/batches/:productId (FEFO sorted batches with live stock)
router.get('/batches/:productId', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT 
                b.id AS batch_id,
                b.product_id,
                b.batch_number,
                b.cost_price,
                b.selling_price,
                b.mfg_date,
                b.expiry_date,
                i.quantity,
                i.reserved_quantity,
                i.shelf_location,
                s.name AS supplier_name,
                ROUND((JULIANDAY(b.expiry_date) - JULIANDAY('now'))) AS days_to_expiry
            FROM batches b
            JOIN inventory i ON b.id = i.batch_id
            LEFT JOIN suppliers s ON b.supplier_id = s.id
            WHERE b.product_id = ?
            ORDER BY b.expiry_date ASC
        `).all(req.params.productId);

        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/inventory/fefo-preview (Domain FEFO Simulator & Verification Tool)
router.get('/fefo-preview/:productId', (req, res) => {
    try {
        const productId = req.params.productId;
        const requestedQty = Number(req.query.qty) || 1;

        const batches = db.prepare(`
            SELECT 
                b.id AS batch_id,
                b.batch_number,
                b.expiry_date,
                b.selling_price,
                b.cost_price,
                i.quantity AS available_quantity
            FROM batches b
            JOIN inventory i ON b.id = i.batch_id
            WHERE b.product_id = ? AND i.quantity > 0
            ORDER BY b.expiry_date ASC
        `).all(productId);

        let remainingQty = requestedQty;
        const allocationPlan = [];

        for (const batch of batches) {
            if (remainingQty <= 0) break;
            const takeQty = Math.min(batch.available_quantity, remainingQty);
            allocationPlan.push({
                batch_id: batch.batch_id,
                batch_number: batch.batch_number,
                expiry_date: batch.expiry_date,
                unit_price: batch.selling_price,
                allocated_quantity: takeQty,
                remaining_in_batch_after: batch.available_quantity - takeQty
            });
            remainingQty -= takeQty;
        }

        const canFulfill = remainingQty === 0;

        res.json({
            success: true,
            requested_quantity: requestedQty,
            can_fulfill: canFulfill,
            unfulfilled_quantity: remainingQty,
            fe_fo_order: allocationPlan
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
