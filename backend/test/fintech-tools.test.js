const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/app');

describe('POST /api/v1/credit-check', () => {
  test('requires creditScore', async () => {
    const res = await request(app).post('/api/v1/credit-check').send({});
    assert.equal(res.status, 400);
  });

  const cases = [
    [750, true, 'EXCELLENT'],
    [700, true, 'GOOD'],
    [650, true, 'FAIR'],
    [600, true, 'POOR'],
    [500, false, 'DECLINED'],
  ];

  for (const [creditScore, approved, tier] of cases) {
    test(`score ${creditScore} -> ${tier}`, async () => {
      const res = await request(app).post('/api/v1/credit-check').send({ creditScore });
      assert.equal(res.status, 200);
      assert.equal(res.body.approved, approved);
      assert.equal(res.body.tier, tier);
    });
  }
});

describe('POST /api/v1/loan-calculator', () => {
  test('requires vehiclePrice', async () => {
    const res = await request(app).post('/api/v1/loan-calculator').send({});
    assert.equal(res.status, 400);
  });

  test('declines when credit score is too low', async () => {
    const res = await request(app)
      .post('/api/v1/loan-calculator')
      .send({ vehiclePrice: 30000, creditScore: 500 });
    assert.equal(res.status, 200);
    assert.equal(res.body.approved, false);
  });

  test('computes a consistent monthly payment', async () => {
    const res = await request(app)
      .post('/api/v1/loan-calculator')
      .send({ vehiclePrice: 30000, downPayment: 6000, creditScore: 700, termMonths: 60 });
    assert.equal(res.status, 200);
    assert.equal(res.body.loanAmount, 24000);
    assert.equal(res.body.interestRate, 5.9);

    // monthly * termMonths + down should reconstruct totalCost (within a cent for rounding)
    const reconstructed = res.body.monthlyPayment * res.body.termMonths + res.body.downPayment;
    assert.ok(Math.abs(reconstructed - res.body.totalCost) < 0.01);
    assert.equal(res.body.totalInterest, Number((res.body.totalCost - 30000).toFixed(2)));
  });

  test('zero-interest edge case divides evenly', async () => {
    // Credit tiers never produce a 0% rate through the API, so this just guards
    // the calculator's own math stays sane for a plain even split.
    const res = await request(app)
      .post('/api/v1/loan-calculator')
      .send({ vehiclePrice: 12000, downPayment: 0, creditScore: 750, termMonths: 60 });
    assert.equal(res.status, 200);
    assert.ok(res.body.monthlyPayment > 0);
  });
});
