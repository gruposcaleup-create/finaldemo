const db = require('./database');

async function runChecks() {
    console.log("--- Checking Database Content ---");

    // 1. Count Courses
    await new Promise((resolve) => {
        db.all("SELECT count(*) as count FROM courses", [], (err, rows) => {
            if (err) console.error("Error counting courses:", err);
            else console.log("Total Courses:", rows[0].count);
            resolve();
        });
    });

    // 2. List Categories
    let categories = [];
    await new Promise((resolve) => {
        const sql = `SELECT name FROM categories UNION SELECT DISTINCT category as name FROM courses WHERE category IS NOT NULL AND category != ''`;
        db.all(sql, [], (err, rows) => {
            if (err) console.error("Error getting categories:", err);
            else {
                categories = rows.map(r => r.name);
                console.log("Categories (UNION):", categories);
            }
            resolve();
        });
    });

    // 3. Check Courses Data Sample (Price, Category)
    await new Promise((resolve) => {
        db.all("SELECT id, title, price, category FROM courses LIMIT 5", [], (err, rows) => {
            if (err) console.error("Error getting sample:", err);
            else {
                console.log("Sample Courses:", rows);
            }
            resolve();
        });
    });

    // 4. Test Search 'curso'
    console.log("\n--- Testing Search 'curso' ---");
    await new Promise((resolve) => {
        const search = 'curso';
        const query = "SELECT id, title FROM courses WHERE status = 'active' AND (title LIKE ? OR \"desc\" LIKE ?)";
        db.all(query, [`%${search}%`, `%${search}%`], (err, rows) => {
            if (err) console.error("Search Error:", err);
            else console.log(`Found ${rows.length} courses matching '${search}'`);
            resolve();
        });
    });

    // 5. Test Category Filter (if categories exist)
    if (categories.length > 0) {
        const cat = categories[0];
        console.log(`\n--- Testing Category '${cat}' ---`);
        await new Promise((resolve) => {
            const query = "SELECT id, title, category FROM courses WHERE status = 'active' AND category = ?";
            db.all(query, [cat], (err, rows) => {
                if (err) console.error("kCategory Filter Error:", err);
                else console.log(`Found ${rows.length} courses in category '${cat}'`);
                resolve();
            });
        });
    }

    // 6. Test Price Filter (> 0)
    console.log("\n--- Testing Price Filter (> 0) ---");
    await new Promise((resolve) => {
        const query = "SELECT id, title, price FROM courses WHERE status = 'active' AND price >= ?";
        db.all(query, [1], (err, rows) => {
            if (err) console.error("Price Filter Error:", err);
            else console.log(`Found ${rows.length} courses with price >= 1`);
            resolve();
        });
    });

    // 7. Test Sorting (Price ASC)
    console.log("\n--- Testing Sort Price ASC ---");
    await new Promise((resolve) => {
        const query = "SELECT id, title, price FROM courses WHERE status = 'active' ORDER BY price ASC LIMIT 3";
        db.all(query, [], (err, rows) => {
            if (err) console.error("Sort Error:", err);
            else console.log("Cheapest 3:", rows);
            resolve();
        });
    });

    console.log("\n--- Done ---");
}

runChecks();
