const db = require('./database');

db.serialize(() => {
    // List tables
    db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
        if (err) {
            console.error(err);
            return;
        }
        console.log("Tables:", tables.map(t => t.name));

        // Check categories schema if it exists
        if (tables.find(t => t.name === 'categories')) {
            db.all("PRAGMA table_info(categories)", [], (err, info) => {
                console.log("Categories Schema:", info);
            });
        } else {
            console.log("❌ Categories table MISSING");
        }
    });
});
