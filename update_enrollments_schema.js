const db = require('./database');

async function migrate() {
    console.log('Adding status to enrollments...');
    db.run(`ALTER TABLE enrollments ADD COLUMN status TEXT DEFAULT 'active'`, (err) => {
        if (err) console.log(err.message); // Ignore if exists
        else console.log("Added status column to enrollments.");
    });
}
migrate();
