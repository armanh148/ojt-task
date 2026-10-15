const http = require('node:http');
const { db } = require('../db/database');

const BASE_URL = 'http://localhost:3000';

function postJson(path, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function runConcurrencyStressTest() {
    console.log('===============================================================');
    console.log('⚡ EXECUTING SPRINT 3 CONCURRENCY & TRANSACTION SAFETY TEST ⚡');
    console.log('===============================================================');

    // 1. Prepare an isolated product batch with stock = 2 units
    const testBatch = db.prepare(`
        SELECT b.id AS batch_id, b.product_id, b.batch_number, p.name, i.quantity
        FROM batches b
        JOIN products p ON b.product_id = p.id
        JOIN inventory i ON b.id = i.batch_id
        WHERE i.quantity > 5
        LIMIT 1
    `).get();

    if (!testBatch) {
        console.error('No suitable test batch found in database. Run seed first.');
        process.exit(1);
    }

    console.log(`\n[STEP 1] Selected Test Product: "${testBatch.name}" (Batch: ${testBatch.batch_number})`);

    // Force batch quantity to exactly 2 units for race condition demonstration
    db.prepare('UPDATE inventory SET quantity = 2 WHERE batch_id = ?').run(testBatch.batch_id);
    const initialStock = db.prepare('SELECT quantity FROM inventory WHERE batch_id = ?').get(testBatch.batch_id).quantity;
    console.log(`Initial Stock locked at: ${initialStock} units.`);

    // 2. Launch 10 simultaneous checkout requests attempting to buy 1 unit each
    const CONCURRENT_WORKERS = 10;
    console.log(`\n[STEP 2] Firing ${CONCURRENT_WORKERS} simultaneous checkouts competing for ${initialStock} units...`);

    const checkoutPromises = [];
    for (let i = 1; i <= CONCURRENT_WORKERS; i++) {
        const payload = {
            cashier_name: `Terminal-${i}`,
            domain_mode: 'RETAIL',
            payment_method: 'CASH',
            cash_tendered: 100,
            items: [
                {
                    product_id: testBatch.product_id,
                    batch_id: testBatch.batch_id,
                    quantity: 1
                }
            ]
        };
        checkoutPromises.push(postJson('/api/checkout', payload));
    }

    const results = await Promise.all(checkoutPromises);

    let successCount = 0;
    let conflictCount = 0;
    let otherErrors = 0;

    results.forEach((res, idx) => {
        if (res.statusCode === 201) {
            successCount++;
            console.log(`  Terminal-${idx + 1}: ✅ 201 Created (Invoice: ${res.body.data.invoice_number})`);
        } else if (res.statusCode === 409) {
            conflictCount++;
            console.log(`  Terminal-${idx + 1}: 🛑 409 Conflict (Handled Gracefully: "${res.body.error}")`);
        } else {
            otherErrors++;
            console.log(`  Terminal-${idx + 1}: ❌ ${res.statusCode} (${JSON.stringify(res.body)})`);
        }
    });

    // 3. Verify stock after concurrent burst
    const finalStock = db.prepare('SELECT quantity FROM inventory WHERE batch_id = ?').get(testBatch.batch_id).quantity;
    console.log(`\n[STEP 3] Final Stock in Database: ${finalStock} units.`);

    // 4. Verification Check
    console.log('\n--- EVALUATION BENCHMARK VERIFICATION ---');
    console.log(`Success Checkouts: ${successCount} (Expected: ${initialStock})`);
    console.log(`Rejected Conflicts: ${conflictCount} (Expected: ${CONCURRENT_WORKERS - initialStock})`);
    console.log(`Final Database Stock: ${finalStock} (Expected: 0, NEVER NEGATIVE)`);

    const racePassed = (successCount === initialStock) && (finalStock === 0) && (conflictCount === CONCURRENT_WORKERS - initialStock);

    if (racePassed) {
        console.log('\n🏆 CONCURRENCY TEST PASSED! Zero phantom deductions, strict row-level isolation!');
    } else {
        console.error('\n❌ CONCURRENCY TEST FAILED! Race condition detected.');
    }

    // 5. Test ACID Rollback on Simulated Payment Failure
    console.log('\n[STEP 4] Testing Automatic Rollback on Payment Gateway Failure...');
    db.prepare('UPDATE inventory SET quantity = 10 WHERE batch_id = ?').run(testBatch.batch_id);
    const preRollbackStock = 10;

    const rollbackPayload = {
        cashier_name: 'Terminal-Rollback-Test',
        domain_mode: 'RETAIL',
        payment_method: 'CARD',
        simulate_gateway_failure: true, // triggers simulated gateway failure before commit
        items: [
            {
                product_id: testBatch.product_id,
                batch_id: testBatch.batch_id,
                quantity: 3
            }
        ]
    };

    const rollbackRes = await postJson('/api/checkout', rollbackPayload);
    const postRollbackStock = db.prepare('SELECT quantity FROM inventory WHERE batch_id = ?').get(testBatch.batch_id).quantity;

    console.log(`Gateway Response Status: ${rollbackRes.statusCode} (${rollbackRes.body.error})`);
    console.log(`Pre-attempt Stock: ${preRollbackStock} | Post-rollback Stock: ${postRollbackStock}`);

    const rollbackPassed = (rollbackRes.statusCode >= 400) && (preRollbackStock === postRollbackStock);
    if (rollbackPassed) {
        console.log('🏆 ACID ROLLBACK TEST PASSED! Inventory was strictly preserved upon transaction failure.');
    } else {
        console.error('❌ ROLLBACK FAILED! Stock discrepancy detected.');
    }

    console.log('===============================================================');
    if (racePassed && rollbackPassed) {
        console.log('✨ ALL TRANSACTION SAFETY BENCHMARKS MET (Score: 100%) ✨');
    }
}

if (require.main === module) {
    runConcurrencyStressTest().catch(console.error);
}

module.exports = { runConcurrencyStressTest };
