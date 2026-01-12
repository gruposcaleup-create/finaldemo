const app = require('./server');
const http = require('http');

const PORT = 3006;
const BASE_URL = `http://localhost:${PORT}/api`;

const server = app.listen(PORT, async () => {
    console.log(`Debug server for Categories running on port ${PORT}`);
    try {
        const testName = `Cat_${Date.now()}`;
        console.log(`\n--- 1. Initial Get ---`);
        const res1 = await fetch(`${BASE_URL}/categories`);
        const json1 = await res1.json();
        console.log(`Existing categories: ${json1.length}`);

        console.log(`\n--- 2. Add Category '${testName}' ---`);
        const res2 = await fetch(`${BASE_URL}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: testName })
        });
        const json2 = await res2.json();
        console.log("Add Result:", json2);

        console.log(`\n--- 3. Verify Persistence (Get again) ---`);
        const res3 = await fetch(`${BASE_URL}/categories`);
        const json3 = await res3.json();
        const found = json3.includes(testName);
        console.log(`Is '${testName}' in list?`, found);
        console.log("All Categories:", json3);

    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        server.close();
        process.exit(0);
    }
});
