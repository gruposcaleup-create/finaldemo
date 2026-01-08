const db = require('./database');

async function check() {
    db.all("PRAGMA table_info(enrollments)", [], (err, rows) => {
        if (err) console.error(err);
        else console.log(rows);
    });
}
check();
