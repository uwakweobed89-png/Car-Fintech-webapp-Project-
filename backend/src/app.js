const express = require('express');
const cors = require('cors');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');
const { register, httpRequestDuration, purchasesTotal, creditChecksTotal, fraudChecksTotal } = require('./metrics');

const app = express();

app.disable('x-powered-by');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));
app.use(express.json());

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = req.route ? req.route.path : req.path;
    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, durationSeconds);
  });
  next();
});

// ── In-memory fallback (works without RDS) ──────────────────────────────────

const CARS = [
  { id: 1, make: 'Toyota',   model: 'Camry',    year: 2024, price: 28000, mileage: 0,     color: 'Silver', image_url: 'https://images.pexels.com/photos/34404246/pexels-photo-34404246.jpeg?auto=compress&cs=tinysrgb&w=800', available: true },
  { id: 2, make: 'BMW',      model: '3 Series', year: 2023, price: 45000, mileage: 12000, color: 'Black',  image_url: 'https://images.pexels.com/photos/3786091/pexels-photo-3786091.jpeg?auto=compress&cs=tinysrgb&w=800',   available: true },
  { id: 3, make: 'Ford',     model: 'Mustang',  year: 2024, price: 38000, mileage: 0,     color: 'Red',    image_url: 'https://images.pexels.com/photos/34939819/pexels-photo-34939819.jpeg?auto=compress&cs=tinysrgb&w=800', available: true },
  { id: 4, make: 'Tesla',    model: 'Model 3',  year: 2024, price: 42000, mileage: 0,     color: 'White',  image_url: 'https://images.pexels.com/photos/9300916/pexels-photo-9300916.jpeg?auto=compress&cs=tinysrgb&w=800',   available: true },
  { id: 5, make: 'Honda',    model: 'Civic',    year: 2023, price: 24000, mileage: 8000,  color: 'Blue',   image_url: 'https://images.pexels.com/photos/166054/pexels-photo-166054.jpeg?auto=compress&cs=tinysrgb&w=800',     available: true },
  { id: 6, make: 'Mercedes', model: 'C-Class',  year: 2023, price: 55000, mileage: 5000,  color: 'Gray',   image_url: 'https://images.pexels.com/photos/9791225/pexels-photo-9791225.jpeg?auto=compress&cs=tinysrgb&w=800',   available: true },
  { id: 7, make: 'Audi',     model: 'A4',       year: 2024, price: 48000, mileage: 0,     color: 'White',  image_url: 'https://images.pexels.com/photos/9482560/pexels-photo-9482560.jpeg?auto=compress&cs=tinysrgb&w=800',   available: true },
  { id: 8, make: 'Hyundai',  model: 'Sonata',   year: 2023, price: 26000, mileage: 15000, color: 'Blue',   image_url: 'https://images.pexels.com/photos/712618/pexels-photo-712618.jpeg?auto=compress&cs=tinysrgb&w=800',     available: true },
  { id: 9,  make: 'Chevrolet', model: 'Camaro SS',       year: 2024, price: 65000,  mileage: 0,    color: 'Yellow', image_url: 'https://images.pexels.com/photos/18776100/pexels-photo-18776100.jpeg?auto=compress&cs=tinysrgb&w=800', available: true },
  { id: 10, make: 'Dodge',     model: 'Challenger R/T',  year: 2023, price: 58000,  mileage: 3000, color: 'Orange',  image_url: 'https://images.pexels.com/photos/18426531/pexels-photo-18426531.jpeg?auto=compress&cs=tinysrgb&w=800', available: true },
  { id: 11, make: 'Porsche',   model: '911 Carrera',     year: 2024, price: 115000, mileage: 0,    color: 'Silver', image_url: 'https://images.pexels.com/photos/18948281/pexels-photo-18948281.jpeg?auto=compress&cs=tinysrgb&w=800', available: true },
  { id: 12, make: 'Nissan',    model: 'GT-R',            year: 2024, price: 125000, mileage: 0,    color: 'Black',  image_url: 'https://images.pexels.com/photos/33889816/pexels-photo-33889816.jpeg?auto=compress&cs=tinysrgb&w=800', available: true },
  { id: 13, make: 'Chevrolet', model: 'Corvette Stingray', year: 2024, price: 78000, mileage: 0,   color: 'Red',    image_url: 'https://images.pexels.com/photos/34911552/pexels-photo-34911552.jpeg?auto=compress&cs=tinysrgb&w=800', available: true },
];

const PURCHASES = [];
let nextCarId = 14;
let nextPurchaseId = 1;

// ── Database ─────────────────────────────────────────────────────────────────

let pool = null;

async function initDB() {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    console.log('No DB_SECRET_ARN set — running with in-memory data');
    return;
  }

  try {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    const secret = JSON.parse(response.SecretString);

    pool = new Pool({
      host: secret.host,
      port: secret.port,
      database: secret.dbname,
      user: secret.username,
      password: secret.password,
      ssl: { rejectUnauthorized: false },
    });

    await pool.query('SELECT 1');
    console.log('Connected to RDS PostgreSQL');
  } catch (err) {
    console.warn('RDS unavailable, falling back to in-memory:', err.message);
    pool = null;
  }
}

// ── Fintech logic ─────────────────────────────────────────────────────────────

function calculateMonthlyPayment(principal, annualRatePercent, termMonths) {
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return Number((principal / termMonths).toFixed(2));
  return Number(((principal * r * Math.pow(1 + r, termMonths)) / (Math.pow(1 + r, termMonths) - 1)).toFixed(2));
}

function checkCredit(creditScore) {
  if (creditScore >= 750) return { approved: true, interestRate: 3.9,  tier: 'EXCELLENT' };
  if (creditScore >= 700) return { approved: true, interestRate: 5.9,  tier: 'GOOD' };
  if (creditScore >= 650) return { approved: true, interestRate: 8.9,  tier: 'FAIR' };
  if (creditScore >= 600) return { approved: true, interestRate: 12.9, tier: 'POOR' };
  return { approved: false, interestRate: null, tier: 'DECLINED' };
}

function detectFraud({ loanAmount, downPayment, purchasePrice }) {
  let score = 0;
  const flags = [];

  if (loanAmount > 80000)                          { score += 30; flags.push('HIGH_LOAN_AMOUNT'); }
  if (downPayment < purchasePrice * 0.05)          { score += 25; flags.push('LOW_DOWN_PAYMENT'); }
  if (downPayment > purchasePrice)                 { score += 50; flags.push('DOWN_EXCEEDS_PRICE'); }

  const risk   = score >= 50 ? 'HIGH' : score >= 25 ? 'MEDIUM' : 'LOW';
  const action = score >= 50 ? 'BLOCK' : score >= 25 ? 'REVIEW' : 'APPROVE';
  return { score, flags, risk, action };
}

// ── Admin access (protects buyer PII / financial detail) ────────────────────
//
// Read at call time (not cached at module load) so tests can toggle
// ADMIN_API_KEY per-case. Unset means the admin surface stays locked —
// there's no "wide open if unconfigured" fallback here, unlike ALLOWED_ORIGINS.

function isAdmin(req) {
  const key = process.env.ADMIN_API_KEY;
  return Boolean(key) && req.get('X-Admin-Key') === key;
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  res.status(403).json({ error: 'Admin access required' });
  return false;
}

function maskBuyerName(fullName) {
  if (!fullName) return fullName;
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// Public projection of a purchase: no email, no loan/credit/fraud detail —
// just enough for the "recent purchases" feed on the frontend.
function publicPurchaseView(p) {
  return {
    id: p.id,
    buyerName: maskBuyerName(p.buyerName ?? p.buyer_name),
    car: p.car ?? (p.make ? `${p.year} ${p.make} ${p.model}` : undefined),
    purchasePrice: p.purchasePrice ?? p.purchase_price,
    monthlyPayment: p.monthlyPayment ?? p.monthly_payment,
    status: p.status,
    createdAt: p.createdAt ?? p.created_at,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    service: 'Car$ync API',
    version: '1.0.0',
    database: pool ? 'RDS PostgreSQL' : 'in-memory',
    endpoints: {
      'GET  /health':                 'Health check',
      'GET  /api/v1/cars':            'List cars (filter: ?available=true&make=Toyota&maxPrice=40000)',
      'GET  /api/v1/cars/:id':        'Get single car',
      'POST /api/v1/cars':            'Add car listing',
      'POST /api/v1/purchases':       'Buy a car (triggers credit check + fraud detection)',
      'GET  /api/v1/purchases':       'List all purchases',
      'GET  /api/v1/purchases/:id':   'Get single purchase',
      'POST /api/v1/loan-calculator': 'Calculate monthly payment',
      'POST /api/v1/credit-check':    'Run credit check',
      'GET  /api/v1/summary':         'Platform sales summary',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: pool ? 'connected' : 'in-memory',
  });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ── Cars ──────────────────────────────────────────────────────────────────────

app.get('/api/v1/cars', async (req, res) => {
  try {
    const { available, make, maxPrice } = req.query;

    if (pool) {
      let query = 'SELECT * FROM cars WHERE 1=1';
      const params = [];
      if (available !== undefined) { params.push(available === 'true'); query += ` AND available = $${params.length}`; }
      if (make)                    { params.push(make);                 query += ` AND LOWER(make) = LOWER($${params.length})`; }
      if (maxPrice)                { params.push(Number(maxPrice));     query += ` AND price <= $${params.length}`; }
      query += ' ORDER BY created_at DESC';
      const result = await pool.query(query, params);
      return res.json({ count: result.rows.length, cars: result.rows });
    }

    let cars = [...CARS];
    if (available !== undefined) cars = cars.filter(c => c.available === (available === 'true'));
    if (make)                    cars = cars.filter(c => c.make.toLowerCase() === make.toLowerCase());
    if (maxPrice)                cars = cars.filter(c => c.price <= Number(maxPrice));

    res.json({ count: cars.length, cars });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/cars/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (pool) {
      const result = await pool.query('SELECT * FROM cars WHERE id = $1', [id]);
      if (!result.rows.length) return res.status(404).json({ error: 'Car not found' });
      return res.json(result.rows[0]);
    }

    const car = CARS.find(c => c.id === id);
    if (!car) return res.status(404).json({ error: 'Car not found' });
    res.json(car);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Creating listings is admin-only — nothing in the frontend calls this route.
app.post('/api/v1/cars', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { make, model, year, price, mileage = 0, color, image_url } = req.body;
    if (!make || !model || !year || !price) {
      return res.status(400).json({ error: 'make, model, year, and price are required' });
    }

    if (pool) {
      const result = await pool.query(
        'INSERT INTO cars (make, model, year, price, mileage, color, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [make, model, year, price, mileage, color, image_url]
      );
      return res.status(201).json(result.rows[0]);
    }

    const car = { id: nextCarId++, make, model, year, price: Number(price), mileage, color, image_url, available: true };
    CARS.push(car);
    res.status(201).json(car);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Purchases ─────────────────────────────────────────────────────────────────

app.post('/api/v1/purchases', async (req, res) => {
  try {
    const {
      carId,
      buyerName,
      buyerEmail,
      downPayment,
      loanTermMonths = 60,
      creditScore = 700,
    } = req.body;

    if (!carId || !buyerName || !buyerEmail) {
      return res.status(400).json({ error: 'carId, buyerName, and buyerEmail are required' });
    }

    // Fetch car
    let car;
    if (pool) {
      const result = await pool.query('SELECT * FROM cars WHERE id = $1 AND available = true', [carId]);
      if (!result.rows.length) return res.status(404).json({ error: 'Car not found or already sold' });
      car = result.rows[0];
    } else {
      car = CARS.find(c => c.id === Number(carId) && c.available);
      if (!car) return res.status(404).json({ error: 'Car not found or already sold' });
    }

    const purchasePrice = Number(car.price);
    const down         = downPayment !== undefined ? Number(downPayment) : purchasePrice * 0.2;
    const loanAmount   = purchasePrice - down;

    // Credit check
    const credit = checkCredit(Number(creditScore));
    if (!credit.approved) {
      return res.status(400).json({
        error: 'Credit application declined',
        creditTier: credit.tier,
        message: 'Minimum credit score of 600 required',
      });
    }

    // Fraud check
    const fraud = detectFraud({ loanAmount, downPayment: down, purchasePrice });
    if (fraud.action === 'BLOCK') {
      return res.status(400).json({
        error: 'Transaction blocked by fraud detection',
        flags: fraud.flags,
        fraudScore: fraud.score,
      });
    }

    const monthlyPayment = calculateMonthlyPayment(loanAmount, credit.interestRate, Number(loanTermMonths));
    const totalCost      = Number((monthlyPayment * Number(loanTermMonths) + down).toFixed(2));
    const status         = fraud.action === 'REVIEW' ? 'PENDING_REVIEW' : 'APPROVED';

    if (pool) {
      await pool.query('UPDATE cars SET available = false WHERE id = $1', [carId]);
      const result = await pool.query(
        `INSERT INTO purchases
           (car_id, buyer_name, buyer_email, purchase_price, loan_amount, down_payment,
            monthly_payment, loan_term_months, interest_rate, credit_tier, fraud_risk, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [carId, buyerName, buyerEmail, purchasePrice, loanAmount, down,
         monthlyPayment, loanTermMonths, credit.interestRate, credit.tier, fraud.risk, status]
      );
      return res.status(201).json({ purchase: result.rows[0], totalCost });
    }

    car.available = false;
    const purchase = {
      id: nextPurchaseId++,
      carId: Number(carId),
      car: `${car.year} ${car.make} ${car.model}`,
      buyerName, buyerEmail,
      purchasePrice, loanAmount,
      downPayment: down, monthlyPayment,
      loanTermMonths: Number(loanTermMonths),
      interestRate: credit.interestRate,
      creditTier: credit.tier,
      fraudRisk: fraud.risk,
      status,
      totalCost,
      createdAt: new Date().toISOString(),
    };
    PURCHASES.push(purchase);
    res.status(201).json(purchase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/v1/purchases', async (req, res) => {
  try {
    const admin = isAdmin(req);

    if (pool) {
      const result = await pool.query(
        `SELECT p.*, c.make, c.model, c.year
         FROM purchases p JOIN cars c ON p.car_id = c.id
         ORDER BY p.created_at DESC`
      );
      const purchases = admin ? result.rows : result.rows.map(publicPurchaseView);
      return res.json({ count: purchases.length, purchases });
    }

    const purchases = admin ? PURCHASES : PURCHASES.map(publicPurchaseView);
    res.json({ count: purchases.length, purchases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full buyer detail (email, loan amount, credit tier, fraud risk) — admin only.
// Nothing in the frontend calls this; it exists for internal/ops lookups.
app.get('/api/v1/purchases/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    if (pool) {
      const result = await pool.query(
        `SELECT p.*, c.make, c.model, c.year
         FROM purchases p JOIN cars c ON p.car_id = c.id
         WHERE p.id = $1`,
        [id]
      );
      if (!result.rows.length) return res.status(404).json({ error: 'Purchase not found' });
      return res.json(result.rows[0]);
    }
    const purchase = PURCHASES.find(p => p.id === id);
    if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
    res.json(purchase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Fintech tools ─────────────────────────────────────────────────────────────

app.post('/api/v1/loan-calculator', (req, res) => {
  const { vehiclePrice, downPayment, creditScore = 700, termMonths = 60 } = req.body;
  if (!vehiclePrice) return res.status(400).json({ error: 'vehiclePrice is required' });

  const price      = Number(vehiclePrice);
  const down       = downPayment !== undefined ? Number(downPayment) : price * 0.2;
  const loanAmount = price - down;
  const credit     = checkCredit(Number(creditScore));

  if (!credit.approved) {
    return res.json({ approved: false, creditTier: credit.tier, message: 'Credit would be declined' });
  }

  const monthly      = calculateMonthlyPayment(loanAmount, credit.interestRate, Number(termMonths));
  const totalCost    = Number((monthly * Number(termMonths) + down).toFixed(2));
  const totalInterest = Number((totalCost - price).toFixed(2));

  res.json({
    vehiclePrice: price,
    downPayment: down,
    loanAmount,
    termMonths: Number(termMonths),
    interestRate: credit.interestRate,
    creditTier: credit.tier,
    monthlyPayment: monthly,
    totalInterest,
    totalCost,
  });
});

app.post('/api/v1/credit-check', (req, res) => {
  const { creditScore } = req.body;
  if (!creditScore) return res.status(400).json({ error: 'creditScore is required' });
  res.json(checkCredit(Number(creditScore)));
});

// ── Summary ───────────────────────────────────────────────────────────────────

app.get('/api/v1/summary', async (req, res) => {
  try {
    if (pool) {
      const inv = await pool.query(
        `SELECT COUNT(*)                                    AS total,
                COUNT(*) FILTER (WHERE available = true)   AS available,
                COUNT(*) FILTER (WHERE available = false)  AS sold
         FROM cars`
      );
      const sales = await pool.query(
        `SELECT COUNT(*)                        AS total,
                COALESCE(SUM(purchase_price),0) AS revenue,
                COALESCE(AVG(purchase_price),0) AS avg_price
         FROM purchases WHERE status = 'APPROVED'`
      );
      return res.json({ inventory: inv.rows[0], sales: sales.rows[0] });
    }

    const sold     = CARS.filter(c => !c.available);
    const approved = PURCHASES.filter(p => p.status === 'APPROVED');
    const revenue  = approved.reduce((sum, p) => sum + p.purchasePrice, 0);

    res.json({
      inventory: { total: CARS.length, available: CARS.length - sold.length, sold: sold.length },
      sales:     { total: approved.length, revenue, avg_price: approved.length ? revenue / approved.length : 0 },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { app, initDB };
