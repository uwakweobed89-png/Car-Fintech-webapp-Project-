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
