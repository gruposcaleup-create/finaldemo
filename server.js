const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./database');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const Stripe = require('stripe');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');

let stripe;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        maxNetworkRetries: 2,
        timeout: 10000,
    });
} else {
    console.warn("⚠️ STRIPE_SECRET_KEY missing. Payments will be disabled.");
}

// Email Sender (Resend API via HTTP to avoid SMTP port blocks)
async function sendEmail({ to, subject, html, text }) {
    if (!process.env.MAIL_PASS) {
        console.error(`[ERROR] EMAIL NOT SENT. Missing 'MAIL_PASS' (Resend API Key) in environment variables.`);
        // Fallback log for dev
        console.log(`[MOCK EMAIL Content] To: ${to}, Subject: ${subject}`);
        return;
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.MAIL_PASS}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: process.env.MAIL_FROM || 'onboarding@resend.dev',
                to: [to],
                subject: subject,
                html: html,
                text: text
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`Resend API Error: ${response.status} - ${errorData}`);
        } else {
            console.log(`Email sent to ${to}`);
        }
    } catch (err) {
        console.error("Email Network Error:", err);
    }
}

const app = express();
const PORT = process.env.PORT || 3000; // Puerto del servidor (Render injects PORT)
const APP_URL = process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:3000'; // Fallback order

// Log Email Config Status at Startup
console.log("--------------------------------------------------");
console.log("EMAIL SYSTEM CONFIGURATION:");
console.log(`MAIL_FROM: ${process.env.MAIL_FROM || 'MISSING (Defaults to onboarding@resend.dev)'}`);
console.log(`MAIL_PASS: ${process.env.MAIL_PASS ? 'SET (OK)' : 'MISSING (Emails will be MOCKED/NOT SENT)'}`);
console.log("--------------------------------------------------");

app.use(cors());

// FORCE NO-CACHE for all API routes to prevent sensitive data leakage (Vercel/CDN caching)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});

// app.options removed for Express 5 compatibility (cors middleware handles it)

// Health Check (No DB) - Proves server is running
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'running', env: process.env.NODE_ENV });
});

// Webhook endpoint needs raw body, so we define it BEFORE default parsers
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    if (!stripe) return res.status(503).send('Stripe not configured');
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const orderId = session.metadata.orderId;
        const userId = session.metadata.userId;
        console.log(`Pago confirmado para orden ${orderId}`);

        // Update order status in DB
        if (orderId) {
            const dbId = orderId.replace('order_', '');

            // 1. Mark Order as Paid
            db.run(`UPDATE orders SET status = 'paid' WHERE id = ?`, [dbId], (err) => {
                if (err) console.error("Error updating order status", err);
                else {
                    // 2. Retrieve Order Items to Enroll User
                    db.get(`SELECT items FROM orders WHERE id = ?`, [dbId], (err, row) => {
                        if (!err && row && row.items) {
                            try {
                                const items = JSON.parse(row.items);
                                items.forEach(item => {
                                    // Handle 'membership-annual' or specific courses
                                    if (item.id === 'membership-annual') {
                                        console.log(`[Enrollment] User ${userId} bought Annual Membership.`);
                                        // Create/Update Membership
                                        const startDate = new Date().toISOString();
                                        const endDate = new Date();
                                        endDate.setFullYear(endDate.getFullYear() + 1); // +1 Year

                                        db.run(`INSERT INTO memberships (userId, status, startDate, endDate, paymentId) VALUES (?, ?, ?, ?, ?)`,
                                            [userId, 'active', startDate, endDate.toISOString(), dbId],
                                            (errMem) => {
                                                if (errMem) console.error("Error creating membership", errMem);
                                                else console.log("Membership created for user", userId);
                                            }
                                        );
                                    } else {
                                        // Enroll in specific course
                                        const courseId = item.id;
                                        // Check if already enrolled
                                        db.get(`SELECT id FROM enrollments WHERE userId = ? AND courseId = ?`, [userId, courseId], (e, r) => {
                                            if (!r) {
                                                db.run(`INSERT INTO enrollments (userId, courseId, progress, totalHoursSpent) VALUES (?, ?, 0, 0)`,
                                                    [userId, courseId],
                                                    (errEnroll) => {
                                                        if (errEnroll) console.error(`[Enrollment] Failed for user ${userId} course ${courseId}`, errEnroll);
                                                        else console.log(`[Enrollment] Success for user ${userId} course ${courseId}`);
                                                    }
                                                );
                                            }
                                        });
                                    }
                                });
                            } catch (parseErr) {
                                console.error("[Enrollment] Error parsing order items", parseErr);
                            }
                        }
                    });
                }
            });
        }
    }

    res.json({ received: true });
});

app.use(bodyParser.json({ limit: '50mb' })); // Limit alto para uploads base64 si es necesario
app.use(bodyParser.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '.')));

// --- RUTAS DE API ---

// 0. HEALTH CHECK (DB Connection)
app.get('/api/db-check', (req, res) => {
    db.get('SELECT 1', [], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'ok', database: 'connected' });
    });
});

// 1. Auth: Registro
app.post('/api/auth/register', async (req, res) => {
    const { email, password, firstName, lastName } = req.body;
    console.log(`[AUTH] Registering new user: ${email}`);
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    try {
        const hash = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (email, password, firstName, lastName) VALUES (?, ?, ?, ?)`,
            [email, hash, firstName || '', lastName || ''],
            function (err) {
                if (err) {
                    console.error("[AUTH] Register Error:", err.message);
                    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'El email ya está registrado' });
                    return res.status(500).json({ error: err.message });
                }
                const newId = this.lastID;
                console.log(`[AUTH] Registered User ID: ${newId} (${email})`);

                // Send Welcome Email
                if (process.env.MAIL_USER) {
                    const { getWelcomeEmail } = require('./helpers/emailTemplates');
                    sendEmail({
                        to: email,
                        subject: '¡Bienvenido a la Comunidad!',
                        html: getWelcomeEmail(firstName || 'Estudiante')
                    });
                }

                res.json({ id: newId, email, firstName, lastName, role: 'user' });
            }
        );
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. Auth: Login
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    console.log(`[AUTH] Login attempt for: ${email}`);
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(401).json({ error: 'Credenciales inválidas' });

        if (row.status === 'blocked') return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada permanentemente. Contacta soporte.' });

        // Check Ban Status
        if (row.bannedUntil) {
            const banDate = new Date(row.bannedUntil);
            if (banDate > new Date()) {
                const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
                return res.status(403).json({
                    error: `Tu cuenta está suspendida temporalmente hasta el ${banDate.toLocaleDateString('es-ES', options)}.`
                });
            } else {
                // Ban expired, clear it (optional, but keeps DB clean)
                db.run('UPDATE users SET bannedUntil = NULL WHERE id = ?', [row.id]);
            }
        }

        try {
            // Check password (support old plain text for admin seed if needed, but better migrate)
            // If row.password doesn't start with $2b$, it might be legacy plain text (dev mode)
            let match = false;
            // Hack for pre-seeded plain text admin
            if (!row.password.startsWith('$2b$') && row.password === password) {
                match = true;
            } else {
                match = await bcrypt.compare(password, row.password);
            }

            if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });

            // En prod: retornar JWT. Aquí retornamos el user object simple.
            const { password: _, ...userWithoutPass } = row;

            // Check Membership Status
            db.get(`SELECT * FROM memberships WHERE userId = ? AND status = 'active' AND endDate > CURRENT_TIMESTAMP ORDER BY endDate DESC LIMIT 1`, [row.id], (mErr, membership) => {
                if (membership) userWithoutPass.membership = { active: true, endDate: membership.endDate };
                res.json(userWithoutPass);
            });

        } catch (e) { res.status(500).json({ error: e.message }); }
    });
});

// Store recovery codes in memory (Map: email -> { code, expires })
const recoveryCodes = new Map();

// 3. Auth: Recuperar Pass
app.post('/api/auth/recover', (req, res) => {
    const { email } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) {
            return res.json({ message: 'Si el correo existe, se enviaron instrucciones.' });
        }

        // Generate 6 digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 300000).toISOString(); // 5 mins

        db.run(`INSERT INTO password_resets (email, code, expiresAt) VALUES (?, ?, ?)`, [email, code, expiresAt], (err2) => {
            if (err2) console.error("Error saving reset code", err2);

            // Send Email
            if (process.env.MAIL_USER) {
                try {
                    const { getRecoveryEmail } = require('./helpers/emailTemplates');
                    sendEmail({
                        to: email,
                        subject: 'Recuperación de Contraseña',
                        html: getRecoveryEmail(code),
                        text: `Tu código de recuperación es: ${code}`
                    });
                } catch (e) { console.error("Mail error", e); }
            } else {
                console.log(`[MOCK EMAIL] To: ${email}, Code: ${code}`);
            }

            res.json({ message: 'Si el correo existe, se enviaron instrucciones.' });
        });
    });
});

app.post('/api/auth/reset', async (req, res) => {
    const { email, code, newPassword } = req.body;

    // Check code in DB
    db.get(`SELECT * FROM password_resets WHERE email = ? AND code = ? AND used = 0 AND expiresAt > CURRENT_TIMESTAMP ORDER BY createdAt DESC LIMIT 1`,
        [email, code], async (err, row) => {

            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(400).json({ error: 'Código inválido o expirado' });

            try {
                const hash = await bcrypt.hash(newPassword, 10);

                // Update password & Mark Used
                db.serialize(() => {
                    db.run('UPDATE users SET password = ? WHERE email = ?', [hash, email]);
                    db.run('UPDATE password_resets SET used = 1 WHERE id = ?', [row.id]);
                });

                res.json({ message: 'Contraseña restablecida correctamente.' });

            } catch (e) { res.status(500).json({ error: e.message }); }
        });
});

// Update Password (Authenticated)
app.put('/api/users/password', (req, res) => {
    const { email, currentPassword, newPassword } = req.body;

    // 1. Get User by Email
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });

        // 2. Compare Current Password with Hash
        const match = await bcrypt.compare(currentPassword, row.password);
        if (!match) return res.status(401).json({ error: 'La contraseña actual es incorrecta' });

        // 3. Hash New Password
        const newHash = await bcrypt.hash(newPassword, 10);

        // 4. Update
        db.run('UPDATE users SET password = ? WHERE email = ?', [newHash, email], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Contraseña actualizada' });
        });
    });
});

// 4. Cursos: Listar (Público) con Búsqueda y Filtros
app.get('/api/courses', (req, res) => {
    const { search, category, minPrice, maxPrice } = req.query;
    let query = "SELECT * FROM courses WHERE status = 'active'";
    let params = [];

    if (search) {
        query += " AND (LOWER(title) LIKE LOWER(?) OR LOWER(\"desc\") LIKE LOWER(?))";
        params.push(`%${search}%`, `%${search}%`);
    }

    if (category) {
        query += " AND LOWER(category) = LOWER(?)";
        params.push(category);
    }

    // Robust Price Logic: Handle numbers or "$10.00" strings
    const priceCol = "CAST(REPLACE(REPLACE(price, '$', ''), ',', '') AS REAL)";

    if (minPrice) {
        const min = parseFloat(minPrice);
        if (!isNaN(min)) {
            query += ` AND ${priceCol} >= ?`;
            params.push(min);
        }
    }

    if (maxPrice) {
        const max = parseFloat(maxPrice);
        if (!isNaN(max)) {
            query += ` AND ${priceCol} <= ?`;
            params.push(max);
        }
    }

    const { sort } = req.query;
    if (sort === 'price_asc') {
        query += ` ORDER BY ${priceCol} ASC`;
    } else if (sort === 'price_desc') {
        query += ` ORDER BY ${priceCol} DESC`;
    } else if (sort === 'newest') {
        query += " ORDER BY id DESC";
    } else {
        query += " ORDER BY id DESC";
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const courses = rows.map(c => {
            let modules = [];
            try {
                modules = c.modulesData ? JSON.parse(c.modulesData) : [];
            } catch (e) {
                console.error(`Error parsing modules for course ${c.id}:`, e.message);
            }
            return { ...c, modules };
        });
        res.json(courses);
    });
});

// Get Single Course (Public)
app.get('/api/courses/:id', (req, res) => {
    db.get('SELECT * FROM courses WHERE id = ?', [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Curso no encontrado' });

        try {
            row.modules = row.modulesData ? JSON.parse(row.modulesData) : [];
        } catch (e) {
            console.error(`Error parsing modules for course ${row.id}:`, e.message);
            row.modules = [];
        }
        res.json(row);
    });
});

// Admin: Get All Courses (incluido inactivos)
app.get('/api/admin/courses', (req, res) => {
    db.all(`SELECT * FROM courses`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const courses = rows.map(c => {
            let modules = [];
            try {
                modules = c.modulesData ? JSON.parse(c.modulesData) : [];
            } catch (e) {
                console.error(`Error parsing modules for course ${c.id}:`, e.message);
            }
            return { ...c, modules };
        });
        res.json(courses);
    });
});

// Admin: Crear Curso
app.post('/api/courses', (req, res) => {
    const { title, desc, price, priceOffer, image, videoPromo, category, duration, modules } = req.body;
    db.run(`INSERT INTO courses (title, desc, price, priceOffer, image, videoPromo, category, duration, modulesData, modulesCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, desc, price, priceOffer, image, videoPromo, category, duration, JSON.stringify(modules || []), (modules || []).length],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, success: true });
        });
});

// Admin: Editar Curso
app.put('/api/courses/:id', (req, res) => {
    const { title, desc, price, priceOffer, image, videoPromo, category, duration, modules, status } = req.body;
    const courseId = req.params.id;

    // Build dynamic query to update only provided fields
    let fields = [];
    let values = [];

    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (desc !== undefined) { fields.push('desc = ?'); values.push(desc); }
    if (price !== undefined) { fields.push('price = ?'); values.push(price); }
    if (priceOffer !== undefined) { fields.push('priceOffer = ?'); values.push(priceOffer); }
    if (image !== undefined) { fields.push('image = ?'); values.push(image); }
    if (image !== undefined) { fields.push('image = ?'); values.push(image); }
    if (videoPromo !== undefined) { fields.push('videoPromo = ?'); values.push(videoPromo); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (duration !== undefined) { fields.push('duration = ?'); values.push(duration); }
    if (modules !== undefined) {
        fields.push('modulesData = ?');
        values.push(JSON.stringify(modules));
        fields.push('modulesCount = ?');
        values.push(modules.length);
    }
    if (status !== undefined) { fields.push('status = ?'); values.push(status); }

    if (fields.length === 0) return res.json({ success: true, message: 'Nothing to update' });

    values.push(courseId);

    db.run(`UPDATE courses SET ${fields.join(', ')} WHERE id = ?`, values, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Admin: Eliminar Curso
app.delete('/api/courses/:id', (req, res) => {
    db.run(`DELETE FROM courses WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Curso eliminado' });
    });
});


// 5. Categorías
// Usamos el endpoint basado en tabla 'categories' definido más abajo.
// Esta versión anterior se comenta/elimina para evitar conflictos.
// app.get('/api/categories', ...);


// 6. Ordenes & Stripe Checkout
app.post('/api/checkout/session', async (req, res) => {
    if (!stripe) return res.status(503).json({ error: 'Pagos deshabilitados por falta de configuración (Stripe Key missing)' });

    try {
        const { items, userId, couponCode } = req.body; // items: [{ id: productId, qty: 1 }]

        if (!items || items.length === 0) return res.status(400).json({ error: 'Carrito vacío' });

        // 1. Validate Coupon
        let discountMultiplier = 1;
        if (couponCode) {
            const coupon = await new Promise((resolve) => {
                db.get("SELECT * FROM coupons WHERE code = ? AND status = 'active'", [couponCode], (err, row) => resolve(row));
            });
            if (coupon) {
                // Apply discount (e.g. 10% -> 0.9 multiplier)
                discountMultiplier = 1 - (coupon.discount / 100);
            }
        }

        // 2. Build Stripe Items
        const promises = items.map(async (item) => {
            let product, price;

            // ... inside map ...
            if (item.id === 'membership-annual') {
                // Get price from settings
                const settings = await new Promise(resolve => {
                    db.all("SELECT * FROM settings", [], (err, rows) => {
                        const s = {}; rows.forEach(r => s[r.key] = r.value);
                        resolve(s);
                    });
                });
                const rawPrice = settings['membership_price_offer'] || settings['membership_price'] || 999;
                price = parseFloat(rawPrice);
                product = { title: 'Membresía Anual (Todo Incluido)', image: 'https://placehold.co/600x400?text=VIP' };
                console.log(`[Checkout] Membership Base Price: ${price} (Raw: ${rawPrice})`);
            } else {
                // Get from DB
                product = await new Promise((resolve, reject) => {
                    db.get("SELECT * FROM courses WHERE id = ?", [item.id], (err, row) => {
                        if (err || !row) resolve(null); else resolve(row);
                    });
                });
                if (!product) throw new Error(`Producto ${item.id} no encontrado`);
                price = product.priceOffer || product.price;
            }

            const finalPrice = price * discountMultiplier;
            const unitAmount = Math.round(finalPrice * 100);

            console.log(`[Checkout] Item: ${product.title}, Base: ${price}, DiscountMult: ${discountMultiplier}, Final: ${finalPrice}, UnitAmount: ${unitAmount}`);

            return {
                price_data: {
                    currency: 'mxn',
                    product_data: {
                        name: product.title + (discountMultiplier < 1 ? ` (Desc. ${couponCode} -${Math.round((1 - discountMultiplier) * 100)}%)` : ''),
                        images: product.image ? [product.image] : [],
                    },
                    unit_amount: unitAmount,
                },
                quantity: item.qty,
            };
        });

        const stripeItems = await Promise.all(promises);

        // Debug Log
        console.log(`[Checkout] Creating session. User: ${userId}, Coupon: ${couponCode || 'None'}`);
        stripeItems.forEach(i => {
            console.log(` - Item: ${i.price_data.product_data.name}, Unit Amount: ${i.price_data.unit_amount}, Qty: ${i.quantity}`);
        });

        const totalAmount = stripeItems.reduce((acc, item) => acc + (item.price_data.unit_amount * item.quantity) / 100, 0);
        console.log('[Checkout] Total calculated:', totalAmount);

        // 3. Create Order in DB
        console.log('[Checkout] Inserting order into DB...');
        const orderId = await new Promise((resolve, reject) => {
            db.run(`INSERT INTO orders (userId, total, items, status) VALUES (?, ?, ?, ?)`,
                [userId || 0, totalAmount, JSON.stringify(items), 'pending'],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        console.log('[Checkout] Order created in DB:', orderId);

        const dbOrderId = `order_${orderId}`;

        // TEST: HARDCODED PAYLOAD to verify if data is the issue
        // SANITIZATION: Clean data to prevent Stripe hang
        const cleanStripeItems = stripeItems.map(item => {
            // Ensure unit amount is an integer
            let amount = parseInt(item.price_data.unit_amount);
            if (isNaN(amount) || amount < 0) amount = 0;

            // Ensure quantity is positive integer
            let qty = parseInt(item.quantity);
            if (isNaN(qty) || qty < 1) qty = 1;

            // Ensure images are valid URLs or empty array
            let images = item.price_data.product_data.images || [];
            if (!Array.isArray(images)) images = [];
            images = images.filter(url => url && typeof url === 'string' && url.startsWith('http'));

            return {
                price_data: {
                    currency: 'mxn',
                    product_data: {
                        name: String(item.price_data.product_data.name || 'Producto sin nombre').substring(0, 150),
                        images: images
                    },
                    unit_amount: amount,
                },
                quantity: qty,
            };
        });
        console.log('[Checkout] Payload Sanitized. Item Count:', cleanStripeItems.length);

        // Force timeout wrapper - Server Side Protection
        const session = await Promise.race([
            stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: cleanStripeItems,
                mode: 'payment',
                success_url: `${APP_URL}/panel.html?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${APP_URL}/cart.html?canceled=true`,
                metadata: {
                    orderId: dbOrderId,
                    userId: userId ? userId.toString() : 'guest',
                    coupon: couponCode || ''
                },
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Stripe API Timeout (12s Server Limit)')), 12000))
        ]);
        console.log('[Checkout] Stripe session URL:', session.url);

        res.json({ url: session.url });
    } catch (err) {
        console.error("Stripe Checkout Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 6.5 Verify Session & Force Enrollment (Fallback)
app.post('/api/checkout/verify-session', async (req, res) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Session ID required' });

        // Retrieve session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        if (session.payment_status === 'paid') {
            const orderId = session.metadata.orderId; // e.g. "order_123"
            const userId = session.metadata.userId;
            const dbId = orderId.replace('order_', '');

            console.log(`[Verify] Verifying order ${dbId} for user ${userId}`);

            // Update Status Forcefully
            db.run(`UPDATE orders SET status = 'paid' WHERE id = ?`, [dbId], (err) => {
                if (err) console.error("[Verify] Error updating order", err);

                // Enroll Logic (Idempotent)
                db.get(`SELECT items FROM orders WHERE id = ?`, [dbId], (err, row) => {
                    if (!err && row && row.items) {
                        try {
                            const items = JSON.parse(row.items);
                            items.forEach(item => {
                                if (item.id === 'membership-annual') {
                                    // Handle membership logic if needed here (usually webhook handles it better, but good fallback)
                                    // We can duplicate the webhook logic here for immediate access if webhook is slow
                                    const startDate = new Date().toISOString();
                                    const endDate = new Date();
                                    endDate.setFullYear(endDate.getFullYear() + 1);
                                    db.run(`INSERT INTO memberships (userId, status, startDate, endDate, paymentId) VALUES (?, ?, ?, ?, ?)`,
                                        [userId, 'active', startDate, endDate.toISOString(), dbId], (e) => { if (e) console.error(e); });
                                } else {
                                    const courseId = item.id;
                                    db.get(`SELECT id FROM enrollments WHERE userId = ? AND courseId = ?`, [userId, courseId], (e, r) => {
                                        if (!r) {
                                            db.run(`INSERT INTO enrollments (userId, courseId, progress, totalHoursSpent) VALUES (?, ?, 0, 0)`,
                                                [userId, courseId],
                                                (errEnroll) => {
                                                    if (errEnroll) console.error("[Verify] Enrollment failed", errEnroll);
                                                }
                                            );
                                        }
                                    });
                                }
                            });
                        } catch (e) {
                            console.error("[Verify] Item parse error", e);
                        }
                    }
                });
            });

            // CRITICAL FIX: Return user data to restore session in frontend
            db.get(`SELECT * FROM users WHERE id = ?`, [userId], (err, user) => {
                if (err || !user) {
                    // Fallback if user not found (should not happen)
                    return res.json({ success: true, status: 'paid', user: null });
                }
                const { password, ...userWithoutPass } = user;

                // Check membership for the returned user object
                db.get(`SELECT * FROM memberships WHERE userId = ? AND status = 'active' AND endDate > CURRENT_TIMESTAMP ORDER BY endDate DESC LIMIT 1`, [user.id], (mErr, membership) => {
                    if (membership) userWithoutPass.membership = { active: true, endDate: membership.endDate };
                    res.json({ success: true, status: 'paid', user: userWithoutPass });
                });
            });

        } else {
            return res.json({ success: false, status: session.payment_status });
        }
    } catch (err) {
        console.error("Verify Error:", err);
        res.status(500).json({ error: err.message });
    }
});
// Legacy simple order creation kept for non-stripe tests if needed, but endpoint overwrites are tricky.
// Let's modify the old api/orders to be just for admin manual usage or manual confirmation if needed, 
// OR just leave it as is if it doesn't conflict. 
// Actually, let's keep the old endpoint but maybe rename logic or assume frontend calls checkout now.
// For now, I'll add the checkout endpoint separately.


app.get('/api/orders', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'User ID required' });

    db.all(`SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items || '[]') })));
    });
});

app.delete('/api/orders/:id', (req, res) => {
    db.run(`DELETE FROM orders WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Orden eliminada' });
    });
});

// 7. Cupones
app.get('/api/coupons', (req, res) => {
    db.all(`SELECT * FROM coupons`, [], (err, rows) => res.json(rows));
});
app.post('/api/coupons', (req, res) => {
    const { code, discount } = req.body;
    db.run(`INSERT INTO coupons (code, discount) VALUES (?, ?)`, [code, discount], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, code, discount });
    });
});
app.delete('/api/coupons/:id', (req, res) => {
    db.run(`DELETE FROM coupons WHERE id = ?`, [req.params.id], (err) => res.json({ success: true }));
});

// Categories
app.get('/api/categories', (req, res) => {
    db.all(`SELECT name FROM categories UNION SELECT DISTINCT category as name FROM courses WHERE category IS NOT NULL AND category != ''`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows.map(r => r.name));
    });
});
app.post('/api/categories', (req, res) => {
    const { name } = req.body;
    db.run(`INSERT OR IGNORE INTO categories (name) VALUES (?)`, [name], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});
app.delete('/api/categories/:name', (req, res) => {
    db.run(`DELETE FROM categories WHERE name = ?`, [req.params.name], (err) => res.json({ success: true }));
});

app.post('/api/coupons/validate', (req, res) => {
    const { code } = req.body;
    db.get("SELECT * FROM coupons WHERE code = ? AND status = 'active'", [code], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ valid: false, message: 'Cupón no válido' });
        res.json({ valid: true, code: row.code, discount: row.discount });
    });
});


// 8. Recursos
app.post('/api/resources', (req, res) => {
    const { name, type, dataUrl, description, access } = req.body;
    db.run(`INSERT INTO resources (name, type, dataUrl, description, access) VALUES (?, ?, ?, ?, ?)`,
        [name, type, dataUrl, description || '', access || 'public'],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, success: true });
        });
});

app.get('/api/resources', (req, res) => {
    // Admin gets all, but usually user interface filters by 'public'.
    // We can add a query param ?access=public
    const access = req.query.access;
    let sql = `SELECT id, name, type, description, createdAt, access FROM resources ORDER BY createdAt DESC`;
    let params = [];

    if (access) {
        sql = `SELECT id, name, type, description, createdAt, access FROM resources WHERE access = ? ORDER BY createdAt DESC`;
        params.push(access);
    }

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const processed = rows.map(r => ({ ...r, url: `/api/resources/${r.id}/download` }));
        res.json(processed);
    });
});
// Download Resource CORRECTED
app.get('/api/resources/:id/download', (req, res) => {
    db.get(`SELECT * FROM resources WHERE id = ?`, [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Resource not found' });

        try {
            // dataUrl format: "data:application/pdf;base64,JVBERi0xLjQK..."
            const matches = row.dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

            if (!matches || matches.length !== 3) {
                return res.status(500).json({ error: 'Invalid file format stored' });
            }

            const type = matches[1];
            const buffer = Buffer.from(matches[2], 'base64');

            res.setHeader('Content-Type', type);
            // Content-Disposition: attachment triggers download. Inline opens in browser.
            // Using attachment to force download as requested.
            // Encoding filename to handle special chars
            const filename = encodeURIComponent(row.name);
            res.setHeader('Content-Disposition', `attachment; filename="${row.name}"; filename*=UTF-8''${filename}`);

            res.send(buffer);

        } catch (e) {
            console.error("Download Error:", e);
            res.status(500).json({ error: 'Error processing file' });
        }
    });
});

app.delete('/api/resources/:id', (req, res) => {
    db.run(`DELETE FROM resources WHERE id = ?`, [req.params.id], (err) => res.json({ success: true }));
});

// Settings API
app.get('/api/settings', (req, res) => {
    db.all(`SELECT * FROM settings`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    });
});

app.post('/api/settings', (req, res) => {
    const { settings } = req.body; // { key: value, ... }
    if (!settings) return res.status(400).json({ error: 'Settings required' });

    db.serialize(() => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
        for (const [key, value] of Object.entries(settings)) {
            stmt.run(key, String(value));
        }
        stmt.finalize();
        res.json({ success: true });
    });
});


// 9. Usuarios (Admin)
// 9. Usuarios (Admin)
// 9. Usuarios (Admin)
app.get('/api/users', (req, res) => {
    db.all(`SELECT id, email, firstName, lastName, role, status, createdAt FROM users`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Parallelize fetching extra data
        const pOrders = new Promise((resolve) => {
            db.all(`SELECT userId, total FROM orders WHERE status = 'paid'`, [], (err, res) => resolve(res || []));
        });

        const pEnrollments = new Promise((resolve) => {
            db.all(`SELECT userId, COUNT(*) as count FROM enrollments GROUP BY userId`, [], (err, res) => resolve(res || []));
        });

        const pList = new Promise((resolve) => {
            db.all(`SELECT e.userId, e.courseId, e.progress, e.completedLessons, c.title, c.modulesData 
                    FROM enrollments e 
                    JOIN courses c ON e.courseId = c.id`, [], (err, res) => resolve(res || []));
        });

        Promise.all([pOrders, pEnrollments, pList]).then(([orders, enrollmentCounts, enrollmentList]) => {
            const users = rows.map(u => {
                const spent = orders.filter(o => o.userId === u.id).reduce((acc, o) => acc + o.total, 0);
                const enrollCount = enrollmentCounts.find(e => e.userId === u.id);
                // Calculate dynamic progress for each course
                const userCourses = enrollmentList.filter(e => e.userId === u.id).map(e => {
                    // Calculate Progress
                    const completed = e.completedLessons ? JSON.parse(e.completedLessons) : [];
                    let modules = [];
                    try { modules = e.modulesData ? JSON.parse(e.modulesData) : []; } catch (err) { }
                    let totalLessons = 0;
                    if (modules && Array.isArray(modules)) {
                        modules.forEach(m => totalLessons += (m.lessons ? m.lessons.length : 0));
                    }
                    const dynamicProgress = totalLessons > 0 ? Math.round((completed.length / totalLessons) * 100) : 0;

                    return { ...e, progress: dynamicProgress };
                });

                return { ...u, spent, courses: userCourses };
            });
            res.json(users);
        });
    });
});
// Get User Enrollments (Admin Modal)
app.get('/api/users/:id/enrollments', (req, res) => {
    db.all(`SELECT e.*, c.title, c.image 
            FROM enrollments e 
            JOIN courses c ON e.courseId = c.id 
            WHERE e.userId = ?`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update Enrollment Status (Pause/Resume)
app.put('/api/users/:uid/enrollments/:cid/status', (req, res) => {
    const { uid, cid } = req.params;
    const { status } = req.body; // 'active' or 'paused'
    db.run(`UPDATE enrollments SET status = ? WHERE userId = ? AND courseId = ?`, [status, uid, cid], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Admin: Remove User Enrollment (Delete)
app.delete('/api/users/:uid/enrollments/:cid', (req, res) => {
    const { uid, cid } = req.params;
    db.run(`DELETE FROM enrollments WHERE userId = ? AND courseId = ?`, [uid, cid], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Update User Ban Status (Temporary)
app.post('/api/users/:id/ban', (req, res) => {
    const { bannedUntil } = req.body; // ISO String or null
    db.run(`UPDATE users SET bannedUntil = ? WHERE id = ?`, [bannedUntil, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Update User Status
app.put('/api/users/:id/status', (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE users SET status = ? WHERE id = ?`, [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Update User Role (Admin)
app.put('/api/users/:id/role', (req, res) => {
    const { role } = req.body;
    const validRoles = ['user', 'admin', 'editor'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Rol inválido' });

    db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Update User Password (Admin)
app.put('/api/users/:id/password-force', async (req, res) => {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Contraseña requerida (min 6 chars)' });

    try {
        const hash = await bcrypt.hash(password, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [hash, req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/users/:id', (req, res) => {
    db.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Create User (Admin)
app.post('/api/users', async (req, res) => {
    const { email, password, firstName, lastName, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    try {
        const hash = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (email, password, firstName, lastName, role) VALUES (?, ?, ?, ?, ?)`,
            [email, hash, firstName || '', lastName || '', role || 'user'],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'El email ya está registrado' });
                    return res.status(500).json({ error: err.message });
                }
                res.json({ id: this.lastID, email, role: role || 'user' });
            }
        );
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update User Role (Admin)
app.put('/api/users/:id/role', (req, res) => {
    const { role } = req.body;
    const validRoles = ['user', 'admin', 'editor'];
    if (!validRoles.includes(role)) return res.status(400).json({ error: 'Rol inválido' });

    db.run(`UPDATE users SET role = ? WHERE id = ?`, [role, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});


// 10. Admin: Assign Membership Manually
app.post('/api/admin/users/:userId/membership', (req, res) => {
    const { userId } = req.params;
    // Activate for 1 year
    const startDate = new Date().toISOString();
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1);

    db.run(`INSERT INTO memberships (userId, status, startDate, endDate, paymentId) VALUES (?, ?, ?, ?, ?)`,
        [userId, 'active', startDate, endDate.toISOString(), 'manual_admin'],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Membresía asignada manualmente' });
        }
    );
});

// 10. Dashboard & My Courses
app.get('/api/my-courses', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'UserId required' });

    // Join enrollments with courses
    const query = `
        SELECT e.*, c.title, c.image, c.desc, c.duration, c.modulesData 
        FROM enrollments e
        JOIN courses c ON e.courseId = c.id
        WHERE e.userId = ?
    `;

    db.all(query, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const courses = rows.map(r => {
            const modules = r.modulesData ? JSON.parse(r.modulesData) : [];
            const completedLessons = r.completedLessons ? JSON.parse(r.completedLessons) : [];

            // Calculate dynamic progress
            let totalLessons = 0;
            if (modules && Array.isArray(modules)) {
                modules.forEach(m => totalLessons += (m.lessons ? m.lessons.length : 0));
            }
            const dynamicProgress = totalLessons > 0 ? Math.round((completedLessons.length / totalLessons) * 100) : 0;

            return {
                id: r.courseId,
                name: r.title,
                image: r.image,
                description: r.desc,
                duration: r.duration,
                progress: dynamicProgress, // Use dynamic progress
                lastAccess: r.lastAccess,
                modules: modules,
                completedLessons: completedLessons
            };
        });

        res.json({ courses });
    });
});

// 11. Admin Metrics
app.get('/api/admin/metrics', (req, res) => {
    const metrics = {};

    db.parallelize(() => {
        // 1. Total Revenue
        db.get(`SELECT SUM(total) as revenue FROM orders WHERE status = 'paid'`, (err, row) => {
            metrics.revenue = row ? row.revenue || 0 : 0;
        });

        // 2. Total Students (Role user)
        db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'user'`, (err, row) => {
            metrics.students = row ? row.count : 0;
        });

        // 3. Active Courses
        db.get(`SELECT COUNT(*) as count FROM courses WHERE status = 'active'`, (err, row) => {
            metrics.activeCourses = row ? row.count : 0;

            // 4. Monthly Revenue (Current Year)
            db.all(`SELECT total, createdAt FROM orders WHERE status = 'paid'`, (err, rows) => {
                const monthly = new Array(12).fill(0);
                const currentYear = new Date().getFullYear();

                rows.forEach(r => {
                    const d = new Date(r.createdAt);
                    if (d.getFullYear() === currentYear) {
                        monthly[d.getMonth()] += r.total;
                    }
                });
                metrics.monthlyRevenue = monthly;

                // 5. Recent Sales (Last 5)
                db.all(`
                    SELECT o.id, o.total, o.createdAt, u.firstName, u.lastName, u.email 
                    FROM orders o 
                    JOIN users u ON o.userId = u.id 
                    WHERE o.status = 'paid'
                    ORDER BY o.createdAt DESC 
                    LIMIT 5
                `, (err, rows) => {
                    metrics.recentSales = rows || [];
                    res.json(metrics);
                });
            });
        });
    });
});



// 12. Save Progress (Use Existing Dynamic SQL Version below)
// Duplicate removed.

app.get('/api/dashboard', (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: 'UserId required' });

    // 1. Stats: Completed courses & Total hours (simulated logic for hours if not tracked strictly)
    db.all(`SELECT * FROM enrollments WHERE userId = ?`, [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const completed = rows.filter(r => r.progress >= 100).length;
        const totalHours = rows.reduce((acc, r) => acc + (r.totalHoursSpent || 0), 0);

        // 2. Last continued course (most recent lastAccess)
        // Sort by lastAccess desc
        const sorted = rows.sort((a, b) => new Date(b.lastAccess) - new Date(a.lastAccess));
        const lastEnrollment = sorted[0];

        let lastCourse = null;
        if (lastEnrollment) {
            db.get(`SELECT title, image FROM courses WHERE id = ?`, [lastEnrollment.courseId], (err2, course) => {
                if (course) {
                    lastCourse = {
                        id: lastEnrollment.courseId,
                        title: course.title,
                        image: course.image,
                        progress: lastEnrollment.progress
                    };
                }
                res.json({
                    stats: { completed, totalHours },
                    lastCourse
                });
            });
        } else {
            res.json({
                stats: { completed, totalHours },
                lastCourse: null
            });
        }
    });
});

app.post('/api/progress', (req, res) => {
    const { userId, courseId, progress, hoursToAdd, completedLessons } = req.body;

    // Update progress
    // If progress is provided, update it (if greater than current? optional logic, stick to overwrite for now or max)
    // Update lastAccess = NOW
    // Add hoursToAdd
    // Update completedLessons if provided

    let sql = `UPDATE enrollments SET lastAccess = CURRENT_TIMESTAMP`;
    const params = [];

    if (progress !== undefined) {
        sql += `, progress = ?`;
        params.push(progress);
    }

    if (hoursToAdd) {
        sql += `, totalHoursSpent = totalHoursSpent + ?`;
        params.push(hoursToAdd);
    }

    if (completedLessons) {
        sql += `, completedLessons = ?`;
        params.push(JSON.stringify(completedLessons));
    }

    sql += ` WHERE userId = ? AND courseId = ?`;
    params.push(userId, courseId);

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});



// 10. Comentarios (Admin & User)
app.get('/api/comments', (req, res) => {
    const { courseId, lessonId } = req.query;
    db.all(`SELECT c.*, u.firstName, u.lastName, u.email, u.role as userRole 
            FROM comments c 
            JOIN users u ON c.userId = u.id 
            WHERE c.courseId = ? AND c.lessonId = ? 
            ORDER BY c.createdAt ASC`, [courseId, lessonId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // Organize comments into parent-child structure
        const parentComments = rows.filter(c => !c.parentId);
        const childComments = rows.filter(c => c.parentId);

        // Attach replies to their parents
        const commentsWithReplies = parentComments.map(parent => ({
            ...parent,
            replies: childComments.filter(child => child.parentId === parent.id)
        }));

        res.json(commentsWithReplies);
    });
});

app.post('/api/comments', (req, res) => {
    const { userId, courseId, lessonId, content, parentId } = req.body;

    // Get user role first to cache it
    db.get(`SELECT role FROM users WHERE id = ?`, [userId], (err, user) => {
        if (err || !user) return res.status(500).json({ error: 'User not found' });

        const userRole = user.role;

        db.run(`INSERT INTO comments (userId, courseId, lessonId, content, parentId, userRole) VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, courseId, lessonId, content, parentId || null, userRole], function (err) {
                if (err) return res.status(500).json({ error: err.message });

                // Return full comment data with user info so frontend can display immediately
                db.get(`SELECT c.*, u.firstName, u.lastName, u.role as userRole FROM comments c 
                        JOIN users u ON c.userId = u.id 
                        WHERE c.id = ?`, [this.lastID], (err, row) => {
                    res.json(row);
                });
            });
    });
});

// Admin: Get All Comments
app.get('/api/admin/comments', (req, res) => {
    db.all(`SELECT c.*, u.firstName, u.lastName, u.email, u.role as userRole, co.title as courseTitle 
            FROM comments c 
            LEFT JOIN users u ON c.userId = u.id 
            LEFT JOIN courses co ON c.courseId = co.id 
            WHERE c.parentId IS NULL
            ORDER BY c.createdAt DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        // For each parent comment, get its replies
        const commentIds = rows.map(r => r.id);
        if (commentIds.length === 0) return res.json([]);

        const placeholders = commentIds.map(() => '?').join(',');
        db.all(`SELECT c.*, u.firstName, u.lastName, u.email, u.role as userRole 
                FROM comments c 
                LEFT JOIN users u ON c.userId = u.id 
                WHERE c.parentId IN (${placeholders})`, commentIds, (err, replies) => {
            if (err) return res.status(500).json({ error: err.message });

            // Attach replies to their parents
            const commentsWithReplies = rows.map(parent => ({
                ...parent,
                replies: replies.filter(reply => reply.parentId === parent.id)
            }));

            res.json(commentsWithReplies);
        });
    });
});

// Admin: Delete Comment
app.delete('/api/comments/:id', (req, res) => {
    db.run(`DELETE FROM comments WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Comentario eliminado' });
    });
});


// Start
// Global Error Handlers (Prevent Crash in Prod)
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en el puerto ${PORT}`);
        console.log(`URL de la aplicación: ${APP_URL}`);
    });
}

module.exports = app;
