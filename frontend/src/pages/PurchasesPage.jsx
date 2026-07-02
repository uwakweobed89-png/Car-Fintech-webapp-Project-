import { useEffect, useState } from 'react';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';

const formatPrice = (price) =>
  Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.listPurchases()
      .then((data) => setPurchases(data.purchases))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="container page-transition">
      <h1 className="page-title">Purchases</h1>
      {loading && <div className="skeleton" style={{ height: 240 }} />}
      {error && <p className="error-text">{error}</p>}
      {!loading && !error && purchases.length === 0 && <p className="muted">No purchases yet.</p>}

      {!loading && purchases.length > 0 && (
        <div className="card fade-in-up" style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Car</th>
                <th>Price</th>
                <th>Monthly</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{p.buyerName || p.buyer_name}</td>
                  <td>{p.car || `${p.year || ''} ${p.make || ''} ${p.model || ''}`}</td>
                  <td>{formatPrice(p.purchasePrice ?? p.purchase_price)}</td>
                  <td>{formatPrice(p.monthlyPayment ?? p.monthly_payment)}</td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
