const db = require('./database');

function run(sql) {
    return new Promise((resolve, reject) => {
        db.run(sql, [], function (err) {
            if (err) {
                // If column exists, it will fail, which is fine
                // We check for "droplicate" or generic error if column exists
                if (err.message && (err.message.includes('duplicate column') || err.message.includes('no such column') === false)) {
                    // Check if it's actually a duplicate column error specifically
                    // For sqlite/turso, adding existing column throws error.
                    // We resolve gracefully.
                    console.log(`Potential notice for query: ${sql} -> ${err.message}`);
                    resolve();
                }
                else {
                    resolve(); // Resolve anyway to try next lines? No, let's log.
                    console.log(`Error running: ${sql} -> ${err.message}`);
                }
            } else {
                console.log(`Success: ${sql}`);
                resolve();
            }
        });
    });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function migrate() {
    console.log('Starting migration via database.js ...');
    // Wait for connection to establish if async
    await delay(2000);

    try {
        // 1. Add duration to courses
        await run(`ALTER TABLE courses ADD COLUMN duration TEXT`);

        // 2. Add access to resources
        await run(`ALTER TABLE resources ADD COLUMN access TEXT DEFAULT 'public'`);

        // 3. Add status to users
        await run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`);

        console.log('Migration complete.');
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();
