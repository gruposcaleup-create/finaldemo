require('dotenv').config({ path: '.env.turso' });
const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
    console.log("🛠️ Starting Users Table Migration...");

    try {
        // 1. Rename old table
        console.log("1. Renaming old table to users_old...");
        await client.execute("ALTER TABLE users RENAME TO users_old");

        // 2. Create new table with CORRECT Schema
        console.log("2. Creating new users table with PRIMARY KEY...");
        await client.execute(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE,
                password TEXT,
                firstName TEXT,
                lastName TEXT,
                role TEXT DEFAULT 'user',
                status TEXT DEFAULT 'active',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                bannedUntil DATETIME
            )
        `);

        // 3. Copy Data
        console.log("3. Copying data from users_old to users...");
        // Explicitly selecting columns to match new schema, assuming old schema is compatible enough
        // Note: If old 'id' exists but wasn't PK, we can try to preserve it OR let it regenerate if it was broken.
        // Let's try to preserve it first.
        await client.execute(`
            INSERT INTO users (id, email, password, firstName, lastName, role, status, createdAt, bannedUntil)
            SELECT id, email, password, firstName, lastName, role, status, createdAt, bannedUntil FROM users_old
        `);

        // 4. Verification
        const count = await client.execute("SELECT COUNT(*) as count FROM users");
        console.log(`✅ Migration successful. ${count.rows[0].count} users migrated.`);

        // 5. Cleanup (Optional, but safer to keep backup for now)
        // await client.execute("DROP TABLE users_old");
        console.log("⚠️ Old table 'users_old' kept as backup. Delete manually if all is good.");

    } catch (e) {
        console.error("❌ Migration Failed:", e);
        // Rollback attempt if rename happened? 
        // Manual intervention might be needed if it fails halfway.
    }
}

run();
