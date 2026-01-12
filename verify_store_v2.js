const app = require('./server');

const PORT = 3008;
const BASE_URL = `http://localhost:${PORT}/api`;

const server = app.listen(PORT, async () => {
    console.log(`Verification Server (Robust) running on port ${PORT}`);
    try {
        console.log("\n--- Check Filters & Debug Header ---");
        const res = await fetch(`${BASE_URL}/courses?minPrice=5&maxPrice=50`);

        console.log("Status:", res.status);
        console.log("X-Debug-App-Version:", res.headers.get('X-Debug-App-Version'));

        const products = await res.json();
        console.log(`Found ${products.length} products (Expected 2 for 5-50 range)`);
        products.forEach(p => console.log(` - ${p.title} [$${p.price}]`));

    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        server.close();
        process.exit(0);
    }
});
