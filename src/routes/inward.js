const express = require('express');
const router = express.Router();
const { db, withTransaction } = require('../db/database');

// GET /api/inward (List inward receipts)
router.get('/', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT 
                r.*,
                s.name AS supplier_name,
                COUNT(i.id) AS item_count,
                SUM(i.quantity) AS total_units_received
            FROM inward_receipts r
            JOIN suppliers s ON r.supplier_id = s.id
            LEFT JOIN inward_items i ON r.id = i.receipt_id
            GROUP BY r.id
            ORDER BY r.received_at DESC
            LIMIT 50
        `).all();
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/inward/:id (Get single receipt with items)
router.get('/:id', (req, res) => {
    try {
        const receipt = db.prepare(`
            SELECT r.*, s.name AS supplier_name, s.contact_person, s.phone, s.email
            FROM inward_receipts r
            JOIN suppliers s ON r.supplier_id = s.id
            WHERE r.id = ?
        `).get(req.params.id);

        if (!receipt) {
            return res.status(404).json({ success: false, error: 'Inward receipt not found.' });
        }

        const items = db.prepare(`
            SELECT 
                ii.*,
                p.id AS product_id,
                p.name AS product_name,
                p.sku,
                p.barcode,
                b.batch_number,
                b.expiry_date,
                inv.quantity AS current_stock_in_batch
            FROM inward_items ii
            JOIN batches b ON ii.batch_id = b.id
            JOIN products p ON b.product_id = p.id
            LEFT JOIN inventory inv ON b.id = inv.batch_id
            WHERE ii.receipt_id = ?
        `).all(receipt.id);

        res.json({ success: true, data: { ...receipt, items } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/inward (Execute atomic inbound stock intake / Purchase Inward)
router.post('/', (req, res) => {
    try {
        const { supplier_id, notes, items } = req.body;

        if (!supplier_id || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Supplier and at least one inward item are required.'
            });
        }

        // Execute in atomic transaction
        const result = withTransaction(() => {
            // Generate receipt number
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const randomCode = Math.floor(1000 + Math.random() * 9000);
            const receiptNumber = `PO-${dateStr}-${randomCode}`;

            let totalCost = 0;

            // Prepared statements
            const insertReceiptStmt = db.prepare(`
                INSERT INTO inward_receipts (receipt_number, supplier_id, total_cost, status, notes)
                VALUES (?, ?, ?, 'COMPLETED', ?)
            `);

            const findBatchStmt = db.prepare(`
                SELECT id, cost_price, selling_price FROM batches 
                WHERE product_id = ? AND batch_number = ?
            `);

            const insertBatchStmt = db.prepare(`
                INSERT INTO batches (product_id, batch_number, supplier_id, cost_price, selling_price, mfg_date, expiry_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            const updateBatchPriceStmt = db.prepare(`
                UPDATE batches SET cost_price = ?, selling_price = ? WHERE id = ?
            `);

            const upsertInventoryStmt = db.prepare(`
                INSERT INTO inventory (batch_id, product_id, quantity, shelf_location)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(batch_id) DO UPDATE SET
                    quantity = inventory.quantity + excluded.quantity,
                    updated_at = CURRENT_TIMESTAMP
            `);

            const insertInwardItemStmt = db.prepare(`
                INSERT INTO inward_items (receipt_id, batch_id, quantity, cost_price, selling_price)
                VALUES (?, ?, ?, ?, ?)
            `);

            // Initial insert with 0, updated later
            const receiptRes = insertReceiptStmt.run(receiptNumber, Number(supplier_id), 0, notes || 'Purchase Inward Stock Intake');
            const receiptId = Number(receiptRes.lastInsertRowid);

            const processedItems = [];

            for (const item of items) {
                const {
                    product_id,
                    batch_number,
                    quantity,
                    cost_price,
                    selling_price,
                    mfg_date,
                    expiry_date,
                    shelf_location = 'A-01'
                } = item;

                if (!product_id || !batch_number || !quantity || Number(quantity) <= 0 || !expiry_date) {
                    throw new Error(`Invalid item details: product_id, batch_number, quantity (>0), and expiry_date are required for every item.`);
                }

                const qtyNum = Number(quantity);
                const costNum = Number(cost_price) || 0;
                const sellNum = Number(selling_price) || (costNum * 1.5);
                const lineCost = qtyNum * costNum;
                totalCost += lineCost;

                // Check if batch exists
                let batch = findBatchStmt.get(Number(product_id), batch_number.trim());
                let batchId;

                if (batch) {
                    batchId = batch.id;
                    // Update prices if newly specified
                    updateBatchPriceStmt.run(costNum, sellNum, batchId);
                } else {
                    const bRes = insertBatchStmt.run(
                        Number(product_id),
                        batch_number.trim(),
                        Number(supplier_id),
                        costNum,
                        sellNum,
                        mfg_date || null,
                        expiry_date
                    );
                    batchId = Number(bRes.lastInsertRowid);
                }

                // Upsert inventory
                upsertInventoryStmt.run(batchId, Number(product_id), qtyNum, shelf_location);

                // Insert inward line item
                insertInwardItemStmt.run(receiptId, batchId, qtyNum, costNum, sellNum);

                processedItems.push({
                    product_id,
                    batch_id: batchId,
                    batch_number,
                    quantity: qtyNum,
                    cost_price: costNum,
                    selling_price: sellNum
                });
            }

            // Update total receipt cost
            db.prepare('UPDATE inward_receipts SET total_cost = ? WHERE id = ?').run(totalCost, receiptId);

            return {
                receipt_id: receiptId,
                receipt_number: receiptNumber,
                total_cost: totalCost,
                items_processed: processedItems.length
            };
        });

        res.status(201).json({
            success: true,
            message: 'Inbound stock received and mapped across batches with atomic database integrity.',
            data: result
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
