// '??' (not '||') so an explicitly empty string in production (same-origin,
// proxied through CloudFront) doesn't fall back to the localhost default.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed with ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  listCars: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/api/v1/cars${qs ? `?${qs}` : ''}`);
  },
  getCar: (id) => request(`/api/v1/cars/${id}`),
  createPurchase: (payload) =>
    request('/api/v1/purchases', { method: 'POST', body: JSON.stringify(payload) }),
  listPurchases: () => request('/api/v1/purchases'),
  loanCalculator: (payload) =>
    request('/api/v1/loan-calculator', { method: 'POST', body: JSON.stringify(payload) }),
  creditCheck: (payload) =>
    request('/api/v1/credit-check', { method: 'POST', body: JSON.stringify(payload) }),
  summary: () => request('/api/v1/summary'),
};
