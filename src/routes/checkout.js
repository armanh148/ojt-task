const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { db, withImmediateTransaction } = require('../db/database');

// GET /api/checkout/invoices (List recent invoices)
router.get('/invoices', (req, res) => {
    try {
        const { limit = 50, domain_mode, status } = req.query;
        let query = `
            SELECT 
                i.*,
                COUNT(ii.id) AS total_items,
                SUM(ii.quantity) AS total_units
            FROM invoices i
            LEFT JOIN invoice_items ii ON i.id = ii.invoice_id
            WHERE 1=1
        `;
        const params = [];

        if (domain_mode && domain_mode !== 'ALL') {
            query += ' AND i.domain_mode = ?';
            params.push(domain_mode);
        }

        if (status) {
            query += ' AND i.status = ?';
            params.push(status);
        }

        query += ' GROUP BY i.id ORDER BY i.created_at DESC LIMIT ?';
        params.push(Number(limit));

        const rows = db.prepare(query).all(...params);
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/checkout/invoices/:id (Get invoice details for thermal receipt printing)
router.get('/invoices/:id', async (req, res) => {
    try {
        const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? OR invoice_number = ?').get(req.params.id, req.params.id);
        if (!invoice) {
            return res.status(404).json({ success: false, error: 'Invoice not found.' });
        }

        const items = db.prepare(`
            SELECT 
                ii.*,
                p.brand,
                p.unit
            FROM invoice_items ii
            JOIN products p ON ii.product_id = p.id
            WHERE ii.invoice_id = ?
        `).all(invoice.id);

        let qr_code_svg = null;
        try {
            qr_code_svg = await QRCode.toString(invoice.invoice_number, {
                type: 'svg',
                margin: 1,
                width: 100,
                errorCorrectionLevel: 'M'
            });
        } catch (e) {}

        res.json({ success: true, data: { ...invoice, items, qr_code_svg } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/checkout (ACID Atomic Checkout with Row-Level Locking, FEFO Auto-Deduction & Rollback)
router.post('/', async (req, res) => {
    const startTime = performance.now();

    try {
        const {
            cashier_name = 'Cashier 1',
            domain_mode = 'RETAIL', // 'RETAIL' or 'PHARMACY'
            items, // Array of { product_id, batch_id (optional), quantity, unit_price (optional override) }
            payment_method = 'CASH', // 'CASH', 'CARD', 'UPI', 'CREDIT'
            cash_tendered = 0,
            voucher_code,
            voucher_discount_percentage = 0,
            // Hospital Pharmacy Tagging:
            prescription_no,
            patient_mrn,
            patient_name,
            doctor_name,
            // Testing & Simulation Flags:
            simulate_gateway_failure = false,
            simulate_delay_ms = 0
        } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'Cart is empty. Please add items before checkout.' });
        }

        // Validate Prescription requirement for Pharmacy Mode
        let rxRequiredFound = false;

        // Perform the entire operation in an ACID Immediate Transaction
        const transactionResult = withImmediateTransaction((dbHandle) => {
            if (simulate_delay_ms > 0) {
                // Synchronous delay inside transaction to test concurrency lock
                const startWait = Date.now();
                while (Date.now() - startWait < simulate_delay_ms) {}
            }

            // Prepared statements inside transaction
            const checkProductStmt = dbHandle.prepare(`
                SELECT id, name, sku, barcode, tax_rate, domain, requires_prescription 
                FROM products WHERE id = ?
            `);

            const getAvailableBatchesFEFOStmt = dbHandle.prepare(`
                SELECT 
                    b.id AS batch_id,
                    b.batch_number,
                    b.expiry_date,
                    b.cost_price,
                    b.selling_price,
                    i.quantity AS available_quantity
                FROM batches b
                JOIN inventory i ON b.id = i.batch_id
                WHERE b.product_id = ? AND i.quantity > 0
                ORDER BY b.expiry_date ASC
            `);

            const getSpecificBatchStmt = dbHandle.prepare(`
                SELECT 
                    b.id AS batch_id,
                    b.batch_number,
                    b.expiry_date,
                    b.cost_price,
                    b.selling_price,
                    i.quantity AS available_quantity
                FROM batches b
                JOIN inventory i ON b.id = i.batch_id
                WHERE b.id = ?
            `);

            const deductStockStmt = dbHandle.prepare(`
                UPDATE inventory 
                SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
                WHERE batch_id = ? AND quantity >= ?
            `);

            let calculatedSubtotal = 0;
            let calculatedTax = 0;
            const invoiceItemsToInsert = [];

            // Process each cart item with FEFO logic
            for (const item of items) {
                const prod = checkProductStmt.get(Number(item.product_id));
                if (!prod) {
                    throw new Error(`Product ID ${item.product_id} does not exist.`);
                }

                if (prod.requires_prescription === 1) {
                    rxRequiredFound = true;
                }

                const requestedQty = Number(item.quantity);
                if (requestedQty <= 0) {
                    throw new Error(`Invalid quantity ${requestedQty} for ${prod.name}.`);
                }

                // Determine batches to deduct:
                // If domain is PHARMACY (or FEFO enabled) and no specific batch was forced,
                // automatically allocate from earliest-expiring batch first (FEFO)!
                let allocations = [];

                if (item.batch_id) {
                    // Specific batch requested
                    const b = getSpecificBatchStmt.get(Number(item.batch_id));
                    if (!b || b.available_quantity < requestedQty) {
                        throw new Error(`CONCURRENCY_CONFLICT: Insufficient stock for ${prod.name} in batch ${b ? b.batch_number : item.batch_id}. Available: ${b ? b.available_quantity : 0}, Requested: ${requestedQty}.`);
                    }
                    allocations.push({
                        batch_id: b.batch_id,
                        batch_number: b.batch_number,
                        expiry_date: b.expiry_date,
                        cost_price: b.cost_price,
                        selling_price: item.unit_price || b.selling_price,
                        quantity: requestedQty
                    });
                } else {
                    // FEFO Auto Allocation: Earliest-Expiring First!
                    const availableBatches = getAvailableBatchesFEFOStmt.all(prod.id);
                    let neededQty = requestedQty;

                    for (const batch of availableBatches) {
                        if (neededQty <= 0) break;
                        const take = Math.min(batch.available_quantity, neededQty);
                        allocations.push({
                            batch_id: batch.batch_id,
                            batch_number: batch.batch_number,
                            expiry_date: batch.expiry_date,
                            cost_price: batch.cost_price,
                            selling_price: item.unit_price || batch.selling_price,
                            quantity: take
                        });
                        neededQty -= take;
                    }

                    if (neededQty > 0) {
                        throw new Error(`CONCURRENCY_CONFLICT: Insufficient stock for ${prod.name}. Deficit: ${neededQty} units. Another terminal or transaction may have claimed the remaining stock.`);
                    }
                }

                // Execute atomic deduction for each allocated batch
                for (const alloc of allocations) {
                    const updateRes = deductStockStmt.run(alloc.quantity, alloc.batch_id, alloc.quantity);
                    if (updateRes.changes === 0) {
                        // Concurrency conflict detected at row-level!
                        throw new Error(`CONCURRENCY_CONFLICT: Stock race condition detected on Batch ${alloc.batch_number}. The remaining stock was deducted concurrently.`);
                    }

                    const lineSubtotal = alloc.quantity * alloc.selling_price;
                    const lineTax = lineSubtotal * prod.tax_rate;
                    const lineTotal = lineSubtotal + lineTax;

                    calculatedSubtotal += lineSubtotal;
                    calculatedTax += lineTax;

                    invoiceItemsToInsert.push({
                        product_id: prod.id,
                        batch_id: alloc.batch_id,
                        product_name: prod.name,
                        sku: prod.sku,
                        batch_number: alloc.batch_number,
                        expiry_date: alloc.expiry_date,
                        quantity: alloc.quantity,
                        unit_price: alloc.selling_price,
                        tax_rate: prod.tax_rate,
                        tax_amount: Math.round(lineTax * 100) / 100,
                        cost_price: alloc.cost_price,
                        line_total: Math.round(lineTotal * 100) / 100
                    });
                }
            }

            // Prescription check validation
            if (domain_mode === 'PHARMACY' && rxRequiredFound) {
                if (!doctor_name || !patient_name) {
                    throw new Error(`PRESCRIPTION_REQUIRED: Schedule Rx drugs in cart require attending doctor and patient details.`);
                }
            }

            // Calculate discounts and grand total
            const discountPercent = Number(voucher_discount_percentage) || 0;
            const discountAmount = Math.round((calculatedSubtotal * (discountPercent / 100)) * 100) / 100;
            const grandTotal = Math.round((calculatedSubtotal + calculatedTax - discountAmount) * 100) / 100;

            const tendered = Number(cash_tendered) || grandTotal;
            const changeReturned = Math.max(0, Math.round((tendered - grandTotal) * 100) / 100);

            // Generate invoice number
            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const randSuffix = Math.floor(1000 + Math.random() * 9000);
            const invoiceNumber = `INV-${domain_mode === 'PHARMACY' ? 'RX' : 'RT'}-${dateStr}-${randSuffix}`;

            // Check testing rollback flag
            if (simulate_gateway_failure) {
                throw new Error(`SIMULATED_PAYMENT_FAILURE: Payment gateway rejected transaction. Automatic ACID rollback triggered.`);
            }

            // Insert invoice header
            const insertInvoiceStmt = dbHandle.prepare(`
                INSERT INTO invoices (
                    invoice_number, cashier_name, domain_mode, subtotal, tax_amount,
                    discount_amount, voucher_code, grand_total, payment_method,
                    cash_tendered, change_returned, prescription_no, patient_mrn,
                    patient_name, doctor_name, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID')
            `);

            const invRes = insertInvoiceStmt.run(
                invoiceNumber,
                cashier_name,
                domain_mode,
                Math.round(calculatedSubtotal * 100) / 100,
                Math.round(calculatedTax * 100) / 100,
                discountAmount,
                voucher_code || null,
                grandTotal,
                payment_method,
                tendered,
                changeReturned,
                prescription_no || null,
                patient_mrn || null,
                patient_name || null,
                doctor_name || null
            );

            const invoiceId = Number(invRes.lastInsertRowid);

            // Insert invoice line items
            const insertItemStmt = dbHandle.prepare(`
                INSERT INTO invoice_items (
                    invoice_id, product_id, batch_id, product_name, sku,
                    batch_number, expiry_date, quantity, unit_price,
                    tax_rate, tax_amount, cost_price, line_total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            for (const item of invoiceItemsToInsert) {
                insertItemStmt.run(
                    invoiceId,
                    item.product_id,
                    item.batch_id,
                    item.product_name,
                    item.sku,
                    item.batch_number,
                    item.expiry_date,
                    item.quantity,
                    item.unit_price,
                    item.tax_rate,
                    item.tax_amount,
                    item.cost_price,
                    item.line_total
                );
            }

            return {
                invoice_id: invoiceId,
                invoice_number: invoiceNumber,
                cashier_name,
                domain_mode,
                subtotal: Math.round(calculatedSubtotal * 100) / 100,
                tax_amount: Math.round(calculatedTax * 100) / 100,
                discount_amount: discountAmount,
                grand_total: grandTotal,
                payment_method,
                cash_tendered: tendered,
                change_returned: changeReturned,
                prescription_no: prescription_no || null,
                patient_mrn: patient_mrn || null,
                patient_name: patient_name || null,
                doctor_name: doctor_name || null,
                items: invoiceItemsToInsert,
                created_at: new Date().toISOString()
            };
        });

        let qr_code_svg = null;
        try {
            qr_code_svg = await QRCode.toString(transactionResult.invoice_number, {
                type: 'svg',
                margin: 1,
                width: 100,
                errorCorrectionLevel: 'M'
            });
        } catch (e) {}

        const latencyMs = Math.round(performance.now() - startTime);

        res.status(201).json({
            success: true,
            latency_ms: latencyMs,
            message: 'Checkout completed with ACID transaction integrity and FEFO stock deduction.',
            data: { ...transactionResult, qr_code_svg }
        });
    } catch (err) {
        const latencyMs = Math.round(performance.now() - startTime);
        const isConflict = err.message.includes('CONCURRENCY_CONFLICT');
        const isPrescription = err.message.includes('PRESCRIPTION_REQUIRED');
        const isSimulated = err.message.includes('SIMULATED_PAYMENT_FAILURE');

        const statusCode = isConflict ? 409 : (isPrescription ? 422 : 400);

        res.status(statusCode).json({
            success: false,
            latency_ms: latencyMs,
            is_rollback_guaranteed: true,
            error: err.message
        });
    }
});

// POST /api/checkout/void/:id (Void invoice with atomic inventory restoration)
router.post('/void/:id', (req, res) => {
    try {
        const invoiceId = req.params.id;

        const result = withImmediateTransaction((dbHandle) => {
            const invoice = dbHandle.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
            if (!invoice) {
                throw new Error('Invoice not found.');
            }
            if (invoice.status === 'VOID') {
                throw new Error('Invoice is already voided.');
            }

            // Fetch items
            const items = dbHandle.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);

            // Restock each batch
            const restockStmt = dbHandle.prepare(`
                UPDATE inventory 
                SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
                WHERE batch_id = ?
            `);

            for (const item of items) {
                restockStmt.run(item.quantity, item.batch_id);
            }

            // Update invoice status
            dbHandle.prepare("UPDATE invoices SET status = 'VOID' WHERE id = ?").run(invoiceId);

            return { invoice_id: invoiceId, status: 'VOID', restocked_items: items.length };
        });

        res.json({ success: true, message: 'Invoice voided and inventory restored atomically.', data: result });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

module.exports = router;
