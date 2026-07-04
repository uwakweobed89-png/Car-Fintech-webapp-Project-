const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

describe('GET /metrics', () => {
  test('exposes Prometheus-formatted metrics', async () => {
    const res = await request(app).get('/metrics');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/plain/);
    assert.match(res.text, /^# HELP/m);
    assert.match(res.text, /nodejs_eventloop_lag_seconds/);
    assert.match(res.text, /nodejs_gc_duration_seconds/);
  });

  test('records HTTP request duration for a real request', async () => {
    await request(app).get('/api/v1/cars');
    const res = await request(app).get('/metrics');
    assert.match(res.text, /http_request_duration_seconds_count\{[^}]*route="\/api\/v1\/cars"[^}]*\}/);
  });
});

describe('GET /metrics — business counters', () => {
  test('counts a declined credit check', async () => {
    const before = (await request(app).get('/metrics')).text;
    await request(app).post('/api/v1/purchases').send({
      carId: 999999, buyerName: 'Jane', buyerEmail: 'jane@example.com', creditScore: 500,
    });
    // carId is bogus so this 404s before credit check runs; use credit-check route instead
    await request(app).post('/api/v1/credit-check').send({ creditScore: 500 });
    const after = (await request(app).get('/metrics')).text;
    assert.match(after, /credit_checks_total\{tier="DECLINED"\}/);
    assert.notEqual(before, after);
  });

  test('counts an approved purchase', async () => {
    const car = await request(app)
      .post('/api/v1/cars')
      .set('X-Admin-Key', (process.env.ADMIN_API_KEY = 'metrics-test-key'))
      .send({ make: 'Test', model: 'MetricsCar', year: 2024, price: 30000 });
    await request(app).post('/api/v1/purchases').send({
      carId: car.body.id, buyerName: 'Jane', buyerEmail: 'jane@example.com', creditScore: 750,
    });
    delete process.env.ADMIN_API_KEY;
    const res = await request(app).get('/metrics');
    assert.match(res.text, /purchases_total\{status="APPROVED"\}/);
    assert.match(res.text, /fraud_checks_total\{action="APPROVE"\}/);
  });
});
