require('dotenv').config({ path: '.env.turso' });
const db = require('./database');

const sql = `
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    courseId INTEGER NOT NULL,
    lessonId INTEGER NOT NULL,
    content TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

console.log("Running migration...");

// Using the slight delay to ensure DB connection if it's async (Turso adapter)
setTimeout(() => {
    db.run(sql, [], (err) => {
        if (err) {
            console.error("Error creating comments table:", err);
        } else {
            console.log("✅ Comments table created successfully");
        }
    });
}, 1000);
