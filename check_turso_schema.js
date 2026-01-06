require('dotenv').config({ path: '.env.turso' });
const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
    try {
        const rs = await client.execute("PRAGMA table_info(enrollments)");
        console.log(rs.rows);
    } catch (e) {
        console.error(e);
    }
}

run();
