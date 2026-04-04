export const scenarios = [
  {
    id: "duplicate-orders",
    title: "Checkout Bug",
    company: "E-commerce Platform",
    description: "Orders are duplicating in production. Customers are being charged twice.",
    difficulty: "Mid-level",
    timeLimit: 40 * 60,
    files: {
      "routes/orders.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/orders
router.post('/', async (req, res) => {
  const { userId, items, total } = req.body;

  try {
    const user = await db.users.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const order = await db.orders.create({
      userId, items, total,
      status: 'pending',
      createdAt: new Date()
    });

    const payment = await processPayment(user, total);
    await db.orders.update(order.id, { status: 'confirmed' });

    res.json({ success: true, orderId: order.id });

  } catch (err) {
    // If payment fails, retry once
    console.error('Order failed, retrying...', err);
    const order = await db.orders.create({
      userId, items, total,
      status: 'pending',
      createdAt: new Date()
    });
    await processPayment(user, total);
    await db.orders.update(order.id, { status: 'confirmed' });
    res.json({ success: true, orderId: order.id });
  }
});

async function processPayment(user, total) {
  return await paymentGateway.charge(user.paymentMethod, total);
}

module.exports = router;`,

      "routes/orders.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/orders
// Idempotency: callers should include a unique idempotency key per checkout
// session so a retry from the client reuses the existing order instead of
// creating a new one.
router.post('/', async (req, res) => {
  const { userId, items, total } = req.body;

  try {
    const user = await db.users.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const order = await db.orders.create({
      userId, items, total,
      status: 'pending',
      createdAt: new Date()
    });

    await processPayment(user, total);
    await db.orders.update(order.id, { status: 'confirmed' });

    res.json({ success: true, orderId: order.id });

  } catch (err) {
    // Do NOT retry here — retrying payment in the catch block creates a
    // second order and double-charges the customer.
    console.error('Order failed:', err);
    res.status(500).json({ error: 'Payment failed. Please try again.' });
  }
});

async function processPayment(user, total) {
  return await paymentGateway.charge(user.paymentMethod, total);
}

module.exports = router;`,

      "db/index.js": `// Database abstraction layer
const orders = {
  async create(data) {
    return await pool.query(
      'INSERT INTO orders (user_id, items, total, status, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [data.userId, JSON.stringify(data.items), data.total, data.status, data.createdAt]
    );
  },
  async findOne(query) {
    const keys = Object.keys(query);
    const where = keys.map((k, i) => \`\${k} = $\${i + 1}\`).join(' AND ');
    return await pool.query(\`SELECT * FROM orders WHERE \${where} LIMIT 1\`, Object.values(query));
  },
  async update(id, data) {
    const keys = Object.keys(data);
    const set = keys.map((k, i) => \`\${k} = $\${i + 2}\`).join(', ');
    return await pool.query(\`UPDATE orders SET \${set} WHERE id = $1\`, [id, ...Object.values(data)]);
  }
};

module.exports = { orders, users };`,

      "middleware/auth.js": `const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};`,
    },
    bugLocation: "routes/orders.js",
    bugLine: 28,
    bugExplanation: "The catch block silently creates a second order and retries payment instead of returning an error. Any network hiccup on the payment call creates a duplicate order and charges the customer twice.",
    fixSummary: "Remove the retry logic from the catch block. Return an error to the client instead. Add idempotency key checking at the top of the handler.",
  },

  {
    id: "race-condition",
    title: "Inventory Oversell",
    company: "Flash Sale Platform",
    description: "Products are selling below zero stock. Customers are getting order confirmations for out-of-stock items.",
    difficulty: "Senior",
    timeLimit: 40 * 60,
    files: {
      "services/inventory.js": `const { pool } = require('../db/pool');

// Reserve stock for a purchase. Returns true if reservation succeeded.
async function reserveStock(productId, quantity) {
  const result = await pool.query(
    'SELECT stock FROM products WHERE id = $1',
    [productId]
  );

  const product = result.rows[0];
  if (!product) throw new Error('Product not found');

  if (product.stock < quantity) {
    return false; // Not enough stock
  }

  // Decrement stock
  await pool.query(
    'UPDATE products SET stock = stock - $1 WHERE id = $2',
    [quantity, productId]
  );

  return true;
}

async function releaseStock(productId, quantity) {
  await pool.query(
    'UPDATE products SET stock = stock + $1 WHERE id = $2',
    [quantity, productId]
  );
}

module.exports = { reserveStock, releaseStock };`,

      "services/inventory.js.fixed.js": `const { pool } = require('../db/pool');

// Reserve stock for a purchase inside a transaction with row-level locking.
// SELECT ... FOR UPDATE prevents concurrent reads from seeing stale stock
// until the transaction commits, eliminating the check-then-act race.
async function reserveStock(productId, quantity) {
  return await pool.transaction(async (client) => {
    const result = await client.query(
      'SELECT stock FROM products WHERE id = $1 FOR UPDATE',
      [productId]
    );

    const product = result.rows[0];
    if (!product) throw new Error('Product not found');

    if (product.stock < quantity) {
      return false; // Not enough stock
    }

    await client.query(
      'UPDATE products SET stock = stock - $1 WHERE id = $2',
      [quantity, productId]
    );

    return true;
  });
}

async function releaseStock(productId, quantity) {
  await pool.query(
    'UPDATE products SET stock = stock + $1 WHERE id = $2',
    [quantity, productId]
  );
}

module.exports = { reserveStock, releaseStock };`,

      "db/pool.js": `const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Wraps a function in a BEGIN/COMMIT transaction.
// Rolls back automatically on error.
pool.transaction = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool };`,

      "middleware/validate.js": `// Validates purchase request body before it reaches the route handler.
module.exports = (req, res, next) => {
  const { productId, quantity, userId } = req.body;

  if (!productId || typeof productId !== 'string') {
    return res.status(400).json({ error: 'productId is required' });
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'quantity must be a positive integer' });
  }
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }

  next();
};`,
    },
    bugLocation: "services/inventory.js",
    bugLine: 13,
    bugExplanation: "reserveStock() reads the stock count and then updates it in two separate queries with no locking. Under concurrent load, two requests can both read the same stock value, both pass the 'stock >= quantity' check, and both decrement — driving stock negative and overselling the product.",
    fixSummary: "Wrap the read and update in a database transaction and use SELECT ... FOR UPDATE to lock the row. This prevents any other transaction from reading the stock until the current one commits, making the check-then-act atomic.",
  },

  {
    id: "n-plus-one",
    title: "Slow Dashboard",
    company: "SaaS Analytics Co",
    description: "The admin dashboard API times out under load. Response time grows linearly with the number of users.",
    difficulty: "Mid-level",
    timeLimit: 35 * 60,
    files: {
      "routes/dashboard.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/dashboard
// Returns all active users with their recent orders.
router.get('/', auth, async (req, res) => {
  try {
    const users = await db.query(
      'SELECT id, name, email, created_at FROM users WHERE active = true'
    );

    const result = [];
    for (const user of users.rows) {
      const orders = await db.query(
        'SELECT id, total, status, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
        [user.id]
      );
      result.push({ ...user, recentOrders: orders.rows });
    }

    res.json(result);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;`,

      "routes/dashboard.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// GET /api/dashboard
// Returns all active users with their recent orders in a single query.
// Uses a LEFT JOIN + LATERAL subquery so Postgres fetches each user's last
// 5 orders in one round-trip instead of one query per user (N+1).
router.get('/', auth, async (req, res) => {
  try {
    const result = await db.query(\`
      SELECT
        u.id, u.name, u.email, u.created_at,
        COALESCE(
          json_agg(o ORDER BY o.created_at DESC) FILTER (WHERE o.id IS NOT NULL),
          '[]'
        ) AS recent_orders
      FROM users u
      LEFT JOIN LATERAL (
        SELECT id, total, status, created_at
        FROM orders
        WHERE user_id = u.id
        ORDER BY created_at DESC
        LIMIT 5
      ) o ON true
      WHERE u.active = true
      GROUP BY u.id
    \`);

    res.json(result.rows);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

module.exports = router;`,

      "db/index.js": `const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Thin wrapper — call db.query() exactly like pool.query()
const db = {
  query: (text, params) => pool.query(text, params),
};

module.exports = db;`,

      "middleware/auth.js": `const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};`,
    },
    bugLocation: "routes/dashboard.js",
    bugLine: 14,
    bugExplanation: "The route fetches all active users, then fires a separate SELECT query for each user's orders inside a for loop. With N users this makes N+1 database round-trips. At 500 users that's 501 queries per request — the cumulative latency causes timeouts.",
    fixSummary: "Replace the loop with a single query using LEFT JOIN LATERAL to fetch each user's last 5 orders in one round-trip. Postgres evaluates the lateral subquery per row, so the database does the work instead of the application.",
  },
];
