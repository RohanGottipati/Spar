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
  }
];
