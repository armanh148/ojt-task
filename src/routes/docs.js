const express = require('express');
const router = express.Router();

const openApiSpec = {
    openapi: "3.0.3",
    info: {
        title: "Enterprise POS & Inventory Management SaaS API",
        version: "1.0.0",
        description: "Production-ready Multi-Tenant POS API featuring Hardware Barcode Scanner integration, FEFO Hospital Batch Tracking, ACID-Compliant Invoicing with Row-Level Locking, and Retail Z-Reports."
    },
    servers: [
        { url: "/api", description: "Current Local Server" }
    ],
    paths: {
        "/products/barcode/{barcode}": {
            get: {
                summary: "Ultra-fast Hardware Scanner Barcode Lookup (<150ms)",
                parameters: [{ name: "barcode", in: "path", required: true, schema: { type: "string" } }],
                responses: {
                    200: { description: "Product with FEFO-sorted active batches and stock levels" },
                    404: { description: "Product not found" }
                }
            }
        },
        "/products": {
            get: {
                summary: "Search products (debounced 250ms, fuzzy filter by name, SKU, category, domain)",
                parameters: [
                    { name: "search", in: "query", schema: { type: "string" } },
                    { name: "domain", in: "query", schema: { type: "string", enum: ["ALL", "RETAIL", "PHARMACY"] } },
                    { name: "category_id", in: "query", schema: { type: "integer" } }
                ],
                responses: { 200: { description: "Filtered list of products with total inventory" } }
            },
            post: {
                summary: "Catalog new product with Unique Barcode Guard",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["sku", "barcode", "name", "brand", "category_id"],
                                properties: {
                                    sku: { type: "string" },
                                    barcode: { type: "string" },
                                    name: { type: "string" },
                                    brand: { type: "string" },
                                    category_id: { type: "integer" },
                                    domain: { type: "string", enum: ["RETAIL", "PHARMACY"] },
                                    tax_rate: { type: "number" },
                                    reorder_point: { type: "integer" },
                                    requires_prescription: { type: "integer" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: { description: "Product created" },
                    409: { description: "Duplicate Barcode or SKU Conflict" }
                }
            }
        },
        "/checkout": {
            post: {
                summary: "ACID Atomic Checkout & Invoicing with FEFO Stock Deduction & Concurrency Lock",
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["items", "payment_method"],
                                properties: {
                                    cashier_name: { type: "string" },
                                    domain_mode: { type: "string", enum: ["RETAIL", "PHARMACY"] },
                                    items: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            required: ["product_id", "quantity"],
                                            properties: {
                                                product_id: { type: "integer" },
                                                batch_id: { type: "integer" },
                                                quantity: { type: "number" }
                                            }
                                        }
                                    },
                                    payment_method: { type: "string", enum: ["CASH", "CARD", "UPI", "CREDIT"] },
                                    cash_tendered: { type: "number" },
                                    voucher_code: { type: "string" },
                                    voucher_discount_percentage: { type: "number" },
                                    prescription_no: { type: "string" },
                                    patient_mrn: { type: "string" },
                                    patient_name: { type: "string" },
                                    doctor_name: { type: "string" },
                                    simulate_gateway_failure: { type: "boolean" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: { description: "Checkout complete, invoice generated" },
                    409: { description: "Concurrency stock shortage conflict (Rollback enforced)" },
                    422: { description: "Prescription information required for Rx items" }
                }
            }
        },
        "/reports/z-report/current": {
            get: {
                summary: "Live Z-Report Cashier Reconciliation Audit",
                responses: { 200: { description: "Real-time sales, tax, cash/card balancing, and gross margins" } }
            }
        },
        "/reports/z-report/close": {
            post: {
                summary: "End-of-Day Cashier Reconciliation Close",
                responses: { 201: { description: "Z-Report officially generated and archived" } }
            }
        },
        "/inventory/low-stock": {
            get: {
                summary: "Proactive Low Stock & Reorder Point (ROP) Alerts",
                responses: { 200: { description: "Products needing restocking" } }
            }
        },
        "/inward": {
            post: {
                summary: "Inbound Stock Management (Purchase Inward Intake)",
                responses: { 201: { description: "Stock received across batches" } }
            }
        }
    }
};

router.get('/spec', (req, res) => {
    res.json(openApiSpec);
});

module.exports = router;
