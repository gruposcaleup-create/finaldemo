const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dotenv = require('dotenv');

// Try to load .env types
dotenv.config();
dotenv.config({ path: '.env.turso' });

// Determine Driver
const USE_TURSO = !!process.env.TURSO_DATABASE_URL;

let db;

if (USE_TURSO) {
    console.log("🔵 Connecting to Turso (Cloud Database)...");
    const { createClient } = require('@libsql/client');
    const client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    // ADAPTER: Wraps Turso client to look like sqlite3
    db = {
        serialize: (cb) => {
            // For Turso, we can run the repair logic here as initialization
            const repair = async () => {
                try {
                    console.log("🛠️ Checking/Repairing 'comments' table schema...");
                    // Force add columns if missing (sqlite doesn't support IF NOT EXISTS for columns easily in one statement, so we try/catch)
                    await client.execute('ALTER TABLE comments ADD COLUMN parentId INTEGER');
                    console.log("✅ Added parentId column");
                } catch (e) { /* ignore if exists */ }

                try {
                    await client.execute('ALTER TABLE comments ADD COLUMN userRole TEXT');
                    console.log("✅ Added userRole column");
                } catch (e) { /* ignore if exists */ }

                try {
                    await client.execute('ALTER TABLE users ADD COLUMN phoneNumber TEXT');
                    console.log("✅ Added phoneNumber column to users");
                } catch (e) { /* ignore if exists */ }
                try {
                    await client.execute('ALTER TABLE courses ADD COLUMN status TEXT DEFAULT "active"');
                    console.log("✅ Added status column to courses");
                } catch (e) { /* ignore if exists */ }

                try {
                    await client.execute('UPDATE courses SET status = "active" WHERE status IS NULL OR status = ""');
                    // console.log("✅ Updated missing course statuses to active");
                } catch (e) { /* ignore */ }

                try {
                    await client.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
                    console.log("✅ Ensured settings table exists");
                } catch (e) { /* ignore if exists */ }
            };
            repair(); // Fire and forget or allow async
            if (cb) cb();
        },
        run: function (sql, params, callback) {
            if (typeof params === 'function') { callback = params; params = []; }
            if (!params) params = [];

            client.execute({ sql, args: params })
                .then(result => {
                    if (callback) {
                        // Context simulation for sqlite3 compatibility (this.lastID)
                        const context = {
                            lastID: Number(result.lastInsertRowid),
                            changes: result.rowsAffected
                        };
                        callback.call(context, null);
                    }
                })
                .catch(err => {
                    console.error("Turso Query Error (run):", sql, err);
                    if (callback) callback(err);
                });
            return this;
        },
        get: function (sql, params, callback) {
            if (typeof params === 'function') { callback = params; params = []; }
            if (!params) params = [];

            client.execute({ sql, args: params })
                .then(result => {
                    if (callback) callback(null, result.rows[0]);
                })
                .catch(err => {
                    console.error("Turso Query Error (get):", sql, err);
                    if (callback) callback(err);
                });
            return this;
        },
        all: function (sql, params, callback) {
            if (typeof params === 'function') { callback = params; params = []; }
            if (!params) params = [];

            client.execute({ sql, args: params })
                .then(result => {
                    if (callback) callback(null, result.rows);
                })
                .catch(err => {
                    console.error("Turso Query Error (all):", sql, err);
                    if (callback) callback(err);
                });
            return this;
        },
        close: () => { /* client.close() if needed */ }
    };

    // Auto-Repair Trigger
    db.serialize();

    console.log("✅ Custom Adapter for Turso Ready + Repair Logic Injected");

} else {
    // FALLBACK: Local SQLite
    const dbPath = path.resolve(__dirname, 'database.sqlite'); // Consolidated to one file
    console.log(`🟠 Connecting to Local SQLite at ${dbPath}`);

    db = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error('CRITICAL: Error connecting to SQLite:', err.message);
        else console.log('Connected to Local SQLite');
    });
}

// Common Init used by both (Idempotent)
function initDatabase() {
    const run = (sql, params) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params || [], function (err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    };

    // We can run these asyncs without blocking, but for simplicity we fire and forget or simple chain.
    // For Turso, these run async. For SQLite, serialized.
    // We already have schema from migration, but keeping this safe.
    // Note: If using Turso, we assume migration was done or this will create table if not exists.

    // Only run criticals if needed. For now, we trust the DB state or re-run create if not exists.
    // I'll leave the init logic but it's less critical now that we migrated.
    // Actually, let's keep it minimal or just expose db.
}

// Add init method
db.init = initDatabase;

module.exports = db;

