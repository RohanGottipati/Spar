export const scenarios = [
  {
    id: "null-user-crash",
    title: "Profile 500 Error",
    company: "Social App",
    description: "The /api/profile endpoint crashes with 'Cannot read properties of undefined' whenever an unknown userId is passed. It only happens in production; users are reporting 500 errors.",
    difficulty: "easy",
    timeLimit: 25 * 60,
    files: {
      "routes/profile.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/profile?userId=<id>
router.get('/', async (req, res) => {
  const { userId } = req.query;

  const user = await db.users.findOne({ id: userId });

  if (user.deactivated) {
    return res.status(403).json({ error: 'Account deactivated' });
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    joinedAt: user.createdAt,
  });
});

module.exports = router;`,

      "routes/profile.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/profile?userId=<id>
router.get('/', async (req, res) => {
  const { userId } = req.query;

  const user = await db.users.findOne({ id: userId });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.deactivated) {
    return res.status(403).json({ error: 'Account deactivated' });
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    joinedAt: user.createdAt,
  });
});

module.exports = router;`,

      "db/index.js": `const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const users = {
  // Returns the matching row object, or null if not found.
  async findOne(query) {
    const keys = Object.keys(query);
    const where = keys.map((k, i) => \`\${k} = $\${i + 1}\`).join(' AND ');
    const result = await pool.query(
      \`SELECT * FROM users WHERE \${where} LIMIT 1\`,
      Object.values(query)
    );
    return result.rows[0] ?? null;
  },
};

module.exports = { users };`,
    },
    bugLocation: "routes/profile.js",
    bugLine: 9,
    bugExplanation: "db.users.findOne() returns null when userId doesn't match any row. The code immediately reads user.deactivated without checking for null first. In JavaScript, property access on null throws a TypeError, which Express catches and returns as a 500.",
    fixSummary: "Add a null check immediately after the db lookup: if (!user) return res.status(404).json({ error: 'User not found' }). This guard must come before any property access on the user object.",
  },

  {
    id: "duplicate-orders",
    title: "Checkout Bug",
    company: "E-commerce Platform",
    description: "Orders are duplicating in production. Customers are being charged twice.",
    difficulty: "medium",
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
    difficulty: "hard",
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
    difficulty: "medium",
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

  // ─── EASY ────────────────────────────────────────────────────────────────────

  {
    id: "missing-await",
    title: "Empty Search Results",
    company: "Job Board",
    description: "The job search endpoint always returns an empty result set, even when matching jobs exist in the database. No errors are logged.",
    difficulty: "easy",
    timeLimit: 25 * 60,
    files: {
      "routes/jobs.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/jobs/search?q=engineer&location=remote
router.get('/search', async (req, res) => {
  const { q, location } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query param q is required' });
  }

  const results = db.jobs.search(q, location);

  res.json({ results, count: results.length });
});

module.exports = router;`,

      "routes/jobs.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/jobs/search?q=engineer&location=remote
router.get('/search', async (req, res) => {
  const { q, location } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Query param q is required' });
  }

  const results = await db.jobs.search(q, location);

  res.json({ results, count: results.length });
});

module.exports = router;`,

      "db/jobs.js": `const { pool } = require('./pool');

const jobs = {
  // Full-text search across title and description.
  // Returns array of matching job rows (may be empty, never null).
  async search(query, location) {
    const params = [\`%\${query}%\`];
    let sql = \`
      SELECT id, title, company, location, salary_range, posted_at
      FROM jobs
      WHERE (title ILIKE $1 OR description ILIKE $1)
        AND active = true
    \`;

    if (location) {
      params.push(\`%\${location}%\`);
      sql += \` AND location ILIKE $\${params.length}\`;
    }

    sql += ' ORDER BY posted_at DESC LIMIT 50';

    const result = await pool.query(sql, params);
    return result.rows;
  },
};

module.exports = jobs;`,
    },
    bugLocation: "routes/jobs.js",
    bugLine: 13,
    bugExplanation: "db.jobs.search() is an async function but is called without await. The variable 'results' holds a Promise object, not the resolved array. JSON.stringify on a Promise produces '{}', so res.json sends { results: {}, count: undefined }.",
    fixSummary: "Add await before db.jobs.search(q, location). The function is already marked async so the only missing piece is the await keyword on line 13.",
  },

  {
    id: "off-by-one-pagination",
    title: "Missing First Page",
    company: "Content Platform",
    description: "The paginated articles endpoint skips the first page of results entirely. Users on page 1 see articles 11-20 instead of 1-10. Complaints are coming in from users who can't see the latest posts.",
    difficulty: "easy",
    timeLimit: 25 * 60,
    files: {
      "routes/articles.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

const PAGE_SIZE = 10;

// GET /api/articles?page=1
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;

  if (page < 1) {
    return res.status(400).json({ error: 'page must be >= 1' });
  }

  const offset = page * PAGE_SIZE;

  const rows = await db.query(
    'SELECT id, title, author, published_at FROM articles ORDER BY published_at DESC LIMIT $1 OFFSET $2',
    [PAGE_SIZE, offset]
  );

  const total = await db.query('SELECT COUNT(*) FROM articles');
  const totalPages = Math.ceil(total.rows[0].count / PAGE_SIZE);

  res.json({
    articles: rows.rows,
    page,
    totalPages,
  });
});

module.exports = router;`,

      "routes/articles.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

const PAGE_SIZE = 10;

// GET /api/articles?page=1
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;

  if (page < 1) {
    return res.status(400).json({ error: 'page must be >= 1' });
  }

  // Page 1 starts at offset 0, page 2 at offset 10, etc.
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db.query(
    'SELECT id, title, author, published_at FROM articles ORDER BY published_at DESC LIMIT $1 OFFSET $2',
    [PAGE_SIZE, offset]
  );

  const total = await db.query('SELECT COUNT(*) FROM articles');
  const totalPages = Math.ceil(total.rows[0].count / PAGE_SIZE);

  res.json({
    articles: rows.rows,
    page,
    totalPages,
  });
});

module.exports = router;`,

      "db/index.js": `const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
module.exports = { query: (text, params) => pool.query(text, params) };`,
    },
    bugLocation: "routes/articles.js",
    bugLine: 15,
    bugExplanation: "The offset is calculated as page * PAGE_SIZE instead of (page - 1) * PAGE_SIZE. Page 1 produces OFFSET 10, which skips the first 10 rows. Page 2 produces OFFSET 20, skipping 20. The first 10 results are unreachable through any page number.",
    fixSummary: "Change offset = page * PAGE_SIZE to offset = (page - 1) * PAGE_SIZE. Page 1 should map to OFFSET 0 so the first results are returned.",
  },

  {
    id: "missing-return",
    title: "Server Crashes on 404",
    company: "REST API Startup",
    description: "Any request for a non-existent resource causes a server error: 'Cannot set headers after they are sent to the client'. The 404 itself is sent correctly, but then the server crashes trying to send a second response.",
    difficulty: "easy",
    timeLimit: 25 * 60,
    files: {
      "routes/products.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  const product = await db.products.findById(req.params.id);

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
  }

  res.json(product);
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  const product = await db.products.findById(req.params.id);

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
  }

  await db.products.delete(req.params.id);
  res.status(204).send();
});

module.exports = router;`,

      "routes/products.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  const product = await db.products.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  res.json(product);
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  const product = await db.products.findById(req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  await db.products.delete(req.params.id);
  res.status(204).send();
});

module.exports = router;`,

      "db/products.js": `const { pool } = require('./pool');

const products = {
  async findById(id) {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return result.rows[0] ?? null;
  },
  async delete(id) {
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
  },
};

module.exports = products;`,
    },
    bugLocation: "routes/products.js",
    bugLine: 9,
    bugExplanation: "Both route handlers are missing 'return' before res.status(404).json(). Without return, Express sends the 404 response and then continues executing. The GET handler then calls res.json(null) and the DELETE handler calls res.status(204).send() — both attempts to write to an already-closed response, throwing 'Cannot set headers after they are sent'.",
    fixSummary: "Add 'return' before both res.status(404).json() calls so the function exits after sending the error response. The pattern 'return res.status(404).json(...)' is idiomatic Express.",
  },

  {
    id: "query-string-type",
    title: "Feature Flag Always Off",
    company: "Growth Platform",
    description: "A feature flag endpoint controls whether beta features are shown to users. Setting enabled=true in the request has no effect — the feature is always disabled regardless of what value is sent.",
    difficulty: "easy",
    timeLimit: 25 * 60,
    files: {
      "routes/features.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// PUT /api/features/:name?enabled=true
router.put('/:name', async (req, res) => {
  const { name } = req.params;
  const { enabled } = req.query;

  const feature = await db.features.findOne({ name });
  if (!feature) {
    return res.status(404).json({ error: 'Feature not found' });
  }

  if (enabled === true) {
    await db.features.update(name, { enabled: true });
  } else {
    await db.features.update(name, { enabled: false });
  }

  res.json({ name, enabled: enabled === true });
});

module.exports = router;`,

      "routes/features.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');

// PUT /api/features/:name?enabled=true
router.put('/:name', async (req, res) => {
  const { name } = req.params;
  const { enabled } = req.query;

  const feature = await db.features.findOne({ name });
  if (!feature) {
    return res.status(404).json({ error: 'Feature not found' });
  }

  // req.query values are always strings. 'enabled=true' arrives as the
  // string "true", which is never strictly equal to the boolean true.
  const isEnabled = enabled === 'true';

  if (isEnabled) {
    await db.features.update(name, { enabled: true });
  } else {
    await db.features.update(name, { enabled: false });
  }

  res.json({ name, enabled: isEnabled });
});

module.exports = router;`,

      "db/features.js": `const { pool } = require('./pool');

const features = {
  async findOne(query) {
    const result = await pool.query(
      'SELECT * FROM feature_flags WHERE name = $1',
      [query.name]
    );
    return result.rows[0] ?? null;
  },
  async update(name, data) {
    await pool.query(
      'UPDATE feature_flags SET enabled = $1 WHERE name = $2',
      [data.enabled, name]
    );
  },
};

module.exports = features;`,
    },
    bugLocation: "routes/features.js",
    bugLine: 14,
    bugExplanation: "req.query always returns strings. The value of enabled from the query string '?enabled=true' is the string \"true\", not the boolean true. The strict equality check enabled === true always evaluates to false because a string is never strictly equal to a boolean. The feature is therefore always disabled.",
    fixSummary: "Parse the query param as a boolean: const isEnabled = enabled === 'true'. Query string values are always strings in Express — never booleans — so comparisons must use string literals.",
  },

  // ─── MEDIUM ──────────────────────────────────────────────────────────────────

  {
    id: "async-foreach",
    title: "Missing Audit Logs",
    company: "Compliance Platform",
    description: "Security audit logs are intermittently missing entries. The API returns success but some events are never written to the database. The problem only shows up in production under load, never in tests.",
    difficulty: "medium",
    timeLimit: 35 * 60,
    files: {
      "services/audit.js": `const db = require('../db');

// Write a batch of audit events for a completed action.
// Called after every privileged operation.
async function logEvents(events) {
  events.forEach(async (event) => {
    await db.audit.insert({
      type: event.type,
      userId: event.userId,
      resourceId: event.resourceId,
      metadata: event.metadata,
      timestamp: new Date(),
    });
  });
}

module.exports = { logEvents };`,

      "services/audit.js.fixed.js": `const db = require('../db');

// Write a batch of audit events for a completed action.
// Called after every privileged operation.
async function logEvents(events) {
  // forEach does not await async callbacks — it fires them and moves on,
  // so the function returns before any inserts complete.
  // Use Promise.all + map so all inserts run concurrently and are awaited.
  await Promise.all(events.map(async (event) => {
    await db.audit.insert({
      type: event.type,
      userId: event.userId,
      resourceId: event.resourceId,
      metadata: event.metadata,
      timestamp: new Date(),
    });
  }));
}

module.exports = { logEvents };`,

      "routes/admin.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const { logEvents } = require('../services/audit');
const auth = require('../middleware/auth');

// POST /api/admin/users/:id/suspend
router.post('/users/:id/suspend', auth, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const user = await db.users.findById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  await db.users.update(id, { status: 'suspended' });

  await logEvents([
    { type: 'USER_SUSPENDED', userId: req.user.id, resourceId: id, metadata: { reason } },
    { type: 'ADMIN_ACTION',   userId: req.user.id, resourceId: id, metadata: { action: 'suspend', target: id } },
  ]);

  res.json({ success: true });
});

module.exports = router;`,

      "db/audit.js": `const { pool } = require('./pool');

const audit = {
  async insert(event) {
    await pool.query(
      'INSERT INTO audit_log (type, user_id, resource_id, metadata, timestamp) VALUES ($1, $2, $3, $4, $5)',
      [event.type, event.userId, event.resourceId, JSON.stringify(event.metadata), event.timestamp]
    );
  },
};

module.exports = audit;`,
    },
    bugLocation: "services/audit.js",
    bugLine: 6,
    bugExplanation: "Array.prototype.forEach does not handle async callbacks. It calls each callback and ignores the returned Promise. logEvents() returns before any of the db.audit.insert() calls complete. The inserts are still queued on the event loop, but if the process shuts down or the connection pool is under pressure, they are silently dropped.",
    fixSummary: "Replace forEach with Promise.all(events.map(...)) and await it. This runs all inserts concurrently and waits for all of them to complete before returning, ensuring the function doesn't resolve until every event is persisted.",
  },

  {
    id: "cache-key-collision",
    title: "Users Seeing Wrong Data",
    company: "Multi-Tenant SaaS",
    description: "Users are occasionally seeing each other's dashboard data. A user on the free plan briefly saw premium features. The issue is intermittent and seems to happen right after another user loads the same page.",
    difficulty: "medium",
    timeLimit: 35 * 60,
    files: {
      "routes/dashboard.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../cache');
const auth = require('../middleware/auth');

// GET /api/dashboard
router.get('/', auth, async (req, res) => {
  const { orgId } = req.user;

  const cacheKey = \`dashboard:\${orgId}\`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const user = await db.users.findById(req.user.id);
  const subscription = await db.subscriptions.findByUser(req.user.id);
  const stats = await db.stats.forUser(req.user.id);

  const payload = {
    user: { id: user.id, name: user.name, email: user.email },
    plan: subscription.plan,
    features: subscription.features,
    stats,
  };

  await cache.set(cacheKey, payload, 300); // 5 min TTL
  res.json(payload);
});

module.exports = router;`,

      "routes/dashboard.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../cache');
const auth = require('../middleware/auth');

// GET /api/dashboard
router.get('/', auth, async (req, res) => {
  const { orgId, id: userId } = req.user;

  // The cache key must include userId, not just orgId.
  // Multiple users in the same org have different plans and stats —
  // sharing a per-org key means one user's data bleeds into another's.
  const cacheKey = \`dashboard:\${orgId}:\${userId}\`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.json(cached);
  }

  const user = await db.users.findById(userId);
  const subscription = await db.subscriptions.findByUser(userId);
  const stats = await db.stats.forUser(userId);

  const payload = {
    user: { id: user.id, name: user.name, email: user.email },
    plan: subscription.plan,
    features: subscription.features,
    stats,
  };

  await cache.set(cacheKey, payload, 300); // 5 min TTL
  res.json(payload);
});

module.exports = router;`,

      "cache/index.js": `const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL });

client.connect().catch(console.error);

const cache = {
  async get(key) {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  },
  async set(key, value, ttlSeconds) {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  },
  async del(key) {
    await client.del(key);
  },
};

module.exports = cache;`,

      "middleware/auth.js": `const jwt = require('jsonwebtoken');

// Decodes JWT and attaches { id, orgId, email } to req.user
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};`,
    },
    bugLocation: "routes/dashboard.js",
    bugLine: 11,
    bugExplanation: "The cache key is 'dashboard:{orgId}', scoped to the organization but not the individual user. Multiple users in the same org share the same key. The first user to load the dashboard caches their own personal data (including plan and features). The next user in the same org gets a cache hit and receives the first user's data instead of their own.",
    fixSummary: "Include the userId in the cache key: 'dashboard:{orgId}:{userId}'. Each user's personalized data must be cached separately even within the same organization.",
  },

  {
    id: "stale-cache-on-write",
    title: "Price Changes Not Showing",
    company: "E-commerce Platform",
    description: "Product prices updated by the admin team don't appear on the storefront for up to 10 minutes. Customers are completing purchases at the old (lower) price. The backend confirms the update was saved but the API keeps returning the old value.",
    difficulty: "medium",
    timeLimit: 35 * 60,
    files: {
      "routes/products.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../cache');
const auth = require('../middleware/auth');

// GET /api/products/:id  (public)
router.get('/:id', async (req, res) => {
  const cacheKey = \`product:\${req.params.id}\`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  const product = await db.products.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });

  await cache.set(cacheKey, product, 600); // 10 min TTL
  res.json(product);
});

// PUT /api/products/:id  (admin only)
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { price, name, description } = req.body;

  const product = await db.products.findById(id);
  if (!product) return res.status(404).json({ error: 'Not found' });

  await db.products.update(id, { price, name, description });

  res.json({ success: true });
});

module.exports = router;`,

      "routes/products.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../cache');
const auth = require('../middleware/auth');

// GET /api/products/:id  (public)
router.get('/:id', async (req, res) => {
  const cacheKey = \`product:\${req.params.id}\`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.json(cached);

  const product = await db.products.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Not found' });

  await cache.set(cacheKey, product, 600); // 10 min TTL
  res.json(product);
});

// PUT /api/products/:id  (admin only)
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { price, name, description } = req.body;

  const product = await db.products.findById(id);
  if (!product) return res.status(404).json({ error: 'Not found' });

  await db.products.update(id, { price, name, description });

  // Invalidate cache so the next read fetches fresh data from the DB.
  // Without this, the old cached price persists for the full 10-min TTL.
  await cache.del(\`product:\${id}\`);

  res.json({ success: true });
});

module.exports = router;`,

      "cache/index.js": `const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL });
client.connect().catch(console.error);

module.exports = {
  async get(key) {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  },
  async set(key, value, ttlSeconds) {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  },
  async del(key) {
    await client.del(key);
  },
};`,

      "db/products.js": `const { pool } = require('./pool');

module.exports = {
  async findById(id) {
    const r = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    return r.rows[0] ?? null;
  },
  async update(id, data) {
    const keys = Object.keys(data);
    const set = keys.map((k, i) => \`\${k} = $\${i + 2}\`).join(', ');
    await pool.query(\`UPDATE products SET \${set} WHERE id = $1\`, [id, ...Object.values(data)]);
  },
};`,
    },
    bugLocation: "routes/products.js",
    bugLine: 27,
    bugExplanation: "The PUT handler updates the product in the database but never invalidates the Redis cache entry. Subsequent GET requests get a cache hit and return the old cached data for up to 10 minutes (the TTL). The fix must call cache.del after every successful write.",
    fixSummary: "Add await cache.del(`product:${id}`) after the database update in the PUT handler. This forces the next read to miss the cache and fetch fresh data from the database.",
  },

  // ─── HARD ────────────────────────────────────────────────────────────────────

  {
    id: "cache-stampede",
    title: "Database Collapse on Cache Expiry",
    company: "High-Traffic News Site",
    description: "Every 10 minutes the site experiences a brief outage. Database CPU spikes to 100%, query latency explodes, and some requests time out. The pattern is perfectly regular. It started when traffic grew past 200 requests per second.",
    difficulty: "hard",
    timeLimit: 40 * 60,
    files: {
      "routes/feed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../cache');

// GET /api/feed  — heavily cached, expensive to compute
router.get('/', async (req, res) => {
  const cached = await cache.get('global:feed');
  if (cached) {
    return res.json(cached);
  }

  // Expensive: joins 4 tables, aggregates scores, runs recommendations
  const feed = await db.computeFeed();

  await cache.set('global:feed', feed, 600); // 10 min TTL
  res.json(feed);
});

module.exports = router;`,

      "routes/feed.js.fixed.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const cache = require('../cache');

// Single in-flight promise per cache key.
// Prevents multiple concurrent rebuilds when cache expires.
const rebuilding = new Map();

// GET /api/feed  — heavily cached, expensive to compute
router.get('/', async (req, res) => {
  const cached = await cache.get('global:feed');
  if (cached) {
    return res.json(cached);
  }

  // If a rebuild is already in progress, wait for it instead of
  // firing another expensive query.
  if (!rebuilding.has('global:feed')) {
    const promise = db.computeFeed().then(async (feed) => {
      await cache.set('global:feed', feed, 600);
      rebuilding.delete('global:feed');
      return feed;
    });
    rebuilding.set('global:feed', promise);
  }

  const feed = await rebuilding.get('global:feed');
  res.json(feed);
});

module.exports = router;`,

      "cache/index.js": `const redis = require('redis');
const client = redis.createClient({ url: process.env.REDIS_URL });
client.connect().catch(console.error);

module.exports = {
  async get(key) {
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  },
  async set(key, value, ttlSeconds) {
    await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  },
};`,

      "db/index.js": `const { pool } = require('./pool');

// Expensive aggregation — takes ~800ms on a warm DB, longer under load.
async function computeFeed() {
  const result = await pool.query(\`
    SELECT
      a.id, a.title, a.slug, a.published_at,
      u.name AS author,
      COUNT(l.id) AS likes,
      COUNT(c.id) AS comments
    FROM articles a
    JOIN users u ON u.id = a.author_id
    LEFT JOIN likes l ON l.article_id = a.id
    LEFT JOIN comments c ON c.article_id = a.id
    WHERE a.published_at > NOW() - INTERVAL '48 hours'
    GROUP BY a.id, u.name
    ORDER BY likes DESC, published_at DESC
    LIMIT 50
  \`);
  return result.rows;
}

module.exports = { computeFeed };`,
    },
    bugLocation: "routes/feed.js",
    bugLine: 7,
    bugExplanation: "When the cache TTL expires, all concurrent requests simultaneously get a cache miss and each fires db.computeFeed() independently. At 200 req/s with a single shared key, hundreds of identical expensive queries hit the database at once — a cache stampede. The database collapses under the sudden load, causing timeouts. This repeats every time the 10-minute TTL elapses.",
    fixSummary: "Use a single in-flight promise (stored in a Map) to coalesce concurrent cache misses. The first request that misses starts the rebuild and stores the promise; subsequent requests that miss while the rebuild is in flight await the same promise instead of issuing their own queries.",
  },

  {
    id: "deadlock",
    title: "Transfers Occasionally Hang",
    company: "Fintech Startup",
    description: "Account-to-account transfers occasionally hang indefinitely and must be killed manually. It happens randomly under load, roughly once per hour. No errors are logged — the requests just never complete.",
    difficulty: "hard",
    timeLimit: 40 * 60,
    files: {
      "services/transfer.js": `const { pool } = require('../db/pool');

// Transfer funds between two accounts.
// Uses row-level locks to prevent concurrent balance corruption.
async function transfer(fromId, toId, amount) {
  return await pool.transaction(async (client) => {
    // Lock source account
    const fromResult = await client.query(
      'SELECT balance FROM accounts WHERE id = $1 FOR UPDATE',
      [fromId]
    );
    const from = fromResult.rows[0];
    if (!from) throw new Error('Source account not found');
    if (from.balance < amount) throw new Error('Insufficient funds');

    // Lock destination account
    const toResult = await client.query(
      'SELECT balance FROM accounts WHERE id = $1 FOR UPDATE',
      [toId]
    );
    const to = toResult.rows[0];
    if (!to) throw new Error('Destination account not found');

    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
  });
}

module.exports = { transfer };`,

      "services/transfer.js.fixed.js": `const { pool } = require('../db/pool');

// Transfer funds between two accounts.
// Locks are acquired in ascending ID order to prevent deadlocks.
// If two concurrent transfers involve the same pair of accounts in
// opposite directions, both will attempt to acquire the same locks
// in the same order — one waits instead of both blocking each other.
async function transfer(fromId, toId, amount) {
  return await pool.transaction(async (client) => {
    // Always lock the lower ID first to enforce a consistent lock order.
    const [firstId, secondId] = fromId < toId ? [fromId, toId] : [toId, fromId];

    await client.query('SELECT balance FROM accounts WHERE id = $1 FOR UPDATE', [firstId]);
    await client.query('SELECT balance FROM accounts WHERE id = $1 FOR UPDATE', [secondId]);

    // Re-fetch balances after locks are acquired
    const fromResult = await client.query('SELECT balance FROM accounts WHERE id = $1', [fromId]);
    const from = fromResult.rows[0];
    if (!from) throw new Error('Source account not found');
    if (from.balance < amount) throw new Error('Insufficient funds');

    const toResult = await client.query('SELECT balance FROM accounts WHERE id = $1', [toId]);
    const to = toResult.rows[0];
    if (!to) throw new Error('Destination account not found');

    await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, fromId]);
    await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toId]);
  });
}

module.exports = { transfer };`,

      "db/pool.js": `const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

      "routes/transfers.js": `const express = require('express');
const router = express.Router();
const { transfer } = require('../services/transfer');
const auth = require('../middleware/auth');

// POST /api/transfers
router.post('/', auth, async (req, res) => {
  const { fromAccountId, toAccountId, amount } = req.body;

  if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid transfer request' });
  }

  try {
    await transfer(fromAccountId, toAccountId, amount);
    res.json({ success: true });
  } catch (err) {
    if (err.message === 'Insufficient funds') {
      return res.status(422).json({ error: err.message });
    }
    res.status(500).json({ error: 'Transfer failed' });
  }
});

module.exports = router;`,
    },
    bugLocation: "services/transfer.js",
    bugLine: 8,
    bugExplanation: "The transfer function acquires row locks in the order (fromId, toId). If two concurrent transfers run in opposite directions — A→B and B→A — they acquire locks in opposite orders: A→B locks A then waits for B, while B→A has already locked B and waits for A. Both transactions wait for each other indefinitely: a classic deadlock. Postgres eventually detects it and kills one, but under high load the detection timeout causes visible hangs.",
    fixSummary: "Always acquire row locks in a consistent order — sort account IDs and lock the lower one first. Both A→B and B→A will lock the same account first, so one transaction waits while the other completes instead of both blocking each other.",
  },

  {
    id: "event-loop-block",
    title: "API Freezes Under Load",
    company: "Data Export Service",
    description: "When users export large datasets, the entire API becomes unresponsive for several seconds. All endpoints — including health checks — stop responding. Latency for unrelated requests spikes from 10ms to 4+ seconds.",
    difficulty: "hard",
    timeLimit: 40 * 60,
    files: {
      "routes/export.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// POST /api/export  — exports all user records as CSV
router.post('/', auth, async (req, res) => {
  const { orgId } = req.user;

  const records = await db.query(
    'SELECT * FROM records WHERE org_id = $1',
    [orgId]
  );

  // Build CSV in-process
  const header = Object.keys(records.rows[0]).join(',');
  const rows = records.rows.map(row =>
    Object.values(row).map(v =>
      typeof v === 'string' ? \`"\${v.replace(/"/g, '""')}"\` : v
    ).join(',')
  );

  const csv = [header, ...rows].join('\\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="export.csv"');
  res.send(csv);
});

module.exports = router;`,

      "routes/export.js.fixed.js": `const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const auth = require('../middleware/auth');
const { Transform } = require('stream');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// POST /api/export  — streams CSV row-by-row to avoid blocking the event loop
router.post('/', auth, async (req, res) => {
  const { orgId } = req.user;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="export.csv"');

  const client = await pool.connect();
  try {
    // pg cursor streams rows one at a time without loading them all into memory
    const query = new (require('pg-cursor'))(
      'SELECT * FROM records WHERE org_id = $1',
      [orgId]
    );
    const cursor = client.query(query);

    let headerWritten = false;

    const read = () => {
      cursor.read(100, (err, rows) => {
        if (err) { client.release(); res.end(); return; }
        if (rows.length === 0) { client.release(); res.end(); return; }

        if (!headerWritten) {
          res.write(Object.keys(rows[0]).join(',') + '\\n');
          headerWritten = true;
        }

        for (const row of rows) {
          const line = Object.values(row).map(v =>
            typeof v === 'string' ? \`"\${v.replace(/"/g, '""')}"\` : v
          ).join(',');
          res.write(line + '\\n');
        }

        // Yield to the event loop before reading the next batch
        setImmediate(read);
      });
    };

    read();
  } catch (err) {
    client.release();
    res.status(500).end();
  }
});

module.exports = router;`,

      "db/index.js": `const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
module.exports = { query: (text, params) => pool.query(text, params) };`,

      "middleware/auth.js": `const jwt = require('jsonwebtoken');
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};`,
    },
    bugLocation: "routes/export.js",
    bugLine: 15,
    bugExplanation: "After fetching all rows from the database, the route builds the entire CSV string synchronously using .map() and .join() in the main thread. Node.js is single-threaded — while this CPU-bound work runs, the event loop is blocked and no other request can be processed. With 100,000 rows, this synchronous processing takes seconds, freezing all other endpoints including health checks.",
    fixSummary: "Stream the CSV row-by-row using a database cursor and setImmediate between batches to yield control back to the event loop. This processes data incrementally, allowing other requests to interleave between chunks rather than blocking everything for the full duration.",
  },

  {
    id: "jwt-algorithm-confusion",
    title: "Authentication Bypass",
    company: "Security-Critical Platform",
    description: "A penetration tester was able to forge valid admin session tokens without knowing the secret key. They accessed the admin panel using a crafted JWT. No brute force was detected — the attack was silent.",
    difficulty: "hard",
    timeLimit: 40 * 60,
    files: {
      "middleware/auth.js": `const jwt = require('jsonwebtoken');

const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY; // RS256 public key

// Verify JWT and attach decoded payload to req.user
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, PUBLIC_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};`,

      "middleware/auth.js.fixed.js": `const jwt = require('jsonwebtoken');

const PUBLIC_KEY = process.env.JWT_PUBLIC_KEY; // RS256 public key

// Verify JWT and attach decoded payload to req.user.
// IMPORTANT: always specify allowed algorithms explicitly.
// Without this, the jsonwebtoken library accepts the algorithm
// declared in the token header — including 'none' (unsigned).
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};`,

      "routes/admin.js": `const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middleware/auth');

// All admin routes require a valid JWT
router.use(auth);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const users = await db.query('SELECT id, email, role, created_at FROM users');
  res.json(users.rows);
});

module.exports = router;`,

      "scripts/forge-token-example.js": `// This script demonstrates the attack vector.
// An attacker who intercepts a valid token can decode the payload (JWTs are
// base64 — not encrypted), modify it, and re-sign with alg:none.
// The server accepts it if algorithms are not explicitly constrained.

// Attacker steps:
// 1. Intercept any valid JWT from a normal user session
// 2. Base64-decode the header and payload
// 3. Change "role": "user" to "role": "admin" in the payload
// 4. Change "alg": "RS256" to "alg": "none" in the header
// 5. Re-encode header + payload with an empty signature: "header.payload."
// 6. Send the forged token — the server verifies it successfully
//    because jwt.verify() trusts the algorithm declared in the token.

// No private key required. The attack works against any RS256 endpoint
// that does not specify { algorithms: ['RS256'] } in jwt.verify options.`,
    },
    bugLocation: "middleware/auth.js",
    bugLine: 11,
    bugExplanation: "jwt.verify() is called without specifying allowed algorithms. The jsonwebtoken library defaults to trusting the algorithm declared in the token's header. An attacker can craft a token with 'alg: none' in the header — which signals no signature is required — and jwt.verify() accepts it as valid. By also changing role to 'admin' in the payload, the attacker gets full admin access without knowing the private key.",
    fixSummary: "Pass { algorithms: ['RS256'] } as the third argument to jwt.verify(). This rejects any token that declares a different algorithm in its header, including 'none'. Never allow the token itself to dictate which algorithm is used for verification.",
  },
];
