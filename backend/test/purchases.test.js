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
