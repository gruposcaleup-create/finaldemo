const db = require('./database');

const priceCol = "CAST(REPLACE(REPLACE(price, '$', ''), ',', '') AS REAL)";
const sql = `SELECT id, title, price FROM courses WHERE ${priceCol} >= ? LIMIT 5`;

console.log("Testing SQL:", sql);

db.all(sql, [0], (err, rows) => {
    if (err) {
        console.error("SQL Error:", err);
    } else {
        console.log("SQL Success. Rows:", rows);
    }
});
