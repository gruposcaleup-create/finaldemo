const db = require('./database');

db.all("SELECT id, title, price, category FROM courses LIMIT 10", [], (err, rows) => {
    if (err) {
        console.error("Error:", err);
        process.exit(1);
    }
    console.log("Raw Course Data:", rows);
    if (rows.length > 0) {
        console.log("Price Type:", typeof rows[0].price);
    }
});
