// Live POS Cashier Controller (Scanner Integration, Cart Management, FEFO & Checkout)

class POSController {
    constructor() {
        this.currentDomain = 'RETAIL'; // 'RETAIL' or 'PHARMACY'
        this.selectedCategory = null;
        this.searchQuery = '';
        this.searchDebounceTimer = null;
        this.allCategories = [];
        this.cashierName = 'Cashier 1';
        this.activeReceiptData = null;
        this.receiptWidth = '80mm';

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadCategories();
        await this.loadCatalog();

        // Subscribe cart to update UI
        POSCart.subscribe((state) => this.renderCart(state));
    }

    bindEvents() {
        // Barcode Scanner Listener
        BarcodeScanner.initElements('scannerInput', 'scannerStatusIndicator', 'scannerLatencyBadge');
        BarcodeScanner.onScan(async (scanEvent) => {
            await this.handleBarcodeScan(scanEvent.barcode, scanEvent.source);
        });

        // Debounced Live Search (250ms debounce)
        const searchInput = document.getElementById('catalogSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchDebounceTimer);
                this.searchQuery = e.target.value.trim();
                this.searchDebounceTimer = setTimeout(() => {
                    this.loadCatalog();
                }, 250);
            });
        }

        // Domain Mode Toggle Buttons
        const retailBtn = document.getElementById('btnModeRetail');
        const pharmaBtn = document.getElementById('btnModePharma');
        if (retailBtn && pharmaBtn) {
            retailBtn.addEventListener('click', () => this.switchDomain('RETAIL'));
            pharmaBtn.addEventListener('click', () => this.switchDomain('PHARMACY'));
        }

        // Payment Method Buttons
        document.querySelectorAll('.payment-method-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const method = btn.dataset.method;
                POSCart.setPaymentMethod(method);
            });
        });

        // Cash Tendered Input
        const cashTenderedInput = document.getElementById('cashTenderedInput');
        if (cashTenderedInput) {
            cashTenderedInput.addEventListener('input', (e) => {
                POSCart.setCashTendered(e.target.value);
            });
        }

        // Voucher Input & Apply
        const voucherInput = document.getElementById('voucherInput');
        const voucherBtn = document.getElementById('btnApplyVoucher');
        if (voucherBtn && voucherInput) {
            voucherBtn.addEventListener('click', () => {
                const res = POSCart.applyVoucher(voucherInput.value);
                this.showToast(res.message, res.valid ? 'success' : 'warning');
            });
        }

        // Clear Cart
        const clearCartBtn = document.getElementById('btnClearCart');
        if (clearCartBtn) {
            clearCartBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear the active cart?')) {
                    POSCart.clear();
                }
            });
        }

        // Complete Checkout Button
        const checkoutBtn = document.getElementById('btnCompleteCheckout');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => this.executeCheckout());
        }

        // Receipt Width Switcher
        const btn80mm = document.getElementById('btnWidth80mm');
        const btn58mm = document.getElementById('btnWidth58mm');
        if (btn80mm && btn58mm) {
            btn80mm.addEventListener('click', () => {
                this.receiptWidth = '80mm';
                btn80mm.classList.add('active');
                btn58mm.classList.remove('active');
                this.renderReceiptModal();
            });
            btn58mm.addEventListener('click', () => {
                this.receiptWidth = '58mm';
                btn58mm.classList.add('active');
                btn80mm.classList.remove('active');
                this.renderReceiptModal();
            });
        }

        // Receipt Print Button
        const btnPrintReceipt = document.getElementById('btnPrintReceipt');
        if (btnPrintReceipt) {
            btnPrintReceipt.addEventListener('click', () => {
                window.print();
            });
        }

        // Close Receipt Modal
        const btnCloseReceipt = document.getElementById('btnCloseReceipt');
        const receiptOverlay = document.getElementById('receiptModalOverlay');
        if (btnCloseReceipt && receiptOverlay) {
            btnCloseReceipt.addEventListener('click', () => {
                receiptOverlay.classList.remove('active');
            });
        }
    }

    switchDomain(domain) {
        this.currentDomain = domain;
        const retailBtn = document.getElementById('btnModeRetail');
        const pharmaBtn = document.getElementById('btnModePharma');
        const rxCard = document.getElementById('pharmacyTagsCard');

        if (domain === 'RETAIL') {
            retailBtn.classList.add('active-retail');
            pharmaBtn.classList.remove('active-pharma');
            if (rxCard) rxCard.style.display = 'none';
        } else {
            pharmaBtn.classList.add('active-pharma');
            retailBtn.classList.remove('active-retail');
            if (rxCard) rxCard.style.display = 'flex';
        }

        this.selectedCategory = null;
        this.renderCategoryPills();
        this.loadCatalog();
    }

    async loadCategories() {
        const res = await API.getCategories();
        if (res.ok) {
            this.allCategories = res.data.data;
            this.renderCategoryPills();
        }
    }

    renderCategoryPills() {
        const container = document.getElementById('categoryPillsBar');
        if (!container) return;

        const filtered = this.allCategories.filter(
            c => c.domain === this.currentDomain || c.domain === 'BOTH'
        );

        let html = `<button class="cat-pill ${!this.selectedCategory ? 'active' : ''}" data-cat-id="">All Items</button>`;
        for (const cat of filtered) {
            html += `<button class="cat-pill ${this.selectedCategory == cat.id ? 'active' : ''}" data-cat-id="${cat.id}">${cat.name}</button>`;
        }
        container.innerHTML = html;

        container.querySelectorAll('.cat-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const catId = btn.dataset.catId;
                this.selectedCategory = catId ? Number(catId) : null;
                this.renderCategoryPills();
                this.loadCatalog();
            });
        });
    }

    async loadCatalog() {
        const params = {
            domain: this.currentDomain,
            limit: 60
        };
        if (this.selectedCategory) params.category_id = this.selectedCategory;
        if (this.searchQuery) params.search = this.searchQuery;

        const res = await API.getProducts(params);
        if (res.ok) {
            this.renderProductCards(res.data.data);
        }
    }

    renderProductCards(products) {
        const container = document.getElementById('productsGridScroll');
        if (!container) return;

        if (!products || products.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
                    <p>No products found matching "${this.searchQuery || ''}".</p>
                </div>
            `;
            return;
        }

        container.innerHTML = products.map(p => {
            const isLow = p.total_stock <= p.reorder_point;
            const isOutOfStock = p.total_stock <= 0;
            const price = p.min_selling_price ? `$${Number(p.min_selling_price).toFixed(2)}` : 'N/A';
            const isPharma = p.domain === 'PHARMACY';

            return `
                <div class="pos-product-card" data-product-id="${p.id}" data-barcode="${p.barcode}">
                    <div class="card-top">
                        <div>
                            <div class="card-title">${p.name}</div>
                            <div class="card-meta">${p.brand} • SKU: ${p.sku}</div>
                            <div class="card-meta">Barcode: ${p.barcode}</div>
                        </div>
                        ${isPharma ? `<span class="card-fefo-badge">FEFO Active</span>` : ''}
                    </div>
                    <div class="card-bottom">
                        <div class="card-price">${price}</div>
                        <div class="card-stock">
                            <span class="stock-pill ${isOutOfStock ? 'stock-out' : (isLow ? 'stock-low' : 'stock-in')}">
                                ${p.total_stock} ${p.unit}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Card click event
        container.querySelectorAll('.pos-product-card').forEach(card => {
            card.addEventListener('click', async () => {
                const barcode = card.dataset.barcode;
                await this.handleBarcodeScan(barcode, 'CARD_CLICK');
            });
        });
    }

    // Main Scanner Handler (<150ms Ingestion)
    async handleBarcodeScan(barcode, source = 'HARDWARE_SCANNER') {
        const start = performance.now();
        const res = await API.lookupBarcode(barcode);
        const latency = Math.round(performance.now() - start);

        BarcodeScanner.updateLatencyBadge(latency);

        if (!res.ok) {
            this.showToast(res.data.error || `Barcode '${barcode}' not found`, 'danger');
            return;
        }

        const product = res.data.data;

        // Check if hospital pharmacy mode requires doctor info
        if (this.currentDomain === 'PHARMACY' && product.requires_prescription === 1) {
            const rxCard = document.getElementById('pharmacyTagsCard');
            if (rxCard) rxCard.style.display = 'flex';
        }

        // Add to dynamic cart with FEFO batch
        const added = POSCart.addItem(product, product.fefo_recommended_batch, 1);
        if (added) {
            const batchInfo = product.fefo_recommended_batch 
                ? `(Batch: ${product.fefo_recommended_batch.batch_number}, Exp: ${product.fefo_recommended_batch.expiry_date})` 
                : '';
            this.showToast(`⚡ Scanned: ${product.name} ${batchInfo} [${latency}ms]`, 'success');
        }
    }

    renderCart(cartState) {
        const { items, totals, paymentMethod, voucher } = cartState;

        // Render Cart Items
        const listEl = document.getElementById('cartItemsList');
        if (listEl) {
            if (items.length === 0) {
                listEl.innerHTML = `
                    <div class="cart-empty">
                        <div class="cart-empty-icon">🛒</div>
                        <p style="font-weight: 600;">Active Cart is Empty</p>
                        <p style="font-size: 0.75rem;">Scan barcodes or select products to inject items with FEFO batch allocation.</p>
                    </div>
                `;
            } else {
                listEl.innerHTML = items.map((item, index) => {
                    const lineSub = item.unit_price * item.quantity;
                    const lineTax = lineSub * item.tax_rate;
                    const lineTotal = lineSub + lineTax;

                    return `
                        <div class="cart-item-row">
                            <div class="cart-item-main">
                                <div>
                                    <div class="cart-item-name">${item.product_name}</div>
                                    <div class="cart-item-batch-info">
                                        <span class="card-fefo-badge">Batch: ${item.batch_number}</span>
                                        <span>Exp: ${item.expiry_date}</span>
                                        <span>Tax: ${(item.tax_rate * 100).toFixed(0)}%</span>
                                    </div>
                                </div>
                                <button class="item-remove-btn" data-index="${index}" title="Remove item">✕</button>
                            </div>
                            <div class="cart-item-controls">
                                <div class="qty-stepper">
                                    <button class="qty-btn" data-action="dec" data-index="${index}">-</button>
                                    <span class="qty-val">${item.quantity}</span>
                                    <button class="qty-btn" data-action="inc" data-index="${index}">+</button>
                                </div>
                                <div class="cart-item-price">$${lineTotal.toFixed(2)}</div>
                            </div>
                        </div>
                    `;
                }).join('');

                // Stepper and Remove click handlers
                listEl.querySelectorAll('.qty-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const idx = Number(btn.dataset.index);
                        const action = btn.dataset.action;
                        const current = items[idx].quantity;
                        POSCart.updateQuantity(idx, action === 'inc' ? current + 1 : current - 1);
                    });
                });

                listEl.querySelectorAll('.item-remove-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const idx = Number(btn.dataset.index);
                        POSCart.removeItem(idx);
                    });
                });
            }
        }

        // Render Totals
        const countEl = document.getElementById('cartItemsCount');
        const subtotalEl = document.getElementById('summarySubtotal');
        const taxEl = document.getElementById('summaryTax');
        const discountRowEl = document.getElementById('summaryDiscountRow');
        const discountEl = document.getElementById('summaryDiscount');
        const grandTotalEl = document.getElementById('summaryGrandTotal');
        const changeRowEl = document.getElementById('summaryChangeRow');
        const changeDueEl = document.getElementById('summaryChangeDue');

        if (countEl) countEl.textContent = `${totals.itemCount} items`;
        if (subtotalEl) subtotalEl.textContent = `$${totals.subtotal.toFixed(2)}`;
        if (taxEl) taxEl.textContent = `$${totals.taxAmount.toFixed(2)}`;
        
        if (discountRowEl && discountEl) {
            if (totals.discountAmount > 0) {
                discountRowEl.style.display = 'flex';
                discountEl.textContent = `-$${totals.discountAmount.toFixed(2)} (${totals.discountPercentage}%)`;
            } else {
                discountRowEl.style.display = 'none';
            }
        }

        if (grandTotalEl) grandTotalEl.textContent = `$${totals.grandTotal.toFixed(2)}`;

        if (changeRowEl && changeDueEl) {
            if (totals.changeDue > 0) {
                changeRowEl.style.display = 'flex';
                changeDueEl.textContent = `$${totals.changeDue.toFixed(2)}`;
            } else {
                changeRowEl.style.display = 'none';
            }
        }

        // Check prescription display
        const rxCard = document.getElementById('pharmacyTagsCard');
        if (rxCard) {
            if (this.currentDomain === 'PHARMACY' || POSCart.hasPrescriptionRequiredItems()) {
                rxCard.style.display = 'flex';
            } else {
                rxCard.style.display = 'none';
            }
        }
    }

    async executeCheckout() {
        if (POSCart.items.length === 0) {
            this.showToast('Please add items to cart before proceeding.', 'warning');
            return;
        }

        const totals = POSCart.getTotals();

        // Pharmacy Doctor & Patient tags
        const rxNo = document.getElementById('rxNumberInput')?.value.trim();
        const patientMrn = document.getElementById('patientMrnInput')?.value.trim();
        const patientName = document.getElementById('patientNameInput')?.value.trim();
        const doctorName = document.getElementById('doctorNameInput')?.value.trim();

        if (this.currentDomain === 'PHARMACY' && POSCart.hasPrescriptionRequiredItems()) {
            if (!doctorName || !patientName) {
                this.showToast('Prescription Tagging Required: Attending Doctor and Patient Name are required for Rx items.', 'danger');
                return;
            }
        }

        const payload = {
            cashier_name: this.cashierName,
            domain_mode: this.currentDomain,
            items: POSCart.items.map(i => ({
                product_id: i.product_id,
                batch_id: i.batch_id,
                quantity: i.quantity,
                unit_price: i.unit_price
            })),
            payment_method: POSCart.paymentMethod,
            cash_tendered: POSCart.cashTendered || totals.grandTotal,
            voucher_code: POSCart.voucherCode,
            voucher_discount_percentage: POSCart.discountPercentage,
            prescription_no: rxNo,
            patient_mrn: patientMrn,
            patient_name: patientName,
            doctor_name: doctorName
        };

        const res = await API.checkout(payload);

        if (res.ok) {
            this.showToast(`✅ Checkout Complete! Invoice: ${res.data.data.invoice_number}`, 'success');
            this.activeReceiptData = res.data.data;
            POSCart.clear();
            this.renderReceiptModal(true); // Open modal with autoPrint option
            this.loadCatalog(); // Refresh catalog stock levels
        } else {
            // Error handling (ACID Rollback or Concurrency Conflict)
            const err = res.data.error || 'Checkout failed.';
            if (res.status === 409) {
                alert(`⚠️ CONCURRENCY STOCK CONFLICT:\n\n${err}\n\nAutomatic rollback was enforced. No partial deductions were made.`);
            } else {
                this.showToast(`Checkout Error: ${err}`, 'danger');
            }
        }
    }

    renderReceiptModal(autoPrint = false) {
        if (!this.activeReceiptData) return;
        const container = document.getElementById('thermalReceiptContainer');
        const overlay = document.getElementById('receiptModalOverlay');

        if (container && overlay) {
            container.innerHTML = ReceiptEngine.renderThermalReceipt(this.activeReceiptData, {
                width: this.receiptWidth,
                autoPrint: false // Cashier can click Print Thermal Receipt
            });
            overlay.classList.add('active');
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast badge-${type}`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

window.POSController = POSController;
