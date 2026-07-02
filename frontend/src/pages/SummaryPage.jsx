import { useEffect, useState } from 'react';
import { api } from '../api';
import StatTile from '../components/StatTile';

const formatPrice = (price) =>
  Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function SummaryPage() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.summary().then(setSummary).catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="container page-transition"><p className="error-text">{error}</p></div>;

  if (!summary) {
    return (
      <div className="container page-transition">
        <h1 className="page-title">Platform summary</h1>
        <div className="stat-grid">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton skeleton-card" />)}
        </div>
      </div>
    );
  }

  const { inventory, sales } = summary;

  return (
    <div className="container page-transition">
      <h1 className="page-title">Platform summary</h1>

      <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>
        Inventory
      </h2>
      <div className="stat-grid">
        <div className="fade-in-up"><StatTile label="Total cars" value={Number(inventory.total)} /></div>
        <div className="fade-in-up" style={{ '--delay': '60ms' }}><StatTile label="Available" value={Number(inventory.available)} /></div>
        <div className="fade-in-up" style={{ '--delay': '120ms' }}><StatTile label="Sold" value={Number(inventory.sold)} /></div>
      </div>

      <h2 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--text-secondary)' }}>
        Sales (approved)
      </h2>
      <div className="stat-grid">
        <div className="fade-in-up"><StatTile label="Total sales" value={Number(sales.total)} /></div>
        <div className="fade-in-up" style={{ '--delay': '60ms' }}><StatTile label="Revenue" value={Number(sales.revenue)} format={formatPrice} /></div>
        <div className="fade-in-up" style={{ '--delay': '120ms' }}><StatTile label="Average price" value={Number(sales.avg_price)} format={formatPrice} /></div>
      </div>
    </div>
  );
}
