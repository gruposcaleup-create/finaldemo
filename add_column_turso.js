require('dotenv').config({ path: '.env.turso' });
const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
    try {
        console.log("Adding completedLessons column...");
        await client.execute("ALTER TABLE enrollments ADD COLUMN completedLessons TEXT");
        console.log("Column added successfully or already exists.");
    } catch (e) {
        if (e.message.includes('duplicate column')) {
            console.log("Column already exists.");
        } else {
            console.error(e);
        }
    }
}

run();
