const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('tienda.db');

db.serialize(() => {
    db.all("PRAGMA table_info(enrollments)", (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
    });
});
