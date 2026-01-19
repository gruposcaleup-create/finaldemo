// Migration logic modified to be safe for require()
const db = require('./database');

console.log('🔄 Checking/Migrating comments table schema...');

db.serialize(() => {
    // Add parentId column (nullable)
    db.run(`ALTER TABLE comments ADD COLUMN parentId INTEGER DEFAULT NULL`, (err) => {
        if (!err) console.log('✅ Column parentId added/checked');
        else if (!err.message.includes('duplicate')) console.error('❌ Error adding parentId:', err.message);
    });

    // Add userRole column
    db.run(`ALTER TABLE comments ADD COLUMN userRole TEXT DEFAULT 'user'`, (err) => {
        if (!err) console.log('✅ Column userRole added/checked');
        else if (!err.message.includes('duplicate')) console.error('❌ Error adding userRole:', err.message);
    });
});
// Removed db.close() to prevent closing shared connection if singleton, or just to be safe.
// Node process exit/server run will handle connection lifecycle usually.
