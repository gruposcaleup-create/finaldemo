const db = require('./database');

async function check() {
    console.log("--- COURSES ---");
    db.all("PRAGMA table_info(courses)", [], (err, rows) => {
        if (err) console.error(err);
        else console.log(rows.map(r => r.name));
    });

    console.log("\n--- ENROLLMENTS ---");
    db.all("PRAGMA table_info(enrollments)", [], (err, rows) => {
        if (err) console.error(err);
        else console.log(rows.map(r => r.name));
    });
}
check();
