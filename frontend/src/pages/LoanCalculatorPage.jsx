import { useState } from 'react';
import { api } from '../api';
import StatTile from '../components/StatTile';

const formatPrice = (price) =>
  Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const formatPercent = (n) => `${n.toFixed(1)}%`;

const initialForm = { vehiclePrice: '30000', downPayment: '6000', creditScore: '700', termMonths: '60' };

export default function LoanCalculatorPage() {
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.loanCalculator({
        vehiclePrice: Number(form.vehiclePrice),
        downPayment: form.downPayment === '' ? undefined : Number(form.downPayment),
        creditScore: Number(form.creditScore),
        termMonths: Number(form.termMonths),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container page-transition">
      <h1 className="page-title">Loan calculator</h1>
      <form onSubmit={handleSubmit} className="card" style={{ padding: 20, maxWidth: 520 }}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="vehiclePrice">Vehicle price</label>
            <input id="vehiclePrice" type="number" required value={form.vehiclePrice} onChange={handleChange('vehiclePrice')} />
          </div>
          <div className="field">
            <label htmlFor="downPayment">Down payment</label>
            <input id="downPayment" type="number" value={form.downPayment} onChange={handleChange('downPayment')} />
          </div>
          <div className="field">
            <label htmlFor="creditScore">Credit score</label>
            <input id="creditScore" type="number" min="300" max="850" value={form.creditScore} onChange={handleChange('creditScore')} />
          </div>
          <div className="field">
            <label htmlFor="termMonths">Term (months)</label>
            <select id="termMonths" value={form.termMonths} onChange={handleChange('termMonths')}>
              <option value="36">36</option>
              <option value="48">48</option>
              <option value="60">60</option>
              <option value="72">72</option>
            </select>
          </div>
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Calculating…' : 'Calculate'}</button>
      </form>

      {error && <p className="error-text" style={{ marginTop: 16 }}>{error}</p>}

      {result && (
        <div className="stat-grid" style={{ marginTop: 24, maxWidth: 700 }}>
          {result.approved === false ? (
            <div className="card stat-tile fade-in-up" style={{ gridColumn: '1 / -1' }}>
              <p className="error-text">Credit would be declined ({result.creditTier}).</p>
            </div>
          ) : (
            [
              ['Monthly payment', result.monthlyPayment, formatPrice],
              ['Loan amount', result.loanAmount, formatPrice],
              ['Interest rate', result.interestRate, formatPercent],
              ['Total interest', result.totalInterest, formatPrice],
              ['Total cost', result.totalCost, formatPrice],
              ['Credit tier', result.creditTier, undefined],
            ].map(([label, value, format], i) => (
              <div key={label} className="fade-in-up" style={{ '--delay': `${i * 60}ms` }}>
                <StatTile label={label} value={value} format={format} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
