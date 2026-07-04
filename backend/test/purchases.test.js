const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

async function createCar(overrides = {}) {
  const res = await request(app)
    .post('/api/v1/cars')
    .send({ make: 'Test', model: 'Model', year: 2024, price: 30000, ...overrides });
  return res.body;
}

describe('POST /api/v1/purchases', () => {
  test('requires carId, buyerName, buyerEmail', async () => {
    const res = await request(app).post('/api/v1/purchases').send({});
    assert.equal(res.status, 400);
  });

  test('404s for a nonexistent car', async () => {
    const res = await request(app)
      .post('/api/v1/purchases')
      .send({ carId: 999999, buyerName: 'Jane', buyerEmail: 'jane@example.com' });
    assert.equal(res.status, 404);
  });

  test('approves a normal purchase and marks the car sold', async () => {
    const car = await createCar();
    const res = await request(app).post('/api/v1/purchases').send({
      carId: car.id,
      buyerName: 'Jane Doe',
      buyerEmail: 'jane@example.com',
      creditScore: 700,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'APPROVED');
    assert.equal(res.body.fraudRisk, 'LOW');

    // Car should no longer be purchasable
    const again = await request(app).post('/api/v1/purchases').send({
      carId: car.id,
      buyerName: 'Someone Else',
      buyerEmail: 'other@example.com',
    });
    assert.equal(again.status, 404);
  });

  test('declines low credit scores before checking fraud', async () => {
    const car = await createCar();
    const res = await request(app).post('/api/v1/purchases').send({
      carId: car.id,
      buyerName: 'Jane Doe',
      buyerEmail: 'jane@example.com',
      creditScore: 500,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.creditTier, 'DECLINED');
  });

  test('flags a very low down payment for review instead of auto-approving', async () => {
    // price kept <= 80000 loan-amount threshold so only LOW_DOWN_PAYMENT trips (score 25 -> REVIEW),
    // not also HIGH_LOAN_AMOUNT (which would push it to BLOCK).
    const car = await createCar({ price: 50000 });
    const res = await request(app).post('/api/v1/purchases').send({
      carId: car.id,
      buyerName: 'Jane Doe',
      buyerEmail: 'jane@example.com',
      downPayment: 1000, // well under 5% of price -> LOW_DOWN_PAYMENT flag
      creditScore: 700,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'PENDING_REVIEW');
    assert.equal(res.body.fraudRisk, 'MEDIUM');
  });

  test('blocks a purchase where down payment exceeds price', async () => {
    const car = await createCar({ price: 20000 });
    const res = await request(app).post('/api/v1/purchases').send({
      carId: car.id,
      buyerName: 'Jane Doe',
      buyerEmail: 'jane@example.com',
      downPayment: 25000,
      creditScore: 700,
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /fraud detection/i);
  });
});

describe('GET /api/v1/purchases — PII and access control', () => {
  test('anonymous callers get a masked name and no email/loan/credit detail', async () => {
    const car = await createCar({ model: 'Privacy Test Model' });
    await request(app).post('/api/v1/purchases').send({
      carId: car.id,
      buyerName: 'Jane Doe',
      buyerEmail: 'jane@example.com',
      creditScore: 700,
    });

    const res = await request(app).get('/api/v1/purchases');
    assert.equal(res.status, 200);
    const found = res.body.purchases.find((p) => p.car?.includes('Privacy Test Model'));
    assert.ok(found, 'expected the purchase to be present');
    assert.equal(found.buyerName, 'Jane D.');
    assert.equal(found.buyerEmail, undefined);
    assert.equal(found.creditTier, undefined);
    assert.equal(found.fraudRisk, undefined);
    assert.equal(found.loanAmount, undefined);
  });

  test('a valid X-Admin-Key returns full buyer detail', async () => {
    process.env.ADMIN_API_KEY = 'test-admin-key';
    try {
      const car = await createCar({ model: 'Admin Test Model' });
      await request(app).post('/api/v1/purchases').send({
        carId: car.id,
        buyerName: 'Jane Doe',
        buyerEmail: 'jane@example.com',
        creditScore: 700,
      });

      const anon = await request(app).get('/api/v1/purchases');
      const anonFound = anon.body.purchases.find((p) => p.car?.includes('Admin Test Model'));
      assert.equal(anonFound.buyerEmail, undefined);

      const admin = await request(app)
        .get('/api/v1/purchases')
        .set('X-Admin-Key', 'test-admin-key');
      const adminFound = admin.body.purchases.find((p) => p.car?.includes('Admin Test Model'));
      assert.equal(adminFound.buyer_email ?? adminFound.buyerEmail, 'jane@example.com');
      assert.equal(adminFound.buyer_name ?? adminFound.buyerName, 'Jane Doe');
    } finally {
      delete process.env.ADMIN_API_KEY;
    }
  });
});

describe('GET /api/v1/purchases/:id — admin only', () => {
  test('403s without an admin key', async () => {
    const car = await createCar();
    const created = await request(app).post('/api/v1/purchases').send({
      carId: car.id,
      buyerName: 'Jane Doe',
      buyerEmail: 'jane@example.com',
    });

    const res = await request(app).get(`/api/v1/purchases/${created.body.id}`);
    assert.equal(res.status, 403);
  });

  test('403s even with the wrong key', async () => {
    process.env.ADMIN_API_KEY = 'test-admin-key';
    try {
      const res = await request(app)
        .get('/api/v1/purchases/1')
        .set('X-Admin-Key', 'wrong-key');
      assert.equal(res.status, 403);
    } finally {
      delete process.env.ADMIN_API_KEY;
    }
  });

  test('200s with a valid admin key and includes buyerEmail', async () => {
    process.env.ADMIN_API_KEY = 'test-admin-key';
    try {
      const car = await createCar();
      const created = await request(app).post('/api/v1/purchases').send({
        carId: car.id,
        buyerName: 'Jane Doe',
        buyerEmail: 'jane@example.com',
      });

      const res = await request(app)
        .get(`/api/v1/purchases/${created.body.id}`)
        .set('X-Admin-Key', 'test-admin-key');
      assert.equal(res.status, 200);
      assert.equal(res.body.buyerEmail ?? res.body.buyer_email, 'jane@example.com');
    } finally {
      delete process.env.ADMIN_API_KEY;
    }
  });
});
