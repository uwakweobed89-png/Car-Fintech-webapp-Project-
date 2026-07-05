// Drives realistic traffic against the backend so Prometheus/Grafana have
// real, varying data instead of flat empty graphs. Run against a
// port-forwarded backend Service (see README) or in-cluster as a Job.

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:8080';

const CREDIT_SCORES = [800, 750, 700, 650, 600, 550]; // spans EXCELLENT..DECLINED
const DOWN_PAYMENT_FRACTIONS = [0.2, 0.05, 0.01, 1.5]; // normal, low, very low (REVIEW), exceeds price (BLOCK)

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function browseCars() {
  const res = await fetch(`${BASE_URL}/api/v1/cars`);
  const body = await res.json();
  return body.cars;
}

async function attemptPurchase(car) {
  const creditScore = randomFrom(CREDIT_SCORES);
  const downPayment = Math.round(car.price * randomFrom(DOWN_PAYMENT_FRACTIONS));
  await fetch(`${BASE_URL}/api/v1/purchases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      carId: car.id,
      buyerName: 'Load Test Buyer',
      buyerEmail: 'loadtest@example.com',
      creditScore,
      downPayment,
    }),
  });
}

async function tick() {
  try {
    const cars = await browseCars();
    if (cars.length) {
      await attemptPurchase(randomFrom(cars));
    }
    await fetch(`${BASE_URL}/api/v1/summary`);
  } catch (err) {
    console.error('tick failed:', err.message);
  }
}

async function main() {
  console.log(`Generating traffic against ${BASE_URL} — Ctrl-C to stop`);
  setInterval(tick, 1000);
}

main();
