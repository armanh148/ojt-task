const express = require('express');
const router = express.Router();
const { db, withTransaction } = require('../db/database');

// GET /api/reports/z-report/current (Live real-time reconciliation metrics since last Z-Report or for current day)
router.get('/z-report/current', (req, res) => {
    try {
        const { cashier_name, domain_mode } = req.query;

        // Find last Z-Report close time
        const lastReport = db.prepare('SELECT created_at FROM z_reports ORDER BY created_at DESC LIMIT 1').get();
        const startTime = lastReport ? lastReport.created_at : '1970-01-01 00:00:00';

        let invoiceFilter = 'WHERE i.created_at > ?';
        const params = [startTime];

        if (domain_mode && domain_mode !== 'ALL') {
            invoiceFilter += ' AND i.domain_mode = ?';
            params.push(domain_mode);
        }

        if (cashier_name) {
            invoiceFilter += ' AND i.cashier_name = ?';
            params.push(cashier_name);
        }

        // Active paid invoices
        const summary = db.prepare(`
            SELECT 
                COUNT(i.id) AS transaction_count,
                COALESCE(SUM(i.subtotal), 0) AS gross_sales,
                COALESCE(SUM(i.tax_amount), 0) AS total_sales_tax,
                COALESCE(SUM(i.discount_amount), 0) AS total_discounts,
                COALESCE(SUM(i.grand_total), 0) AS net_sales,
                COALESCE(SUM(CASE WHEN i.payment_method = 'CASH' THEN i.grand_total ELSE 0 END), 0) AS total_cash,
                COALESCE(SUM(CASE WHEN i.payment_method = 'CARD' THEN i.grand_total ELSE 0 END), 0) AS total_card,
                COALESCE(SUM(CASE WHEN i.payment_method = 'UPI' THEN i.grand_total ELSE 0 END), 0) AS total_upi,
                COALESCE(SUM(CASE WHEN i.payment_method = 'CREDIT' THEN i.grand_total ELSE 0 END), 0) AS total_credit
            FROM invoices i
            ${invoiceFilter} AND i.status = 'PAID'
        `).get(...params);

        // Void count
        const voidSummary = db.prepare(`
            SELECT COUNT(i.id) AS void_count, COALESCE(SUM(i.grand_total), 0) AS void_amount
            FROM invoices i
            ${invoiceFilter} AND i.status = 'VOID'
        `).get(...params);

        // COGS and Gross Margins calculation from invoice items
        const cogsSummary = db.prepare(`
            SELECT 
                COALESCE(SUM(ii.cost_price * ii.quantity), 0) AS total_cogs
            FROM invoice_items ii
            JOIN invoices i ON ii.invoice_id = i.id
            ${invoiceFilter} AND i.status = 'PAID'
        `).get(...params);

        const netSales = Math.round(Number(summary.net_sales) * 100) / 100;
        const totalCogs = Math.round(Number(cogsSummary.total_cogs) * 100) / 100;
        const grossMargin = Math.round((netSales - totalCogs) * 100) / 100;
        const grossMarginPercentage = netSales > 0 ? Math.round((grossMargin / netSales) * 10000) / 100 : 0;

        res.json({
            success: true,
            data: {
                start_time: startTime,
                end_time: new Date().toISOString(),
                cashier_name: cashier_name || 'All Active Terminals',
                domain_mode: domain_mode || 'ALL',
                transaction_count: summary.transaction_count,
                void_count: voidSummary.void_count,
                void_amount: voidSummary.void_amount,
                total_cash: Math.round(summary.total_cash * 100) / 100,
                total_card: Math.round(summary.total_card * 100) / 100,
                total_upi: Math.round(summary.total_upi * 100) / 100,
                total_credit: Math.round(summary.total_credit * 100) / 100,
                total_sales_tax: Math.round(summary.total_sales_tax * 100) / 100,
                total_discounts: Math.round(summary.total_discounts * 100) / 100,
                gross_sales: Math.round(summary.gross_sales * 100) / 100,
                net_sales: netSales,
                total_cogs: totalCogs,
                gross_margin: grossMargin,
                gross_margin_percentage: grossMarginPercentage
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/reports/z-report/close (Officially close day & persist Z-Report)
router.post('/z-report/close', (req, res) => {
    try {
        const { cashier_name = 'Main Cashier' } = req.body;

        const result = withTransaction(() => {
            const lastReport = db.prepare('SELECT created_at FROM z_reports ORDER BY created_at DESC LIMIT 1').get();
            const startTime = lastReport ? lastReport.created_at : '1970-01-01 00:00:00';
            const endTime = new Date().toISOString();

            // Aggregation
            const summary = db.prepare(`
                SELECT 
                    COUNT(i.id) AS transaction_count,
                    COALESCE(SUM(i.subtotal), 0) AS gross_sales,
                    COALESCE(SUM(i.tax_amount), 0) AS total_sales_tax,
                    COALESCE(SUM(i.grand_total), 0) AS net_sales,
                    COALESCE(SUM(CASE WHEN i.payment_method = 'CASH' THEN i.grand_total ELSE 0 END), 0) AS total_cash,
                    COALESCE(SUM(CASE WHEN i.payment_method = 'CARD' THEN i.grand_total ELSE 0 END), 0) AS total_card,
                    COALESCE(SUM(CASE WHEN i.payment_method = 'UPI' THEN i.grand_total ELSE 0 END), 0) AS total_upi,
                    COALESCE(SUM(CASE WHEN i.payment_method = 'CREDIT' THEN i.grand_total ELSE 0 END), 0) AS total_credit
                FROM invoices i
                WHERE i.created_at > ? AND i.status = 'PAID'
            `).get(startTime);

            const voidSummary = db.prepare(`
                SELECT COUNT(i.id) AS void_count
                FROM invoices i
                WHERE i.created_at > ? AND i.status = 'VOID'
            `).get(startTime);

            const cogsSummary = db.prepare(`
                SELECT COALESCE(SUM(ii.cost_price * ii.quantity), 0) AS total_cogs
                FROM invoice_items ii
                JOIN invoices i ON ii.invoice_id = i.id
                WHERE i.created_at > ? AND i.status = 'PAID'
            `).get(startTime);

            const netSales = Math.round(Number(summary.net_sales) * 100) / 100;
            const totalCogs = Math.round(Number(cogsSummary.total_cogs) * 100) / 100;
            const grossMargin = Math.round((netSales - totalCogs) * 100) / 100;
            const grossMarginPct = netSales > 0 ? Math.round((grossMargin / netSales) * 10000) / 100 : 0;

            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
            const reportNumber = `Z-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;

            const insertReportStmt = db.prepare(`
                INSERT INTO z_reports (
                    report_number, cashier_name, start_time, end_time,
                    transaction_count, total_cash, total_card, total_upi,
                    total_credit, total_sales_tax, gross_sales, net_sales,
                    total_cogs, gross_margin, gross_margin_percentage, void_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const insertRes = insertReportStmt.run(
                reportNumber,
                cashier_name,
                startTime,
                endTime,
                summary.transaction_count,
                Math.round(summary.total_cash * 100) / 100,
                Math.round(summary.total_card * 100) / 100,
                Math.round(summary.total_upi * 100) / 100,
                Math.round(summary.total_credit * 100) / 100,
                Math.round(summary.total_sales_tax * 100) / 100,
                Math.round(summary.gross_sales * 100) / 100,
                netSales,
                totalCogs,
                grossMargin,
                grossMarginPct,
                voidSummary.void_count
            );

            return {
                id: Number(insertRes.lastInsertRowid),
                report_number: reportNumber,
                cashier_name,
                start_time: startTime,
                end_time: endTime,
                transaction_count: summary.transaction_count,
                total_cash: summary.total_cash,
                total_card: summary.total_card,
                total_upi: summary.total_upi,
                total_credit: summary.total_credit,
                total_sales_tax: summary.total_sales_tax,
                gross_sales: summary.gross_sales,
                net_sales: netSales,
                total_cogs: totalCogs,
                gross_margin: grossMargin,
                gross_margin_percentage: grossMarginPct,
                void_count: voidSummary.void_count
            };
        });

        res.status(201).json({
            success: true,
            message: 'Z-Report generated and cashier session closed successfully.',
            data: result
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/reports/z-report/history (List past Z-Reports)
router.get('/z-report/history', (req, res) => {
    try {
        const rows = db.prepare('SELECT * FROM z_reports ORDER BY created_at DESC LIMIT 30').all();
        res.json({ success: true, count: rows.length, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
