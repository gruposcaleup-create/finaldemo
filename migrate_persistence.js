const db = require('./database');

console.log("Migrating enrollments persistence...");

db.serialize(() => {
    // Add completedLessons column
    db.run("ALTER TABLE enrollments ADD COLUMN completedLessons TEXT DEFAULT '[]'", (err) => {
        if (err) {
            if (err.message.includes('duplicate column')) {
                console.log("Column already exists.");
            } else {
                console.error("Error adding column:", err.message);
            }
        } else {
            console.log("Column 'completedLessons' added successfully.");
        }
    });
});
