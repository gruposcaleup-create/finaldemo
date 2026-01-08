const db = require('./database');

console.log('🔵 Checking users table schema...');

db.serialize(() => {
    // Check if column exists
    db.all("PRAGMA table_info(users)", (err, rows) => {
        if (err) {
            console.error('❌ Error checking schema:', err);
            return;
        }

        const hasBannedUntil = rows.some(r => r.name === 'bannedUntil');

        if (!hasBannedUntil) {
            console.log('⚠️ Column bannedUntil missing. Adding...');
            db.run("ALTER TABLE users ADD COLUMN bannedUntil DATETIME", (err) => {
                if (err) {
                    console.error('❌ Error adding column:', err);
                } else {
                    console.log('✅ Column bannedUntil added successfully.');
                }
            });
        } else {
            console.log('✅ Column bannedUntil already exists.');
        }
    });
});
