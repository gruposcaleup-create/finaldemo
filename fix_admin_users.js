const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'tienda.db');
const db = new sqlite3.Database(dbPath);

const admins = [
    { email: 'admin@julg.com', pass: 'admin123', role: 'admin' },
    { email: 'editor@julg.com', pass: 'editor123', role: 'editor' },
    { email: 'support@julg.com', pass: 'support123', role: 'admin' }
];

db.serialize(() => {
    admins.forEach(user => {
        // Upsert logic: Update if exists, Insert if not
        db.get("SELECT id FROM users WHERE email = ?", [user.email], (err, row) => {
            if (row) {
                console.log(`Updating user ${user.email}...`);
                db.run("UPDATE users SET password = ?, role = ? WHERE email = ?", [user.pass, user.role, user.email], (err) => {
                    if (err) console.error(err);
                    else console.log(`Updated ${user.email}`);
                });
            } else {
                console.log(`Creating user ${user.email}...`);
                db.run("INSERT INTO users (email, password, firstName, lastName, role) VALUES (?, ?, ?, ?, ?)",
                    [user.email, user.pass, 'System', user.role.charAt(0).toUpperCase() + user.role.slice(1), user.role], (err) => {
                        if (err) console.error(err);
                        else console.log(`Created ${user.email}`);
                    });
            }
        });
    });
});

// Close DB after a short delay to ensure operations finish
setTimeout(() => {
    db.close();
    console.log('Database verification complete.');
}, 2000);
