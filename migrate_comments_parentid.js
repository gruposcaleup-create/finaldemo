const db = require('./database');

console.log('🔄 Adding parentId column to comments table...');

db.serialize(() => {
    // Add parentId column (nullable, references comments.id)
    db.run(`ALTER TABLE comments ADD COLUMN parentId INTEGER DEFAULT NULL`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✅ Column parentId already exists');
            } else {
                console.error('❌ Error adding parentId column:', err.message);
            }
        } else {
            console.log('✅ Column parentId added successfully');
        }
    });

    // Add role column to comments table to cache the user's role
    db.run(`ALTER TABLE comments ADD COLUMN userRole TEXT DEFAULT 'user'`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log('✅ Column userRole already exists');
            } else {
                console.error('❌ Error adding userRole column:', err.message);
            }
        } else {
            console.log('✅ Column userRole added successfully');
        }
    });
});

// Wait a moment then verify
setTimeout(() => {
    db.all(`PRAGMA table_info(comments)`, [], (err, rows) => {
        if (err) {
            console.error('Error checking schema:', err);
        } else {
            console.log('\n📋 Current comments table schema:');
            rows.forEach(col => {
                console.log(`  - ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : 'NULL'} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
            });
        }
        db.close();
    });
}, 1000);
