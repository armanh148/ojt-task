// Real-Time Dynamic Cart Engine with FEFO Batch Management & Financial Calculators

class CartService {
    constructor() {
        this.items = []; // { product_id, product_name, sku, barcode, batch_id, batch_number, expiry_date, unit_price, tax_rate, quantity, cost_price, available_stock, requires_prescription, unit }
        this.voucherCode = '';
        this.discountPercentage = 0;
        this.paymentMethod = 'CASH';
        this.cashTendered = 0;
        this.subscribers = [];
    }

    subscribe(callback) {
        this.subscribers.push(callback);
    }

    notify() {
        const totals = this.getTotals();
        for (const cb of this.subscribers) {
            cb({ items: this.items, totals, paymentMethod: this.paymentMethod, voucher: { code: this.voucherCode, discount: this.discountPercentage } });
        }
    }

    // Add item by product object + FEFO batch
    addItem(product, chosenBatch = null, qtyToAdd = 1) {
        // If no batch explicitly provided, pick the FEFO recommended batch
        const batch = chosenBatch || product.fefo_recommended_batch || (product.batches && product.batches[0]);

        if (!batch) {
            alert(`No active inventory batches with available stock found for "${product.name}".`);
            return false;
        }

        const existingIndex = this.items.findIndex(
            item => item.product_id === product.id && item.batch_id === batch.batch_id
        );

        if (existingIndex > -1) {
            // Check stock limit
            const currentQty = this.items[existingIndex].quantity;
            if (currentQty + qtyToAdd > batch.quantity) {
                alert(`Cannot add more. Batch ${batch.batch_number} only has ${batch.quantity} units available.`);
                return false;
            }
            this.items[existingIndex].quantity += qtyToAdd;
        } else {
            this.items.push({
                product_id: product.id,
                product_name: product.name,
                sku: product.sku,
                barcode: product.barcode,
                brand: product.brand,
                unit: product.unit || 'pcs',
                batch_id: batch.batch_id,
                batch_number: batch.batch_number,
                expiry_date: batch.expiry_date,
                unit_price: batch.selling_price,
                cost_price: batch.cost_price,
                tax_rate: product.tax_rate,
                available_stock: batch.quantity,
                requires_prescription: product.requires_prescription || 0,
                quantity: qtyToAdd
            });
        }

        this.notify();
        return true;
    }

    updateQuantity(index, newQty) {
        if (newQty <= 0) {
            this.removeItem(index);
            return;
        }

        const item = this.items[index];
        if (newQty > item.available_stock) {
            alert(`Stock limit reached! Batch ${item.batch_number} only has ${item.available_stock} available units.`);
            return;
        }

        item.quantity = newQty;
        this.notify();
    }

    removeItem(index) {
        this.items.splice(index, 1);
        this.notify();
    }

    clear() {
        this.items = [];
        this.voucherCode = '';
        this.discountPercentage = 0;
        this.cashTendered = 0;
        this.notify();
    }

    setPaymentMethod(method) {
        this.paymentMethod = method;
        this.notify();
    }

    setCashTendered(amount) {
        this.cashTendered = Number(amount) || 0;
        this.notify();
    }

    applyVoucher(code) {
        const cleanCode = (code || '').trim().toUpperCase();
        if (cleanCode === 'WELCOME10') {
            this.voucherCode = cleanCode;
            this.discountPercentage = 10;
            this.notify();
            return { valid: true, message: '10% promotional discount applied!' };
        } else if (cleanCode === 'MEDICARE15') {
            this.voucherCode = cleanCode;
            this.discountPercentage = 15;
            this.notify();
            return { valid: true, message: '15% healthcare discount applied!' };
        } else if (cleanCode === 'SUPER20') {
            this.voucherCode = cleanCode;
            this.discountPercentage = 20;
            this.notify();
            return { valid: true, message: '20% supervisor voucher applied!' };
        } else if (!cleanCode) {
            this.voucherCode = '';
            this.discountPercentage = 0;
            this.notify();
            return { valid: true, message: 'Voucher cleared.' };
        } else {
            return { valid: false, message: 'Invalid voucher code.' };
        }
    }

    hasPrescriptionRequiredItems() {
        return this.items.some(item => item.requires_prescription === 1);
    }

    getTotals() {
        let subtotal = 0;
        let taxAmount = 0;

        for (const item of this.items) {
            const lineSubtotal = item.unit_price * item.quantity;
            const lineTax = lineSubtotal * item.tax_rate;
            subtotal += lineSubtotal;
            taxAmount += lineTax;
        }

        const discountAmount = Math.round((subtotal * (this.discountPercentage / 100)) * 100) / 100;
        const grandTotal = Math.round((subtotal + taxAmount - discountAmount) * 100) / 100;
        const changeDue = Math.max(0, Math.round((this.cashTendered - grandTotal) * 100) / 100);

        return {
            itemCount: this.items.reduce((sum, item) => sum + item.quantity, 0),
            subtotal: Math.round(subtotal * 100) / 100,
            taxAmount: Math.round(taxAmount * 100) / 100,
            discountAmount,
            discountPercentage: this.discountPercentage,
            voucherCode: this.voucherCode,
            grandTotal,
            cashTendered: this.cashTendered,
            changeDue
        };
    }
}

window.POSCart = new CartService();
