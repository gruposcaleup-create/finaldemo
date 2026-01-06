require('dotenv').config({ path: '.env.turso' });
const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
    try {
        const rs = await client.execute("SELECT * FROM courses WHERE id = 2"); // Assuming course ID 2 from context/screenshots
        if (rs.rows.length > 0) {
            const row = rs.rows[0];
            console.log("Title:", row.title);
            console.log("Modules Data:", JSON.stringify(JSON.parse(row.modulesData), null, 2));
        } else {
            console.log("Course not found");
        }
    } catch (e) {
        console.error(e);
    }
}

run();
