// Thermal Receipt Rendering Engine (80mm & 58mm ESC/POS Layouts)

const ReceiptEngine = {
    renderThermalReceipt(invoice, options = { width: '80mm', autoPrint: false }) {
        const is80mm = options.width === '80mm';
        const isPharma = invoice.domain_mode === 'PHARMACY';

        // Format dates
        const dateObj = new Date(invoice.created_at || Date.now());
        const dateStr = dateObj.toLocaleDateString();
        const timeStr = dateObj.toLocaleTimeString();

        // Generate barcode stripe bars representation
        const barcodePattern = invoice.invoice_number.split('').map((char, i) => {
            const width = (char.charCodeAt(0) % 3) + 1.2;
            const gap = (i % 2 === 0) ? 1.5 : 2.5;
            return `<rect x="${i * 5}" y="0" width="${width}" height="32" fill="#000" />`;
        }).join('');

        const rxSection = (isPharma && (invoice.doctor_name || invoice.patient_name || invoice.prescription_no)) ? `
            <div class="receipt-rx-box">
                <div><strong>RX PRESCRIPTION BILLING</strong></div>
                ${invoice.prescription_no ? `<div>Rx No: <strong>${invoice.prescription_no}</strong></div>` : ''}
                ${invoice.patient_name ? `<div>Patient: ${invoice.patient_name} ${invoice.patient_mrn ? `(MRN: ${invoice.patient_mrn})` : ''}</div>` : ''}
                ${invoice.doctor_name ? `<div>Prescribed By: Dr. ${invoice.doctor_name}</div>` : ''}
            </div>
        ` : '';

        const itemRows = (invoice.items || []).map(item => `
            <tr>
                <td style="padding: 2px 0;">
                    <div><strong>${item.product_name}</strong></div>
                    <span class="receipt-batch-sub">B:${item.batch_number} Exp:${item.expiry_date}</span>
                </td>
                <td class="col-right" style="padding: 2px 0;">${item.quantity}</td>
                <td class="col-right" style="padding: 2px 0;">$${Number(item.unit_price).toFixed(2)}</td>
                <td class="col-right" style="padding: 2px 0;">$${Number(item.line_total).toFixed(2)}</td>
            </tr>
        `).join('');

        // Generate QR code (Fiscal verification & digital receipt link)
        let qrSvg = invoice.qr_code_svg || '';
        const qrSize = is80mm ? 100 : 80;
        if (!qrSvg && typeof QRCode !== 'undefined' && typeof QRCode.toString === 'function') {
            try {
                const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
                    ? window.location.origin
                    : 'http://localhost:3000';
                const qrPayload = `${origin}/api/checkout/invoices/${encodeURIComponent(invoice.invoice_number)}`;
                QRCode.toString(qrPayload, {
                    type: 'svg',
                    margin: 1,
                    width: qrSize,
                    errorCorrectionLevel: 'M'
                }, (err, svg) => {
                    if (!err && svg) qrSvg = svg;
                });
            } catch (e) {
                console.warn('Thermal Receipt QR generation warning:', e);
            }
        }

        const html = `
            <div id="printableThermalReceipt" class="receipt-preview-container ${is80mm ? 'receipt-80mm' : 'receipt-58mm'}">
                <div class="receipt-header">
                    <div class="receipt-logo-title">${isPharma ? 'METRO HEALTHCARE PHARMACY' : 'METRO ENTERPRISE MART'}</div>
                    <div class="receipt-sub">License: 2026-POS-SAAS | Tax ID: US-987214-X</div>
                    <div class="receipt-sub">Main Counter Blvd, Store #042</div>
                </div>

                <div class="receipt-meta-grid">
                    <div class="receipt-meta-row">
                        <span>Invoice: <strong>${invoice.invoice_number}</strong></span>
                        <span>${dateStr}</span>
                    </div>
                    <div class="receipt-meta-row">
                        <span>Cashier: ${invoice.cashier_name || 'Terminal 1'}</span>
                        <span>${timeStr}</span>
                    </div>
                    <div class="receipt-meta-row">
                        <span>Domain: <strong>${invoice.domain_mode}</strong></span>
                        <span>Status: ${invoice.status || 'PAID'}</span>
                    </div>
                </div>

                ${rxSection}

                <table class="receipt-items-table">
                    <thead>
                        <tr>
                            <th style="width: 48%;">Item</th>
                            <th class="col-right" style="width: 12%;">Qty</th>
                            <th class="col-right" style="width: 20%;">Rate</th>
                            <th class="col-right" style="width: 20%;">Amt</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemRows}
                    </tbody>
                </table>

                <div class="receipt-totals-section">
                    <div class="receipt-total-row">
                        <span>Subtotal:</span>
                        <span>$${Number(invoice.subtotal).toFixed(2)}</span>
                    </div>
                    <div class="receipt-total-row">
                        <span>Taxes & GST:</span>
                        <span>$${Number(invoice.tax_amount).toFixed(2)}</span>
                    </div>
                    ${invoice.discount_amount > 0 ? `
                    <div class="receipt-total-row" style="color: #000; font-weight: bold;">
                        <span>Discount ${invoice.voucher_code ? `(${invoice.voucher_code})` : ''}:</span>
                        <span>-$${Number(invoice.discount_amount).toFixed(2)}</span>
                    </div>
                    ` : ''}
                    <div class="receipt-total-row receipt-grand-row">
                        <span>GRAND TOTAL:</span>
                        <span>$${Number(invoice.grand_total).toFixed(2)}</span>
                    </div>
                    <div class="receipt-total-row" style="margin-top: 4px;">
                        <span>Payment (${invoice.payment_method}):</span>
                        <span>$${Number(invoice.cash_tendered || invoice.grand_total).toFixed(2)}</span>
                    </div>
                    ${invoice.change_returned > 0 ? `
                    <div class="receipt-total-row">
                        <span>Change Returned:</span>
                        <span>$${Number(invoice.change_returned).toFixed(2)}</span>
                    </div>
                    ` : ''}
                </div>

                ${qrSvg ? `
                <div class="receipt-qr-box">
                    <div class="receipt-qr-code">
                        ${qrSvg}
                    </div>
                    <div class="receipt-qr-caption">Scan for Digital Receipt & Fiscal Verification</div>
                </div>
                ` : ''}

                <div class="receipt-barcode-box">
                    <svg class="barcode-svg" viewBox="0 0 160 32">
                        ${barcodePattern}
                    </svg>
                    <div>* ${invoice.invoice_number} *</div>
                </div>

                <div class="receipt-footer">
                    <div>Thank you for choosing ${isPharma ? 'Metro Pharmacy' : 'Metro Mart'}!</div>
                    <div>Computer Generated Tax Fiscal Receipt</div>
                    <div>No returns on Schedule H drugs or chilled items</div>
                </div>
            </div>
        `;

        if (options.autoPrint) {
            setTimeout(() => {
                window.print();
            }, 300);
        }

        return html;
    }
};

window.ReceiptEngine = ReceiptEngine;
