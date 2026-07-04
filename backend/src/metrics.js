const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const purchasesTotal = new client.Counter({
  name: 'purchases_total',
  help: 'Total purchase attempts by final status',
  labelNames: ['status'],
  registers: [register],
});

const creditChecksTotal = new client.Counter({
  name: 'credit_checks_total',
  help: 'Total credit checks by resulting tier',
  labelNames: ['tier'],
  registers: [register],
});

const fraudChecksTotal = new client.Counter({
  name: 'fraud_checks_total',
  help: 'Total fraud checks by action taken',
  labelNames: ['action'],
  registers: [register],
});

module.exports = { register, httpRequestDuration, purchasesTotal, creditChecksTotal, fraudChecksTotal };
