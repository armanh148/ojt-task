const { db, withTransaction } = require('./database');

function seedDatabase() {
    console.log('--- Starting Seed Script (200+ Mock Items & Batches) ---');

    withTransaction(() => {
        // Clear existing data for fresh seed
        db.exec('DELETE FROM invoice_items;');
        db.exec('DELETE FROM invoices;');
        db.exec('DELETE FROM inward_items;');
        db.exec('DELETE FROM inward_receipts;');
        db.exec('DELETE FROM inventory;');
        db.exec('DELETE FROM batches;');
        db.exec('DELETE FROM products;');
        db.exec('DELETE FROM suppliers;');
        db.exec('DELETE FROM categories;');
        db.exec('DELETE FROM z_reports;');

        // 1. Insert Categories
        const categories = [
            { name: 'Antibiotics & Anti-Infectives', domain: 'PHARMACY', description: 'Prescription antibiotics, antifungals, antivirals' },
            { name: 'Analgesics & Pain Relief', domain: 'PHARMACY', description: 'NSAIDs, antipyretics, and pain management' },
            { name: 'Cardiovascular & Hypertension', domain: 'PHARMACY', description: 'Blood pressure, statins, and cardiac care' },
            { name: 'Diabetes Care & Endocrine', domain: 'PHARMACY', description: 'Insulins, metformin, test strips' },
            { name: 'Gastrointestinal & Antacids', domain: 'PHARMACY', description: 'PPIs, antacids, digestive enzymes' },
            { name: 'Respiratory & Allergy', domain: 'PHARMACY', description: 'Inhalers, antihistamines, cough syrups' },
            { name: 'IV Fluids & Critical Care', domain: 'PHARMACY', description: 'Normal saline, Ringer lactate, dextrose' },
            { name: 'Surgical & Medical Disposables', domain: 'PHARMACY', description: 'Syringes, gauze, cannula, gloves' },
            { name: 'Beverages & Soft Drinks', domain: 'RETAIL', description: 'Juices, carbonated drinks, mineral water' },
            { name: 'Snacks & Confectionery', domain: 'RETAIL', description: 'Chips, biscuits, chocolates, wafers' },
            { name: 'Dairy & Cold Storage', domain: 'RETAIL', description: 'Milk, cheese, butter, yogurt' },
            { name: 'Bakery & Breakfast Cereals', domain: 'RETAIL', description: 'Bread, oats, cornflakes, granola' },
            { name: 'Pantry & Staples', domain: 'RETAIL', description: 'Rice, wheat flour, pulses, cooking oils' },
            { name: 'Household & Cleaning', domain: 'RETAIL', description: 'Detergents, floor cleaners, dishwash' },
            { name: 'Personal Care & Hygiene', domain: 'RETAIL', description: 'Soaps, shampoos, toothpaste, sanitizers' }
        ];

        const insertCategoryStmt = db.prepare('INSERT INTO categories (name, domain, description) VALUES (?, ?, ?)');
        const categoryMap = {};
        for (const cat of categories) {
            const res = insertCategoryStmt.run(cat.name, cat.domain, cat.description);
            categoryMap[cat.name] = Number(res.lastInsertRowid);
        }

        // 2. Insert Suppliers
        const suppliers = [
            { name: 'Apex Pharma Global Ltd', contact: 'Dr. Robert Vance', email: 'vance@apexpharma.com', phone: '+1-800-555-0199', address: '450 Pharma Way, New Jersey' },
            { name: 'MediCare Lifesciences Corp', contact: 'Sarah Jenkins', email: 'orders@medicarelife.com', phone: '+1-800-555-0144', address: '12 Medical Plaza, Boston' },
            { name: 'Beacon Health Pharma Logistics', contact: 'Arthur Dent', email: 'supply@beaconhealth.com', phone: '+1-800-555-0172', address: '88 Biotech Park, Raleigh' },
            { name: 'Metro Wholesale Distributors', contact: 'Michael Scott', email: 'orders@metrowholesale.com', phone: '+1-800-555-0111', address: '1725 Slough Ave, Scranton' },
            { name: 'PureDairy FMCG Ltd', contact: 'Dwight Schrute', email: 'sales@puredairy.com', phone: '+1-800-555-0123', address: 'Schrute Farms, Honesdale' },
            { name: 'Global Consumer Brands Inc', contact: 'Jim Halpert', email: 'jim@globalbrands.com', phone: '+1-800-555-0155', address: '300 Commerce Blvd, Philadelphia' },
            { name: 'Prime Hospital Disposables Co', contact: 'Pam Beesly', email: 'pam@primedisposables.com', phone: '+1-800-555-0166', address: '42 Medical Center Dr, Pittsburgh' }
        ];

        const insertSupplierStmt = db.prepare('INSERT INTO suppliers (name, contact_person, email, phone, address) VALUES (?, ?, ?, ?, ?)');
        const supplierIds = [];
        for (const sup of suppliers) {
            const res = insertSupplierStmt.run(sup.name, sup.contact, sup.email, sup.phone, sup.address);
            supplierIds.push(Number(res.lastInsertRowid));
        }

        // Prepared statements
        const insertProductStmt = db.prepare(`
            INSERT INTO products (sku, barcode, name, brand, category_id, unit, tax_rate, reorder_point, domain, requires_prescription)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertBatchStmt = db.prepare(`
            INSERT INTO batches (product_id, batch_number, supplier_id, cost_price, selling_price, mfg_date, expiry_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        const insertInventoryStmt = db.prepare(`
            INSERT INTO inventory (batch_id, product_id, quantity, reserved_quantity, shelf_location)
            VALUES (?, ?, ?, ?, ?)
        `);

        // Generate 220 items (110 Pharmacy, 110 Retail)
        const pharmaItemsDef = [
            // Antibiotics
            { name: 'Amoxicillin 500mg Capsules', brand: 'Pfizer', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.12, rP: 20, rx: 1, baseCost: 4.50, basePrice: 8.00 },
            { name: 'Azithromycin 500mg Tablets', brand: 'GSK', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.12, rP: 15, rx: 1, baseCost: 6.20, basePrice: 11.50 },
            { name: 'Ciprofloxacin 500mg', brand: 'Bayer', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.12, rP: 15, rx: 1, baseCost: 5.10, basePrice: 9.80 },
            { name: 'Cephalexin 500mg', brand: 'Lupin', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.12, rP: 15, rx: 1, baseCost: 5.80, basePrice: 10.50 },
            { name: 'Doxycycline 100mg', brand: 'Sun Pharma', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.12, rP: 10, rx: 1, baseCost: 3.40, basePrice: 6.50 },
            { name: 'Metronidazole 400mg', brand: 'Sanofi', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.05, rP: 20, rx: 1, baseCost: 2.10, basePrice: 4.20 },
            { name: 'Augmentin 625mg Duo', brand: 'GSK', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.12, rP: 25, rx: 1, baseCost: 8.50, basePrice: 15.00 },
            { name: 'Clindamycin 300mg', brand: 'Pfizer', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.12, rP: 10, rx: 1, baseCost: 7.00, basePrice: 13.00 },
            { name: 'Levofloxacin 500mg', brand: 'Cipla', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.12, rP: 12, rx: 1, baseCost: 6.00, basePrice: 11.00 },
            { name: 'Linezolid 600mg', brand: 'Glenmark', cat: 'Antibiotics & Anti-Infectives', unit: 'strip', tax: 0.12, rP: 8, rx: 1, baseCost: 14.00, basePrice: 24.00 },

            // Analgesics & Pain Relief
            { name: 'Paracetamol 650mg Dolo', brand: 'Micro Labs', cat: 'Analgesics & Pain Relief', unit: 'strip', tax: 0.05, rP: 50, rx: 0, baseCost: 1.20, basePrice: 2.50 },
            { name: 'Ibuprofen 400mg Advil', brand: 'Pfizer', cat: 'Analgesics & Pain Relief', unit: 'strip', tax: 0.05, rP: 30, rx: 0, baseCost: 2.00, basePrice: 4.00 },
            { name: 'Tramadol 50mg Ultram', brand: 'Janssen', cat: 'Analgesics & Pain Relief', unit: 'strip', tax: 0.12, rP: 15, rx: 1, baseCost: 7.50, basePrice: 14.00 },
            { name: 'Aceclofenac + Paracetamol', brand: 'Torrent', cat: 'Analgesics & Pain Relief', unit: 'strip', tax: 0.12, rP: 25, rx: 0, baseCost: 3.50, basePrice: 7.00 },
            { name: 'Diclofenac Sodium 50mg Voltaren', brand: 'Novartis', cat: 'Analgesics & Pain Relief', unit: 'strip', tax: 0.12, rP: 20, rx: 1, baseCost: 3.00, basePrice: 6.20 },
            { name: 'Mefenamic Acid 500mg Ponstan', brand: 'Pfizer', cat: 'Analgesics & Pain Relief', unit: 'strip', tax: 0.05, rP: 15, rx: 0, baseCost: 2.50, basePrice: 5.00 },
            { name: 'Naproxen 500mg Aleve', brand: 'Bayer', cat: 'Analgesics & Pain Relief', unit: 'strip', tax: 0.05, rP: 20, rx: 0, baseCost: 3.80, basePrice: 7.50 },
            { name: 'Ketorolac 10mg Toradol', brand: 'Roche', cat: 'Analgesics & Pain Relief', unit: 'strip', tax: 0.12, rP: 10, rx: 1, baseCost: 5.00, basePrice: 9.50 },
            { name: 'Paracetamol IV 100ml Infusion', brand: 'Fresenius Kabi', cat: 'Analgesics & Pain Relief', unit: 'bottle', tax: 0.05, rP: 15, rx: 1, baseCost: 6.00, basePrice: 12.00 },
            { name: 'Aspirin 75mg Low Dose', brand: 'Bayer', cat: 'Analgesics & Pain Relief', unit: 'strip', tax: 0.05, rP: 30, rx: 0, baseCost: 1.00, basePrice: 2.20 },

            // Cardiovascular & Hypertension
            { name: 'Amlodipine 5mg Norvasc', brand: 'Pfizer', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.05, rP: 25, rx: 1, baseCost: 2.20, basePrice: 4.80 },
            { name: 'Telmisartan 40mg Micardis', brand: 'Boehringer', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.12, rP: 25, rx: 1, baseCost: 4.00, basePrice: 8.50 },
            { name: 'Atorvastatin 20mg Lipitor', brand: 'Pfizer', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.12, rP: 30, rx: 1, baseCost: 5.50, basePrice: 11.00 },
            { name: 'Rosuvastatin 10mg Crestor', brand: 'AstraZeneca', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.12, rP: 20, rx: 1, baseCost: 6.50, basePrice: 13.00 },
            { name: 'Metoprolol Succinate 50mg Toprol', brand: 'AstraZeneca', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.12, rP: 20, rx: 1, baseCost: 4.20, basePrice: 8.80 },
            { name: 'Losartan Potassium 50mg Cozaar', brand: 'Merck', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.05, rP: 20, rx: 1, baseCost: 3.50, basePrice: 7.20 },
            { name: 'Clopidogrel 75mg Plavix', brand: 'Sanofi', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.12, rP: 25, rx: 1, baseCost: 5.00, basePrice: 10.50 },
            { name: 'Enalapril 5mg Vasotec', brand: 'Merck', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.05, rP: 15, rx: 1, baseCost: 2.00, basePrice: 4.50 },
            { name: 'Carvedilol 6.25mg Coreg', brand: 'GSK', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.12, rP: 15, rx: 1, baseCost: 3.20, basePrice: 6.80 },
            { name: 'Spironolactone 25mg Aldactone', brand: 'Pfizer', cat: 'Cardiovascular & Hypertension', unit: 'strip', tax: 0.05, rP: 15, rx: 1, baseCost: 2.80, basePrice: 5.90 },

            // Diabetes Care & Endocrine
            { name: 'Metformin 500mg Glucophage', brand: 'Merck', cat: 'Diabetes Care & Endocrine', unit: 'strip', tax: 0.05, rP: 40, rx: 1, baseCost: 1.80, basePrice: 3.90 },
            { name: 'Glimepiride 2mg Amaryl', brand: 'Sanofi', cat: 'Diabetes Care & Endocrine', unit: 'strip', tax: 0.05, rP: 25, rx: 1, baseCost: 2.50, basePrice: 5.20 },
            { name: 'Human Insulin Glargine Lantus 100IU', brand: 'Sanofi', cat: 'Diabetes Care & Endocrine', unit: 'vial', tax: 0.05, rP: 10, rx: 1, baseCost: 22.00, basePrice: 42.00 },
            { name: 'Insulin Aspart Novorapid PenFill', brand: 'Novo Nordisk', cat: 'Diabetes Care & Endocrine', unit: 'box', tax: 0.05, rP: 10, rx: 1, baseCost: 28.00, basePrice: 52.00 },
            { name: 'Empagliflozin 10mg Jardiance', brand: 'Boehringer', cat: 'Diabetes Care & Endocrine', unit: 'strip', tax: 0.12, rP: 15, rx: 1, baseCost: 12.00, basePrice: 22.00 },
            { name: 'Sitagliptin 100mg Januvia', brand: 'Merck', cat: 'Diabetes Care & Endocrine', unit: 'strip', tax: 0.12, rP: 15, rx: 1, baseCost: 14.00, basePrice: 26.00 },
            { name: 'Thyroxine Sodium 50mcg Eltroxin', brand: 'Abbott', cat: 'Diabetes Care & Endocrine', unit: 'bottle', tax: 0.05, rP: 25, rx: 1, baseCost: 4.00, basePrice: 8.00 },
            { name: 'Blood Glucose Test Strips 50s', brand: 'Accu-Chek', cat: 'Diabetes Care & Endocrine', unit: 'box', tax: 0.12, rP: 20, rx: 0, baseCost: 15.00, basePrice: 28.00 },

            // Gastrointestinal
            { name: 'Pantoprazole 40mg Pantocid', brand: 'Sun Pharma', cat: 'Gastrointestinal & Antacids', unit: 'strip', tax: 0.05, rP: 30, rx: 0, baseCost: 2.80, basePrice: 6.00 },
            { name: 'Omeprazole 20mg Prilosec', brand: 'AstraZeneca', cat: 'Gastrointestinal & Antacids', unit: 'strip', tax: 0.05, rP: 25, rx: 0, baseCost: 2.20, basePrice: 4.80 },
            { name: 'Rabeprazole 20mg + Domperidone', brand: 'Torrent', cat: 'Gastrointestinal & Antacids', unit: 'strip', tax: 0.12, rP: 25, rx: 1, baseCost: 4.50, basePrice: 9.20 },
            { name: 'Ondansetron 4mg Zofran', brand: 'GSK', cat: 'Gastrointestinal & Antacids', unit: 'strip', tax: 0.12, rP: 20, rx: 1, baseCost: 3.00, basePrice: 6.50 },
            { name: 'Sucralfate Suspension 200ml', brand: 'Alkem', cat: 'Gastrointestinal & Antacids', unit: 'bottle', tax: 0.05, rP: 12, rx: 1, baseCost: 5.50, basePrice: 11.00 },
            { name: 'Antacid Gel Mint Flavoured 200ml', brand: 'Digene', cat: 'Gastrointestinal & Antacids', unit: 'bottle', tax: 0.05, rP: 25, rx: 0, baseCost: 3.00, basePrice: 6.00 },

            // Respiratory & Allergy
            { name: 'Salbutamol Inhaler 100mcg Asthalin', brand: 'Cipla', cat: 'Respiratory & Allergy', unit: 'box', tax: 0.05, rP: 20, rx: 1, baseCost: 5.00, basePrice: 9.80 },
            { name: 'Budesonide 200mcg Pulmicort Inhaler', brand: 'AstraZeneca', cat: 'Respiratory & Allergy', unit: 'box', tax: 0.12, rP: 15, rx: 1, baseCost: 14.00, basePrice: 26.00 },
            { name: 'Cetirizine 10mg Zyrtec', brand: 'J&J', cat: 'Respiratory & Allergy', unit: 'strip', tax: 0.05, rP: 35, rx: 0, baseCost: 1.50, basePrice: 3.20 },
            { name: 'Levocetirizine + Montelukast', brand: 'Glenmark', cat: 'Respiratory & Allergy', unit: 'strip', tax: 0.12, rP: 25, rx: 1, baseCost: 5.20, basePrice: 10.50 },
            { name: 'Cough Expectorant Syrup 100ml Benadryl', brand: 'J&J', cat: 'Respiratory & Allergy', unit: 'bottle', tax: 0.05, rP: 20, rx: 0, baseCost: 3.20, basePrice: 6.50 },

            // IV Fluids & Critical Care
            { name: 'Normal Saline 0.9% 500ml IV Infusion', brand: 'Baxter', cat: 'IV Fluids & Critical Care', unit: 'bottle', tax: 0.05, rP: 50, rx: 1, baseCost: 1.80, basePrice: 4.50 },
            { name: 'Ringer Lactate RL 500ml IV', brand: 'B Braun', cat: 'IV Fluids & Critical Care', unit: 'bottle', tax: 0.05, rP: 40, rx: 1, baseCost: 2.10, basePrice: 5.00 },
            { name: 'Dextrose 5% 500ml Infusion', brand: 'Fresenius Kabi', cat: 'IV Fluids & Critical Care', unit: 'bottle', tax: 0.05, rP: 30, rx: 1, baseCost: 1.90, basePrice: 4.80 },
            { name: 'Potassium Chloride IV Infusion 20ml', brand: 'Pfizer', cat: 'IV Fluids & Critical Care', unit: 'vial', tax: 0.12, rP: 15, rx: 1, baseCost: 3.00, basePrice: 7.00 },

            // Surgical & Medical Disposables
            { name: 'Disposable Syringe 5ml with Needle (Box of 50)', brand: 'BD Medical', cat: 'Surgical & Medical Disposables', unit: 'box', tax: 0.12, rP: 15, rx: 0, baseCost: 8.00, basePrice: 15.00 },
            { name: 'IV Cannula 20G Pink (Box of 50)', brand: 'BD Medical', cat: 'Surgical & Medical Disposables', unit: 'box', tax: 0.12, rP: 12, rx: 1, baseCost: 18.00, basePrice: 32.00 },
            { name: 'Sterile Surgical Latex Gloves Size 7.5', brand: 'Ansell', cat: 'Surgical & Medical Disposables', unit: 'pair', tax: 0.12, rP: 40, rx: 0, baseCost: 1.20, basePrice: 2.50 },
            { name: 'Sterile Gauze Swabs 10x10cm (Pack of 100)', brand: 'Johnson & Johnson', cat: 'Surgical & Medical Disposables', unit: 'pack', tax: 0.05, rP: 20, rx: 0, baseCost: 5.00, basePrice: 9.50 },
            { name: 'Adhesive Surgical Tape Micropore 1 inch', brand: '3M Health', cat: 'Surgical & Medical Disposables', unit: 'pcs', tax: 0.12, rP: 25, rx: 0, baseCost: 2.20, basePrice: 4.50 },
            { name: 'Digital Clinical Thermometer', brand: 'Omron', cat: 'Surgical & Medical Disposables', unit: 'pcs', tax: 0.18, rP: 15, rx: 0, baseCost: 7.00, basePrice: 14.00 }
        ];

        const retailItemsDef = [
            // Beverages
            { name: 'Coca-Cola Original 500ml', brand: 'Coca-Cola', cat: 'Beverages & Soft Drinks', unit: 'bottle', tax: 0.18, rP: 30, baseCost: 0.80, basePrice: 1.50 },
            { name: 'Pepsi Cola Can 330ml', brand: 'PepsiCo', cat: 'Beverages & Soft Drinks', unit: 'can', tax: 0.18, rP: 30, baseCost: 0.70, basePrice: 1.30 },
            { name: 'Sprite Lemon Lime 500ml', brand: 'Coca-Cola', cat: 'Beverages & Soft Drinks', unit: 'bottle', tax: 0.18, rP: 25, baseCost: 0.80, basePrice: 1.50 },
            { name: 'Red Bull Energy Drink 250ml', brand: 'Red Bull', cat: 'Beverages & Soft Drinks', unit: 'can', tax: 0.18, rP: 20, baseCost: 1.60, basePrice: 2.80 },
            { name: 'Evian Natural Spring Mineral Water 1L', brand: 'Danone', cat: 'Beverages & Soft Drinks', unit: 'bottle', tax: 0.05, rP: 40, baseCost: 1.10, basePrice: 2.20 },
            { name: 'Tropicana 100% Orange Juice 1L', brand: 'Tropicana', cat: 'Beverages & Soft Drinks', unit: 'pack', tax: 0.12, rP: 20, baseCost: 2.20, basePrice: 3.99 },
            { name: 'Gatorade Blue Chill Sports Drink 500ml', brand: 'PepsiCo', cat: 'Beverages & Soft Drinks', unit: 'bottle', tax: 0.18, rP: 20, baseCost: 1.20, basePrice: 2.10 },
            { name: 'Lipton Pure Green Tea Bags 100s', brand: 'Unilever', cat: 'Beverages & Soft Drinks', unit: 'box', tax: 0.05, rP: 15, baseCost: 3.50, basePrice: 6.50 },
            { name: 'Nescafe Classic Instant Coffee 200g', brand: 'Nestlé', cat: 'Beverages & Soft Drinks', unit: 'bottle', tax: 0.12, rP: 15, baseCost: 4.80, basePrice: 8.50 },
            { name: 'Perrier Sparkling Natural Mineral Water 330ml', brand: 'Nestlé', cat: 'Beverages & Soft Drinks', unit: 'bottle', tax: 0.18, rP: 20, baseCost: 1.40, basePrice: 2.50 },

            // Snacks & Confectionery
            { name: 'Lay\'s Classic Salted Potato Chips 150g', brand: 'Frito-Lay', cat: 'Snacks & Confectionery', unit: 'pack', tax: 0.12, rP: 35, baseCost: 1.20, basePrice: 2.20 },
            { name: 'Doritos Nacho Cheese Tortilla Chips 170g', brand: 'Frito-Lay', cat: 'Snacks & Confectionery', unit: 'pack', tax: 0.12, rP: 30, baseCost: 1.50, basePrice: 2.80 },
            { name: 'Pringles Original Potato Crisps 165g', brand: 'Kellogg\'s', cat: 'Snacks & Confectionery', unit: 'can', tax: 0.12, rP: 25, baseCost: 1.80, basePrice: 3.20 },
            { name: 'Oreo Original Sandwich Cookies 300g', brand: 'Mondelez', cat: 'Snacks & Confectionery', unit: 'pack', tax: 0.12, rP: 30, baseCost: 1.60, basePrice: 2.90 },
            { name: 'KitKat 4 Finger Milk Chocolate Bar 45g', brand: 'Nestlé', cat: 'Snacks & Confectionery', unit: 'pcs', tax: 0.18, rP: 40, baseCost: 0.70, basePrice: 1.30 },
            { name: 'Snickers Peanut Caramel Chocolate Bar 50g', brand: 'Mars', cat: 'Snacks & Confectionery', unit: 'pcs', tax: 0.18, rP: 40, baseCost: 0.75, basePrice: 1.40 },
            { name: 'Cadbury Dairy Milk Silk Chocolate 150g', brand: 'Mondelez', cat: 'Snacks & Confectionery', unit: 'pcs', tax: 0.18, rP: 25, baseCost: 2.10, basePrice: 3.80 },
            { name: 'M&M\'s Milk Chocolate Candies 100g', brand: 'Mars', cat: 'Snacks & Confectionery', unit: 'pack', tax: 0.18, rP: 25, baseCost: 1.20, basePrice: 2.20 },
            { name: 'Nutella Hazelnut Cocoa Spread 350g', brand: 'Ferrero', cat: 'Snacks & Confectionery', unit: 'bottle', tax: 0.18, rP: 15, baseCost: 3.20, basePrice: 5.80 },
            { name: 'Ritz Crackers Original 200g', brand: 'Mondelez', cat: 'Snacks & Confectionery', unit: 'pack', tax: 0.12, rP: 20, baseCost: 1.40, basePrice: 2.60 },

            // Dairy & Cold Storage
            { name: 'Amul Pasteurised Butter 500g', brand: 'Amul', cat: 'Dairy & Cold Storage', unit: 'pack', tax: 0.05, rP: 20, baseCost: 3.20, basePrice: 4.80 },
            { name: 'Kraft Cheddar Cheese Block 250g', brand: 'Kraft Heinz', cat: 'Dairy & Cold Storage', unit: 'pack', tax: 0.12, rP: 15, baseCost: 2.80, basePrice: 4.90 },
            { name: 'Organic Whole Milk 1 Gallon (3.8L)', brand: 'Horizon Organic', cat: 'Dairy & Cold Storage', unit: 'bottle', tax: 0.0, rP: 25, baseCost: 3.50, basePrice: 5.20 },
            { name: 'Greek Plain Yogurt 500g', brand: 'Chobani', cat: 'Dairy & Cold Storage', unit: 'pack', tax: 0.05, rP: 20, baseCost: 2.10, basePrice: 3.80 },
            { name: 'Philadelphia Original Cream Cheese 200g', brand: 'Kraft Heinz', cat: 'Dairy & Cold Storage', unit: 'pack', tax: 0.12, rP: 15, baseCost: 2.40, basePrice: 4.20 },
            { name: 'Cage Free Fresh Brown Eggs (Dozen)', brand: 'Vital Farms', cat: 'Dairy & Cold Storage', unit: 'box', tax: 0.0, rP: 30, baseCost: 2.50, basePrice: 4.20 },

            // Bakery & Breakfast Cereals
            { name: 'Wonder Whole Wheat Bread 400g', brand: 'Wonder', cat: 'Bakery & Breakfast Cereals', unit: 'pack', tax: 0.0, rP: 25, baseCost: 1.40, basePrice: 2.50 },
            { name: 'Kellogg\'s Corn Flakes Original 500g', brand: 'Kellogg\'s', cat: 'Bakery & Breakfast Cereals', unit: 'box', tax: 0.05, rP: 20, baseCost: 2.80, basePrice: 4.90 },
            { name: 'Quaker Whole Rolled Oats 1kg', brand: 'Quaker', cat: 'Bakery & Breakfast Cereals', unit: 'pack', tax: 0.05, rP: 25, baseCost: 3.10, basePrice: 5.50 },
            { name: 'Nature Valley Crunchy Granola Bars (Box of 6)', brand: 'General Mills', cat: 'Bakery & Breakfast Cereals', unit: 'box', tax: 0.12, rP: 15, baseCost: 2.20, basePrice: 3.90 },

            // Pantry & Staples
            { name: 'India Gate Basmati Rice Premium 5kg', brand: 'India Gate', cat: 'Pantry & Staples', unit: 'pack', tax: 0.05, rP: 20, baseCost: 9.50, basePrice: 15.90 },
            { name: 'Bertolli Extra Virgin Olive Oil 1L', brand: 'Bertolli', cat: 'Pantry & Staples', unit: 'bottle', tax: 0.05, rP: 15, baseCost: 8.00, basePrice: 14.50 },
            { name: 'Barilla Spaghetti Pasta 500g', brand: 'Barilla', cat: 'Pantry & Staples', unit: 'pack', tax: 0.05, rP: 30, baseCost: 1.30, basePrice: 2.40 },
            { name: 'Heinz Tomato Ketchup 500g', brand: 'Kraft Heinz', cat: 'Pantry & Staples', unit: 'bottle', tax: 0.12, rP: 25, baseCost: 1.80, basePrice: 3.20 },
            { name: 'Pillsbury All Purpose Wheat Flour 2kg', brand: 'General Mills', cat: 'Pantry & Staples', unit: 'pack', tax: 0.0, rP: 20, baseCost: 2.20, basePrice: 3.80 },

            // Household & Cleaning
            { name: 'Tide Ultra Oxi Laundry Detergent 1.5L', brand: 'P&G', cat: 'Household & Cleaning', unit: 'bottle', tax: 0.18, rP: 15, baseCost: 6.50, basePrice: 11.90 },
            { name: 'Lysol Disinfectant Spray Crisp Linen 350g', brand: 'Reckitt', cat: 'Household & Cleaning', unit: 'can', tax: 0.18, rP: 20, baseCost: 3.80, basePrice: 6.80 },
            { name: 'Dawn Ultra Antibacterial Dish Soap 700ml', brand: 'P&G', cat: 'Household & Cleaning', unit: 'bottle', tax: 0.18, rP: 25, baseCost: 2.20, basePrice: 4.10 },
            { name: 'Bounty Quick-Size Paper Towels (Pack of 4)', brand: 'P&G', cat: 'Household & Cleaning', unit: 'pack', tax: 0.12, rP: 15, baseCost: 5.00, basePrice: 8.90 },

            // Personal Care & Hygiene
            { name: 'Colgate Total Clean Mint Toothpaste 150g', brand: 'Colgate-Palmolive', cat: 'Personal Care & Hygiene', unit: 'pcs', tax: 0.18, rP: 30, baseCost: 1.90, basePrice: 3.50 },
            { name: 'Dove Deep Moisture Body Wash 500ml', brand: 'Unilever', cat: 'Personal Care & Hygiene', unit: 'bottle', tax: 0.18, rP: 20, baseCost: 4.20, basePrice: 7.80 },
            { name: 'Head & Shoulders Classic Clean Shampoo 400ml', brand: 'P&G', cat: 'Personal Care & Hygiene', unit: 'bottle', tax: 0.18, rP: 20, baseCost: 4.50, basePrice: 8.20 },
            { name: 'Dettol Original Antiseptic Liquid 250ml', brand: 'Reckitt', cat: 'Personal Care & Hygiene', unit: 'bottle', tax: 0.12, rP: 25, baseCost: 2.60, basePrice: 4.80 },
            { name: 'Nivea Soft Moisturizing Cream 200ml', brand: 'Beiersdorf', cat: 'Personal Care & Hygiene', unit: 'pack', tax: 0.18, rP: 15, baseCost: 3.20, basePrice: 5.90 }
        ];

        // Let's expand both arrays programmatically up to 105 items each (Total = 210 products)
        const allProducts = [];

        // Add base pharma items
        pharmaItemsDef.forEach((item, idx) => {
            allProducts.push({
                ...item,
                domain: 'PHARMACY',
                rx: item.rx !== undefined ? item.rx : 1,
                sku: `RX-${String(idx + 1).padStart(4, '0')}`,
                barcode: `890100${String(idx + 1).padStart(6, '0')}`
            });
        });

        // Add variations to reach 105 pharmacy products
        let pCounter = pharmaItemsDef.length + 1;
        const pharmaStrengths = ['250mg', '500mg', '1000mg', '10ml Drop', 'Ointment 30g', 'Syrup 100ml', 'Injectable 2ml'];
        const pharmaBases = ['Amoxicillin', 'Cefixime', 'Ceftriaxone', 'Hydrocortisone', 'Betamethasone', 'Dexamethasone', 'Furosemide', 'Digoxin', 'Heparin', 'Enoxaparin', 'Ranitidine', 'Esomeprazole', 'Pantoprazole', 'Domperidone', 'Ondansetron', 'Metoclopramide', 'Loperamide', 'Lactulose', 'Albendazole', 'Ivermectin', 'Levocetirizine', 'Montelukast', 'Fexofenadine', 'Budesonide', 'Fluticasone', 'Salmeterol', 'Theophylline', 'Aminophylline', 'Glimepiride', 'Gliclazide', 'Pioglitazone', 'Vildagliptin', 'Dapagliflozin', 'Canagliflozin', 'Insulin Regular', 'Insulin NPH', 'Vitamin C 500mg', 'Vitamin D3 60k', 'Calcium Carbonate', 'Zinc Sulfate', 'Multivitamin A-Z', 'Iron + Folic Acid', 'B-Complex Forte', 'Eye Drops Lubricant', 'Ciprofloxacin Eye Drop', 'Ear Drops Wax Dissolve', 'Silver Sulfadiazine', 'Povidone Iodine 10%', 'Chlorhexidine Wash', 'Normal Saline 100ml'];

        for (const base of pharmaBases) {
            if (allProducts.filter(p => p.domain === 'PHARMACY').length >= 115) break;
            const str = pharmaStrengths[(pCounter) % pharmaStrengths.length];
            const catNames = ['Antibiotics & Anti-Infectives', 'Analgesics & Pain Relief', 'Cardiovascular & Hypertension', 'Diabetes Care & Endocrine', 'Gastrointestinal & Antacids', 'Respiratory & Allergy'];
            const cat = catNames[pCounter % catNames.length];
            const brand = ['Sun Pharma', 'Cipla', 'Dr. Reddy\'s', 'Lupin', 'Pfizer', 'Abbott', 'GSK'][pCounter % 7];
            allProducts.push({
                name: `${base} ${str}`,
                brand: brand,
                cat: cat,
                unit: str.includes('Drop') || str.includes('Syrup') ? 'bottle' : (str.includes('Ointment') ? 'tube' : 'strip'),
                tax: (pCounter % 2 === 0) ? 0.05 : 0.12,
                rP: 15,
                rx: pCounter % 3 === 0 ? 1 : 0,
                baseCost: 2.50 + (pCounter % 15),
                basePrice: 5.00 + (pCounter % 25),
                domain: 'PHARMACY',
                sku: `RX-${String(pCounter).padStart(4, '0')}`,
                barcode: `890100${String(pCounter).padStart(6, '0')}`
            });
            pCounter++;
        }

        // Add base retail items
        retailItemsDef.forEach((item, idx) => {
            allProducts.push({
                ...item,
                domain: 'RETAIL',
                rx: 0,
                sku: `RET-${String(idx + 1).padStart(4, '0')}`,
                barcode: `890200${String(idx + 1).padStart(6, '0')}`
            });
        });

        // Add variations to reach 105 retail products (Total 210+)
        let rCounter = retailItemsDef.length + 1;
        const retailBases = [
            'Fanta Orange Soda', 'Mountain Dew Citrus', 'Monster Energy Ultra', 'Schweppes Tonic Water', 'Minute Maid Apple',
            'Pringles Sour Cream & Onion', 'Cheetos Crunchy Cheddar', 'Takis Fuego Tortilla', 'Toblerone Swiss Milk Chocolate', 'Twix Caramel Cookie Bar',
            'Milka Alpine Milk', 'Hershey\'s Cookies \'n\' Creme', 'Lindt Excellence 70% Dark', 'Haribo Goldbears Gummy', 'Skittles Original Fruit',
            'Activia Probiotic Yogurt', 'President Salted Butter', 'Laughing Cow Cheese Wedges', 'Silk Almond Milk Unsweetened', 'Dannon Vanilla Yogurt',
            'English Muffins Multigrain', 'Croissants Butter 4-Pack', 'Cheerios Honey Nut 500g', 'Froot Loops Fruit Flavored', 'Special K Red Berries',
            'Jasmine Rice Fragrant 2kg', 'Quinoa Organic White 1kg', 'Canola Pure Cooking Oil 2L', 'Sunflower Pure Oil 1L', 'Apple Cider Vinegar 500ml',
            'Balsamic Vinegar of Modena', 'French Mustard Dijon 250g', 'Mayonnaise Real 400g', 'Soy Sauce Naturally Brewed', 'Sriracha Hot Chili Sauce',
            'Comfort Fabric Softener 1L', 'Vanish Oxi Action Powder', 'Mr. Muscle Kitchen Cleaner', 'Clorox Bleach Original 1L', 'Scotch-Brite Sponge 3-Pack',
            'Sensodyne Rapid Relief 100g', 'Listerine Cool Mint 500ml', 'Gillette Mach 3 Razor Blades', 'Gillette Shaving Foam 200ml', 'Old Spice Deodorant Stick',
            'Vaseline Intensive Care Lotion', 'Bic Disposable Lighter 2-Pack', 'Energizer Max AA Batteries (4-Pack)', 'Duracell Ultra AAA (4-Pack)', 'Wet Wipes Antibacterial 80s'
        ];

        for (const base of retailBases) {
            if (allProducts.filter(p => p.domain === 'RETAIL').length >= 115) break;
            const catNames = ['Beverages & Soft Drinks', 'Snacks & Confectionery', 'Dairy & Cold Storage', 'Bakery & Breakfast Cereals', 'Pantry & Staples', 'Household & Cleaning', 'Personal Care & Hygiene'];
            const cat = catNames[rCounter % catNames.length];
            const brand = ['Unilever', 'P&G', 'Nestlé', 'Coca-Cola', 'PepsiCo', 'General Mills', 'Kraft Heinz'][rCounter % 7];
            allProducts.push({
                name: base,
                brand: brand,
                cat: cat,
                unit: 'pcs',
                tax: (rCounter % 3 === 0) ? 0.05 : ((rCounter % 3 === 1) ? 0.12 : 0.18),
                rP: 12,
                rx: 0,
                baseCost: 1.50 + (rCounter % 8),
                basePrice: 3.00 + (rCounter % 14),
                domain: 'RETAIL',
                sku: `RET-${String(rCounter).padStart(4, '0')}`,
                barcode: `890200${String(rCounter).padStart(6, '0')}`
            });
            rCounter++;
        }

        console.log(`Total Products to insert: ${allProducts.length}`);

        // Insert products and batches with inventory
        let totalBatchesCreated = 0;
        let totalInventoryUnits = 0;

        allProducts.forEach((p, index) => {
            const catId = categoryMap[p.cat] || categoryMap['Beverages & Soft Drinks'];
            const pRes = insertProductStmt.run(
                p.sku,
                p.barcode,
                p.name,
                p.brand,
                catId,
                p.unit,
                p.tax,
                p.rP,
                p.domain,
                p.rx
            );
            const productId = Number(pRes.lastInsertRowid);

            // Create 1 to 3 batches per product!
            // CRITICAL FOR FEFO TESTING:
            // For Pharmacy items, we deliberately create multiple batches with different expiry dates:
            // Batch A: Expiring soon (e.g. 2 months from now: 2026-12-15)
            // Batch B: Expiring later (e.g. 10 months from now: 2027-08-20)
            // Batch C: Expiring far (e.g. 20 months from now: 2028-06-30)
            const numBatches = (p.domain === 'PHARMACY') ? (index % 3 + 1) : ((index % 4 === 0) ? 2 : 1);

            const expiryOffsets = [
                { months: 2, batchSuffix: 'EXP-SOON', qty: (index % 5 === 0) ? 4 : 25 }, // Some deliberately low stock (4 units) for low stock alert and race-condition concurrency testing!
                { months: 8, batchSuffix: 'MID-TERM', qty: 50 },
                { months: 20, batchSuffix: 'LONG-TERM', qty: 75 }
            ];

            for (let b = 0; b < numBatches; b++) {
                const offset = expiryOffsets[b];
                const expDate = new Date(2026, 9 + offset.months, 15).toISOString().split('T')[0]; // Starting Oct 2026
                const mfgDate = new Date(2026, 0, 10).toISOString().split('T')[0];
                const batchNo = `BAT-${p.sku.replace('-', '')}-${offset.batchSuffix}`;
                const supplierId = supplierIds[(index + b) % supplierIds.length];

                // Pricing variations per batch
                const costPrice = Math.round((p.baseCost * (1 + b * 0.05)) * 100) / 100;
                const sellingPrice = Math.round((p.basePrice * (1 + b * 0.05)) * 100) / 100;

                const bRes = insertBatchStmt.run(
                    productId,
                    batchNo,
                    supplierId,
                    costPrice,
                    sellingPrice,
                    mfgDate,
                    expDate
                );
                const batchId = Number(bRes.lastInsertRowid);
                totalBatchesCreated++;

                // Inventory allocation
                const shelf = p.domain === 'PHARMACY' 
                    ? `Rx-Aisle-${(index % 6) + 1}-Rack-${(b + 1)}` 
                    : `Mart-Sec-${String.fromCharCode(65 + (index % 8))}-Bay-${b + 1}`;

                insertInventoryStmt.run(
                    batchId,
                    productId,
                    offset.qty,
                    0, // 0 reserved initially
                    shelf
                );
                totalInventoryUnits += offset.qty;
            }
        });

        // 3. Seed an Initial Purchase Inward Receipt (Sprint 1 Verification)
        const inwardStmt = db.prepare(`
            INSERT INTO inward_receipts (receipt_number, supplier_id, total_cost, status, notes)
            VALUES (?, ?, ?, ?, ?)
        `);
        const inwardItemStmt = db.prepare(`
            INSERT INTO inward_items (receipt_id, batch_id, quantity, cost_price, selling_price)
            VALUES (?, ?, ?, ?, ?)
        `);

        const firstBatch = db.prepare('SELECT id, cost_price, selling_price FROM batches LIMIT 3').all();
        const inwardRes = inwardStmt.run('PO-2026-10-001', supplierIds[0], 1250.00, 'COMPLETED', 'Initial Inbound Stock Verification Intake');
        const receiptId = Number(inwardRes.lastInsertRowid);

        for (const b of firstBatch) {
            inwardItemStmt.run(receiptId, b.id, 50, b.cost_price, b.selling_price);
        }

        console.log(`--- Seed Finished Successfully! ---`);
        console.log(`Categories: ${categories.length}`);
        console.log(`Suppliers: ${suppliers.length}`);
        console.log(`Products: ${allProducts.length}`);
        console.log(`Batches: ${totalBatchesCreated}`);
        console.log(`Total Stock Units in Inventory: ${totalInventoryUnits}`);
        console.log(`Initial Purchase Inward Receipt: PO-2026-10-001`);
    });
}

if (require.main === module) {
    seedDatabase();
}

module.exports = { seedDatabase };
