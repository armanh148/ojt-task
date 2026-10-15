// Inventory Management UI Controller (Sprint 1 Cataloging, Duplicate Barcode Guard, Inward Intake & FEFO Inspector)

class InventoryUIController {
    constructor() {
        this.products = [];
        this.suppliers = [];
        this.categories = [];
        this.lowStockOnly = false;
        this.searchQuery = '';
        this.debounceTimer = null;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadMetadata();
        await this.loadInventoryData();
        await this.loadLowStockAlerts();
    }

    bindEvents() {
        // Table search input
        const searchInput = document.getElementById('inventorySearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.debounceTimer);
                this.searchQuery = e.target.value.trim();
                this.debounceTimer = setTimeout(() => {
                    this.loadInventoryData();
                }, 250);
            });
        }

        // Domain filter dropdown
        const domainSelect = document.getElementById('inventoryDomainFilter');
        if (domainSelect) {
            domainSelect.addEventListener('change', () => {
                this.loadInventoryData();
            });
        }

        // Low stock filter button
        const lowStockBtn = document.getElementById('btnFilterLowStock');
        if (lowStockBtn) {
            lowStockBtn.addEventListener('click', () => {
                this.lowStockOnly = !this.lowStockOnly;
                lowStockBtn.classList.toggle('active', this.lowStockOnly);
                this.loadInventoryData();
            });
        }

        // Open Add Product Modal
        const btnOpenAddProduct = document.getElementById('btnOpenAddProduct');
        const modalAddProduct = document.getElementById('modalAddProduct');
        const btnCloseAddProduct = document.getElementById('btnCloseAddProduct');
        if (btnOpenAddProduct && modalAddProduct) {
            btnOpenAddProduct.addEventListener('click', () => {
                modalAddProduct.classList.add('active');
            });
        }
        if (btnCloseAddProduct && modalAddProduct) {
            btnCloseAddProduct.addEventListener('click', () => {
                modalAddProduct.classList.remove('active');
            });
        }

        // Submit Add Product Form
        const formAddProduct = document.getElementById('formAddProduct');
        if (formAddProduct) {
            formAddProduct.addEventListener('submit', (e) => this.handleAddProductSubmit(e));
        }

        // Open Purchase Inward Modal
        const btnOpenInward = document.getElementById('btnOpenPurchaseInward');
        const modalInward = document.getElementById('modalPurchaseInward');
        const btnCloseInward = document.getElementById('btnClosePurchaseInward');
        if (btnOpenInward && modalInward) {
            btnOpenInward.addEventListener('click', () => {
                modalInward.classList.add('active');
                this.initInwardForm();
            });
        }
        if (btnCloseInward && modalInward) {
            btnCloseInward.addEventListener('click', () => {
                modalInward.classList.remove('active');
            });
        }

        // Submit Purchase Inward Form
        const formInward = document.getElementById('formPurchaseInward');
        if (formInward) {
            formInward.addEventListener('submit', (e) => this.handlePurchaseInwardSubmit(e));
        }

        // Add Row in Inward Form
        const btnAddInwardRow = document.getElementById('btnAddInwardRow');
        if (btnAddInwardRow) {
            btnAddInwardRow.addEventListener('click', () => this.addInwardRow());
        }

        // Close FEFO Modal
        const btnCloseFEFO = document.getElementById('btnCloseFEFOModal');
        const modalFEFO = document.getElementById('modalFEFOInspection');
        if (btnCloseFEFO && modalFEFO) {
            btnCloseFEFO.addEventListener('click', () => {
                modalFEFO.classList.remove('active');
            });
        }
    }

    async loadMetadata() {
        const [catRes, supRes] = await Promise.all([
            API.getCategories(),
            API.getSuppliers()
        ]);

        if (catRes.ok) {
            this.categories = catRes.data.data;
            this.populateCategoryDropdowns();
        }
        if (supRes.ok) {
            this.suppliers = supRes.data.data;
            this.populateSupplierDropdowns();
        }
    }

    populateCategoryDropdowns() {
        const select = document.getElementById('productCategorySelect');
        if (!select) return;
        select.innerHTML = '<option value="">-- Select Category --</option>' +
            this.categories.map(c => `<option value="${c.id}">[${c.domain}] ${c.name}</option>`).join('');
    }

    populateSupplierDropdowns() {
        const select = document.getElementById('inwardSupplierSelect');
        const prodSupSelect = document.getElementById('productSupplierSelect');
        const options = '<option value="">-- Select Supplier --</option>' +
            this.suppliers.map(s => `<option value="${s.id}">${s.name} (${s.contact_person})</option>`).join('');

        if (select) select.innerHTML = options;
        if (prodSupSelect) prodSupSelect.innerHTML = options;
    }

    async loadLowStockAlerts() {
        const res = await API.getLowStockAlerts();
        const banner = document.getElementById('lowStockBanner');
        const countSpan = document.getElementById('lowStockCountSpan');
        const statLowStockEl = document.getElementById('statLowStockCount');

        if (res.ok) {
            const count = res.data.alert_count;
            if (statLowStockEl) statLowStockEl.textContent = count;
            if (count > 0 && banner && countSpan) {
                countSpan.textContent = count;
                banner.style.display = 'flex';
            } else if (banner) {
                banner.style.display = 'none';
            }
        }
    }

    async loadInventoryData() {
        const domainSelect = document.getElementById('inventoryDomainFilter');
        const domain = domainSelect ? domainSelect.value : 'ALL';

        const params = {
            domain,
            limit: 100
        };
        if (this.searchQuery) params.search = this.searchQuery;
        if (this.lowStockOnly) params.low_stock = 'true';

        const res = await API.getInventory(params);
        if (res.ok) {
            this.products = res.data.data;
            this.renderInventoryTable(this.products);
            this.updateStatsCards();
        }
    }

    updateStatsCards() {
        const totalProductsEl = document.getElementById('statTotalProducts');
        const totalUnitsEl = document.getElementById('statTotalUnits');
        const activeBatchesEl = document.getElementById('statActiveBatches');

        if (totalProductsEl) totalProductsEl.textContent = this.products.length;
        if (totalUnitsEl) {
            const sumUnits = this.products.reduce((acc, p) => acc + (p.total_quantity || 0), 0);
            totalUnitsEl.textContent = sumUnits.toLocaleString();
        }
        if (activeBatchesEl) {
            const sumBatches = this.products.reduce((acc, p) => acc + (p.active_batches || 0), 0);
            activeBatchesEl.textContent = sumBatches;
        }
    }

    renderInventoryTable(products) {
        const tbody = document.getElementById('inventoryTableBody');
        if (!tbody) return;

        if (!products || products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
                        No items found matching your filters.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = products.map(p => {
            const isLow = p.total_quantity <= p.reorder_point;
            const isOut = p.total_quantity <= 0;
            const statusClass = isOut ? 'stock-out' : (isLow ? 'stock-low' : 'stock-in');
            const statusLabel = isOut ? 'OUT OF STOCK' : (isLow ? 'LOW STOCK (ROP)' : 'OPTIMAL');

            return `
                <tr>
                    <td><strong class="font-code">${p.sku}</strong></td>
                    <td><span class="font-code" style="color: var(--text-secondary);">${p.barcode}</span></td>
                    <td>
                        <div style="font-weight: 600;">${p.name}</div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">${p.brand} • ${p.category_name || ''}</div>
                    </td>
                    <td>
                        <span class="badge ${p.domain === 'PHARMACY' ? 'badge-pharma' : 'badge-retail'}">
                            ${p.domain}
                        </span>
                    </td>
                    <td><span class="stock-pill ${statusClass}">${p.total_quantity} ${p.unit}</span></td>
                    <td><span class="font-code">${p.reorder_point}</span></td>
                    <td><span class="font-code">${p.active_batches} batches</span></td>
                    <td>
                        <span class="font-code" style="color: #cbd5e1;">${p.nearest_expiry || 'N/A'}</span>
                    </td>
                    <td>
                        <div style="display: flex; gap: 0.4rem;">
                            <button class="btn btn-outline btn-sm btn-inspect-fefo" data-product-id="${p.product_id}" data-product-name="${p.name}">
                                🔬 FEFO Audit
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Bind FEFO inspect buttons
        tbody.querySelectorAll('.btn-inspect-fefo').forEach(btn => {
            btn.addEventListener('click', () => {
                const pId = btn.dataset.productId;
                const pName = btn.dataset.productName;
                this.openFEFOInspector(pId, pName);
            });
        });
    }

    async openFEFOInspector(productId, productName) {
        const modal = document.getElementById('modalFEFOInspection');
        const titleEl = document.getElementById('fefoModalProductName');
        const batchesTbody = document.getElementById('fefoBatchesTableBody');

        if (!modal) return;
        if (titleEl) titleEl.textContent = productName;

        const res = await API.getProductBatches(productId);
        if (res.ok) {
            const batches = res.data.data;
            if (batches.length === 0) {
                batchesTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem;">No active batches recorded.</td></tr>`;
            } else {
                batchesTbody.innerHTML = batches.map((b, idx) => `
                    <tr style="${idx === 0 ? 'background: rgba(16, 185, 129, 0.08); font-weight: 600;' : ''}">
                        <td>
                            ${idx === 0 ? '<span class="badge badge-success">PRIORITY #1 (FEFO)</span>' : `#${idx + 1}`}
                        </td>
                        <td><strong class="font-code">${b.batch_number}</strong></td>
                        <td><span class="font-code" style="color: #60a5fa;">${b.expiry_date}</span></td>
                        <td>${b.days_to_expiry} days</td>
                        <td><strong class="font-code" style="color:#34d399;">${b.quantity}</strong></td>
                        <td>$${Number(b.selling_price).toFixed(2)}</td>
                        <td>${b.shelf_location || 'Rack 1'}</td>
                    </tr>
                `).join('');
            }
            modal.classList.add('active');
        }
    }

    // Handle Add Product Submit (Validates Duplicate Barcode Guard)
    async handleAddProductSubmit(e) {
        e.preventDefault();

        const form = e.target;
        const payload = {
            sku: form.sku.value.trim(),
            barcode: form.barcode.value.trim(),
            name: form.name.value.trim(),
            brand: form.brand.value.trim(),
            category_id: Number(form.category_id.value),
            domain: form.domain.value,
            unit: form.unit.value.trim(),
            tax_rate: Number(form.tax_rate.value) || 0,
            reorder_point: Number(form.reorder_point.value) || 10,
            requires_prescription: form.requires_prescription ? (form.requires_prescription.checked ? 1 : 0) : 0,
            // Initial batch
            initial_stock: Number(form.initial_stock.value) || 0,
            cost_price: Number(form.cost_price.value) || 0,
            selling_price: Number(form.selling_price.value) || 0,
            batch_number: form.batch_number.value.trim(),
            expiry_date: form.expiry_date.value,
            supplier_id: form.supplier_id.value ? Number(form.supplier_id.value) : null
        };

        const res = await API.createProduct(payload);

        if (res.ok) {
            alert(`✅ Product cataloged successfully! Barcode uniqueness verified.`);
            document.getElementById('modalAddProduct').classList.remove('active');
            form.reset();
            await this.loadInventoryData();
        } else {
            // Duplicate barcode error caught
            alert(`🛑 Validation Guard Triggered:\n\n${res.data.error}`);
        }
    }

    // Purchase Inward Form Management
    initInwardForm() {
        const tbody = document.getElementById('inwardItemsTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        this.addInwardRow();
    }

    addInwardRow() {
        const tbody = document.getElementById('inwardItemsTableBody');
        if (!tbody) return;

        const rowId = Date.now() + Math.random();
        const tr = document.createElement('tr');
        tr.dataset.rowId = rowId;

        const productOptions = this.products.map(p => 
            `<option value="${p.product_id}">[${p.sku}] ${p.name}</option>`
        ).join('');

        tr.innerHTML = `
            <td>
                <select class="form-select inward-prod-select" required>
                    <option value="">-- Choose Product --</option>
                    ${productOptions}
                </select>
            </td>
            <td><input type="text" class="inward-batch" placeholder="e.g. BAT-26X" required></td>
            <td><input type="number" class="inward-qty" value="50" min="1" required style="width: 70px;"></td>
            <td><input type="number" step="0.01" class="inward-cost" value="5.00" required style="width: 80px;"></td>
            <td><input type="number" step="0.01" class="inward-sell" value="10.00" required style="width: 80px;"></td>
            <td><input type="date" class="inward-exp" value="2027-12-31" required></td>
            <td><button type="button" class="btn btn-danger btn-sm btn-remove-inward-row">✕</button></td>
        `;

        tbody.appendChild(tr);

        tr.querySelector('.btn-remove-inward-row').addEventListener('click', () => {
            if (tbody.querySelectorAll('tr').length > 1) {
                tr.remove();
            } else {
                alert('At least one item row is required.');
            }
        });
    }

    async handlePurchaseInwardSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const supplierId = form.supplier_id.value;
        const notes = form.notes.value.trim();

        if (!supplierId) {
            alert('Please select a supplier.');
            return;
        }

        const rows = document.querySelectorAll('#inwardItemsTableBody tr');
        const items = [];

        for (const tr of rows) {
            const productId = tr.querySelector('.inward-prod-select').value;
            const batchNo = tr.querySelector('.inward-batch').value.trim();
            const qty = Number(tr.querySelector('.inward-qty').value);
            const cost = Number(tr.querySelector('.inward-cost').value);
            const sell = Number(tr.querySelector('.inward-sell').value);
            const exp = tr.querySelector('.inward-exp').value;

            if (!productId || !batchNo || !qty || !exp) {
                alert('Please fill out all item fields in the inward table.');
                return;
            }

            items.push({
                product_id: Number(productId),
                batch_number: batchNo,
                quantity: qty,
                cost_price: cost,
                selling_price: sell,
                expiry_date: exp,
                shelf_location: 'Aisle-01'
            });
        }

        const res = await API.submitPurchaseInward({
            supplier_id: Number(supplierId),
            notes: notes || 'Purchase Inward Stock Intake',
            items
        });

        if (res.ok) {
            alert(`✅ Purchase Inward Registered!\nReceipt Number: ${res.data.data.receipt_number}\nTotal Value: $${res.data.data.total_cost.toFixed(2)}`);
            document.getElementById('modalPurchaseInward').classList.remove('active');
            form.reset();
            await this.loadInventoryData();
            await this.loadLowStockAlerts();
        } else {
            alert(`Error processing inward stock: ${res.data.error}`);
        }
    }
}

window.InventoryUIController = InventoryUIController;
