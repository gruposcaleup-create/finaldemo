require('dotenv').config({ path: '.env.turso' });
const db = require('./database');

// Wait for db to be ready
setTimeout(() => {
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
        if (err) {
            console.error("Error listing tables:", err);
        } else {
            console.log("Tables:");
            console.log(JSON.stringify(rows.map(r => r.name), null, 2));
        }
    });
}, 1000);
