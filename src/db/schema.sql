-- Enterprise POS & Inventory Management SaaS Schema
-- Compliant with ACID Transactions, Strict Foreign Keys, Unique Barcode Guards, and FEFO Batch Tracking

PRAGMA foreign_keys = ON;

-- 1. Categories
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL CHECK(domain IN ('RETAIL', 'PHARMACY', 'BOTH')),
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Products (Includes unique barcode guard and reorder point)
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    barcode TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    unit TEXT NOT NULL DEFAULT 'pcs',
    tax_rate REAL NOT NULL DEFAULT 0.0,
    reorder_point INTEGER NOT NULL DEFAULT 10,
    domain TEXT NOT NULL CHECK(domain IN ('RETAIL', 'PHARMACY')),
    requires_prescription INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Unique index guard on barcode and SKU for hardware scanner lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);

-- 4. Batches (First-Expired, First-Out Tracking)
CREATE TABLE IF NOT EXISTS batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_number TEXT NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    cost_price REAL NOT NULL,
    selling_price REAL NOT NULL,
    mfg_date DATE,
    expiry_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(product_id, expiry_date ASC);

-- 5. Inventory Stocks (Batch-level stock with non-negative constraints)
CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK(reserved_quantity >= 0),
    shelf_location TEXT DEFAULT 'A-01',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(batch_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);

-- 6. Inbound Stock Management (Purchase Inward Receipts)
CREATE TABLE IF NOT EXISTS inward_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_number TEXT NOT NULL UNIQUE,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    total_cost REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    notes TEXT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Inward Items
CREATE TABLE IF NOT EXISTS inward_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL REFERENCES inward_receipts(id) ON DELETE CASCADE,
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    cost_price REAL NOT NULL,
    selling_price REAL NOT NULL
);

-- 8. Invoices (Retail & Hospital Pharmacy with Doctor/Patient Tagging)
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    cashier_name TEXT NOT NULL DEFAULT 'Cashier 1',
    domain_mode TEXT NOT NULL CHECK(domain_mode IN ('RETAIL', 'PHARMACY')),
    subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL,
    discount_amount REAL NOT NULL DEFAULT 0,
    voucher_code TEXT,
    grand_total REAL NOT NULL,
    payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH', 'CARD', 'UPI', 'CREDIT')),
    cash_tendered REAL DEFAULT 0,
    change_returned REAL DEFAULT 0,
    -- Hospital Pharmacy Fields:
    prescription_no TEXT,
    patient_mrn TEXT,
    patient_name TEXT,
    doctor_name TEXT,
    status TEXT NOT NULL DEFAULT 'PAID' CHECK(status IN ('PAID', 'VOID', 'REFUNDED')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);

-- 9. Invoice Items (Snapshot of batch, pricing, tax, and COGS for Z-Reports)
CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    batch_id INTEGER NOT NULL REFERENCES batches(id),
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    batch_number TEXT NOT NULL,
    expiry_date DATE NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL,
    tax_rate REAL NOT NULL,
    tax_amount REAL NOT NULL,
    cost_price REAL NOT NULL,
    line_total REAL NOT NULL
);

-- 10. Z-Reports (End-of-day cashier reconciliation & audit)
CREATE TABLE IF NOT EXISTS z_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_number TEXT NOT NULL UNIQUE,
    cashier_name TEXT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    transaction_count INTEGER NOT NULL,
    total_cash REAL NOT NULL,
    total_card REAL NOT NULL,
    total_upi REAL NOT NULL,
    total_credit REAL NOT NULL,
    total_sales_tax REAL NOT NULL,
    gross_sales REAL NOT NULL,
    net_sales REAL NOT NULL,
    total_cogs REAL NOT NULL,
    gross_margin REAL NOT NULL,
    gross_margin_percentage REAL NOT NULL,
    void_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
