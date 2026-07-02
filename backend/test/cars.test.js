const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

describe('GET /api/v1/cars', () => {
  test('lists seeded cars', async () => {
    const res = await request(app).get('/api/v1/cars');
    assert.equal(res.status, 200);
    assert.ok(res.body.count >= 8);
    assert.ok(Array.isArray(res.body.cars));
  });

  test('filters by make', async () => {
    const res = await request(app).get('/api/v1/cars?make=Toyota');
    assert.equal(res.status, 200);
    assert.ok(res.body.cars.every((c) => c.make === 'Toyota'));
  });
});

describe('GET /api/v1/cars/:id', () => {
  test('returns a known car', async () => {
    const res = await request(app).get('/api/v1/cars/1');
    assert.equal(res.status, 200);
    assert.equal(res.body.make, 'Toyota');
  });

  test('404s for a missing car', async () => {
    const res = await request(app).get('/api/v1/cars/999999');
    assert.equal(res.status, 404);
  });
});

describe('POST /api/v1/cars', () => {
  test('rejects missing required fields', async () => {
    const res = await request(app).post('/api/v1/cars').send({ make: 'Kia' });
    assert.equal(res.status, 400);
  });

  test('creates a car and it becomes fetchable', async () => {
    const created = await request(app)
      .post('/api/v1/cars')
      .send({ make: 'Kia', model: 'Optima', year: 2024, price: 27000 });
    assert.equal(created.status, 201);
    assert.equal(created.body.available, true);

    const fetched = await request(app).get(`/api/v1/cars/${created.body.id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.model, 'Optima');
  });
});
