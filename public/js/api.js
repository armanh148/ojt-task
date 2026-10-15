// Enterprise POS API Client with Latency Telemetry

const API = {
    async request(url, options = {}) {
        const start = performance.now();
        try {
            const res = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            const latency = Math.round(performance.now() - start);
            const data = await res.json();
            return { ok: res.ok, status: res.status, latency, data };
        } catch (err) {
            const latency = Math.round(performance.now() - start);
            return { ok: false, status: 0, latency, data: { error: err.message } };
        }
    },

    // Fast Scanner Barcode Lookup (<150ms SLA)
    async lookupBarcode(barcode) {
        return this.request(`/api/products/barcode/${encodeURIComponent(barcode)}`);
    },

    // Debounced Products Query
    async getProducts(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/products?${query}`);
    },

    // Categories and Suppliers
    async getCategories() {
        return this.request('/api/products/categories');
    },

    async getSuppliers() {
        return this.request('/api/products/suppliers');
    },

    // Create Product (with Unique Barcode Guard)
    async createProduct(productData) {
        return this.request('/api/products', {
            method: 'POST',
            body: JSON.stringify(productData)
        });
    },

    // Inventory & Low-Stock Alerts
    async getInventory(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/inventory?${query}`);
    },

    async getLowStockAlerts() {
        return this.request('/api/inventory/low-stock');
    },

    async getProductBatches(productId) {
        return this.request(`/api/inventory/batches/${productId}`);
    },

    async getFEFOPreview(productId, qty = 1) {
        return this.request(`/api/inventory/fefo-preview/${productId}?qty=${qty}`);
    },

    // Inbound Stock Management (Purchase Inward)
    async submitPurchaseInward(inwardData) {
        return this.request('/api/inward', {
            method: 'POST',
            body: JSON.stringify(inwardData)
        });
    },

    async getInwardReceipts() {
        return this.request('/api/inward');
    },

    // ACID Checkout & Invoicing
    async checkout(checkoutPayload) {
        return this.request('/api/checkout', {
            method: 'POST',
            body: JSON.stringify(checkoutPayload)
        });
    },

    async getInvoices(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/checkout/invoices?${query}`);
    },

    async getInvoiceDetails(invoiceId) {
        return this.request(`/api/checkout/invoices/${invoiceId}`);
    },

    async voidInvoice(invoiceId) {
        return this.request(`/api/checkout/void/${invoiceId}`, {
            method: 'POST'
        });
    },

    // Z-Reports
    async getCurrentZReport(params = {}) {
        const query = new URLSearchParams(params).toString();
        return this.request(`/api/reports/z-report/current?${query}`);
    },

    async closeZReport(cashierName = 'Main Cashier') {
        return this.request('/api/reports/z-report/close', {
            method: 'POST',
            body: JSON.stringify({ cashier_name: cashierName })
        });
    },

    async getZReportHistory() {
        return this.request('/api/reports/z-report/history');
    }
};

window.API = API;
