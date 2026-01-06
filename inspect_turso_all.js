require('dotenv').config({ path: '.env.turso' });
const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
    try {
        const rs = await client.execute("SELECT id, title, modulesData FROM courses");
        rs.rows.forEach(row => {
            console.log(`--- Course ID ${row.id}: ${row.title} ---`);
            try {
                console.log(JSON.stringify(JSON.parse(row.modulesData), null, 2));
            } catch (e) {
                console.log("Invalid JSON:", row.modulesData);
            }
        });
    } catch (e) {
        console.error(e);
    }
}

run();
