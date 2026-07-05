# Load generator

Drives realistic traffic (browsing cars, submitting purchases with varying
credit scores and down payments) against the backend so the Grafana
dashboard in `k8s/apps/monitoring/` has real, varying data to show instead
of flat empty graphs.

Requires Node 18+ (uses the global `fetch`).

> **Heads-up:** `npm start` below submits real purchases and mutates the
> shared production database — see "Note on the shared database". For a
> safe dashboard demo that touches no data, use the read-only snippet in
> that section instead.

## Usage

1. Port-forward the backend Service:
   `kubectl port-forward svc/backend -n backend 8080:8080`
2. In another terminal:
   `cd k8s/load-generator && BACKEND_URL=http://localhost:8080 npm start`
3. Watch the Grafana dashboard update in near-real-time.
4. Stop with Ctrl-C when done — verify the dashboard's graphs flatten out
   again shortly after, confirming the data was live, not static.

## Note on the shared database

The EKS `backend` Deployment reuses the same `car-fintech/rds/credentials`
secret — and therefore the same RDS database — as the live ECS/CloudFront
deployment. Submitting purchases through this generator **writes real rows**
to that shared database: it inserts `Load Test Buyer` purchase records and
flips the `available` flag on real cars to `false`, which is visible on the
live site. There are only ~13 seeded cars, so a sustained run depletes them
and later purchase attempts return `404 Car not found or already sold`
(harmless — HTTP/runtime metrics keep flowing regardless).

To generate load **without** mutating the shared database, hit only the
read endpoints, e.g.:

```bash
BACKEND_URL=http://localhost:8080 node -e '
const B = process.env.BACKEND_URL;
setInterval(async () => {
  try { await fetch(`${B}/api/v1/cars`); await fetch(`${B}/api/v1/summary`); }
  catch (e) { console.error(e.message); }
}, 500);
console.log("read-only traffic against", B);
'
```

This still exercises the HTTP-request-rate, event-loop-lag, GC, and
container-CPU-throttling panels; only the "Purchases by outcome" panel needs
the write path above.
