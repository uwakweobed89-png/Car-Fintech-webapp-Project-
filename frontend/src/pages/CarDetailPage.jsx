import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import CarPhoto from '../components/CarPhoto';

const formatPrice = (price) =>
  Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const initialForm = {
  buyerName: '',
  buyerEmail: '',
  downPayment: '',
  creditScore: '700',
  loanTermMonths: '60',
};

export default function CarDetailPage() {
  const { id } = useParams();
  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { ok: bool, data }

  useEffect(() => {
    setLoading(true);
    api.getCar(id)
      .then(setCar)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const payload = {
        carId: Number(id),
        buyerName: form.buyerName,
        buyerEmail: form.buyerEmail,
        creditScore: Number(form.creditScore),
        loanTermMonths: Number(form.loanTermMonths),
      };
      if (form.downPayment !== '') payload.downPayment = Number(form.downPayment);

      const data = await api.createPurchase(payload);
      setResult({ ok: true, data });
      const updated = await api.getCar(id).catch(() => null);
      if (updated) setCar(updated);
    } catch (err) {
      setResult({ ok: false, data: err.body || { error: err.message } });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container page-transition">
        <div className="detail-layout" style={{ marginTop: 32 }}>
          <div className="skeleton" style={{ aspectRatio: '16 / 10', borderRadius: 12 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      </div>
    );
  }
  if (notFound || !car) {
    return (
      <div className="container page-transition">
        <p className="error-text">Car not found.</p>
        <Link to="/">Back to browse</Link>
      </div>
    );
  }

  return (
    <div className="container page-transition">
      <p style={{ marginTop: 32 }}><Link to="/">← Back to browse</Link></p>
      <div className="detail-layout">
        <div>
          <div className="detail-image">
            <CarPhoto car={car} className="car-illustration" />
          </div>
          <h1 className="page-title" style={{ margin: '20px 0 4px' }}>
            {car.year} {car.make} {car.model}
          </h1>
          <p className="muted">{car.color} · {Number(car.mileage).toLocaleString()} mi</p>
          <p className="car-card-price" style={{ fontSize: 22, marginTop: 12 }}>{formatPrice(car.price)}</p>
          {!car.available && <p style={{ marginTop: 8 }}><StatusBadge status="DECLINED" /> <span className="muted">Already sold</span></p>}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 16 }}>Finance this car</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="buyerName">Full name</label>
                <input id="buyerName" required value={form.buyerName} onChange={handleChange('buyerName')} />
              </div>
              <div className="field">
                <label htmlFor="buyerEmail">Email</label>
                <input id="buyerEmail" type="email" required value={form.buyerEmail} onChange={handleChange('buyerEmail')} />
              </div>
              <div className="field">
                <label htmlFor="downPayment">Down payment (default 20%)</label>
                <input id="downPayment" type="number" min="0" value={form.downPayment} onChange={handleChange('downPayment')} />
              </div>
              <div className="field">
                <label htmlFor="creditScore">Credit score</label>
                <input id="creditScore" type="number" min="300" max="850" value={form.creditScore} onChange={handleChange('creditScore')} />
              </div>
              <div className="field">
                <label htmlFor="loanTermMonths">Loan term (months)</label>
                <select id="loanTermMonths" value={form.loanTermMonths} onChange={handleChange('loanTermMonths')}>
                  <option value="36">36</option>
                  <option value="48">48</option>
                  <option value="60">60</option>
                  <option value="72">72</option>
                </select>
              </div>
            </div>
            <button type="submit" disabled={submitting || !car.available}>
              {submitting ? 'Submitting…' : car.available ? 'Submit purchase' : 'Car unavailable'}
            </button>
          </form>

          {result && (
            <div className="card result-box">
              {result.ok ? (
                <>
                  <StatusBadge status={result.data.status || result.data.purchase?.status} />
                  <p style={{ marginTop: 10 }}>
                    Monthly payment: <strong>{formatPrice(result.data.monthlyPayment ?? result.data.purchase?.monthly_payment)}</strong>
                  </p>
                  <p className="muted">Total cost over the loan term: {formatPrice(result.data.totalCost)}</p>
                </>
              ) : (
                <>
                  <StatusBadge status={result.data.flags ? 'BLOCKED' : 'DECLINED'} />
                  <p className="error-text" style={{ marginTop: 10 }}>{result.data.error}</p>
                  {result.data.flags && <p className="muted">Flags: {result.data.flags.join(', ')}</p>}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
