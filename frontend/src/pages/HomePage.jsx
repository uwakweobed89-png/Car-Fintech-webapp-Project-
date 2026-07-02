import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import CarCard from '../components/CarCard';
import Reveal from '../components/Reveal';
import AnimatedNumber from '../components/AnimatedNumber';
import { INTRO_SCROLL_DISTANCE } from '../constants';

const formatPrice = (price) =>
  Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const lerp = (a, b, t) => a + (b - a) * t;

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="2"/></svg>
);
const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2 3 6v6c0 5 4 8.5 9 10 5-1.5 9-5 9-10V6l-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
);
const BoltIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
);

const STEPS = [
  {
    title: 'Browse the lot',
    copy: 'Filter by make, price, or availability across a hand-picked inventory — from daily drivers to certified sports cars.',
  },
  {
    title: 'Get an instant decision',
    copy: 'Enter your credit score and down payment. Our engine runs a real credit check and fraud scan in under a second.',
  },
  {
    title: 'Drive away financed',
    copy: 'Approved offers show your exact monthly payment, interest rate, and total cost up front — no surprises at signing.',
  },
];

const FEATURES = [
  {
    title: 'Instant credit decisions',
    copy: 'Five-tier underwriting from EXCELLENT to DECLINED, priced transparently by credit score.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2 3 6v6c0 5 4 8.5 9 10 5-1.5 9-5 9-10V6l-9-4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    ),
  },
  {
    title: 'Built-in fraud protection',
    copy: 'Every purchase is screened for loan-amount, down-payment, and pricing red flags before it is approved.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 8v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="16" r="1" fill="currentColor"/></svg>
    ),
  },
  {
    title: 'Transparent pricing',
    copy: 'See your exact rate, monthly payment, and total interest before you ever submit an application.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 19V5a1 1 0 0 1 1-1h11l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
    ),
  },
];

export default function HomePage({ introProgress = 1 }) {
  const [summary, setSummary] = useState(null);
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    api.summary().then(setSummary).catch(() => {});
    api.listCars({ available: 'true' }).then((data) => setFeatured(data.cars.slice(0, 4))).catch(() => {});
  }, []);

  const heroCar = featured[0];

  // Fade the hero's own headline in only once the intro wordmark has mostly
  // shrunk out of the way, instead of it sitting underneath the still-large
  // logo — the two should hand off, not collide.
  const heroContentReveal = Math.min(1, Math.max(0, (introProgress - 0.25) / 0.3));

  return (
    <div className="page-transition">
      {/* Sticky "runway": pins the hero in view for exactly as long as the
          intro animation needs to scroll, so the hero — not the section
          below it — is what's on screen the moment the intro finishes. */}
      <div className="hero-pin-wrapper" style={{ height: `calc(100vh + ${INTRO_SCROLL_DISTANCE}px)` }}>
        <section className="hero hero-sticky">
          <div className="hero-blobs">
            <div className="hero-blob-1" />
            <div className="hero-blob-2" />
          </div>
          <div
            className="hero-inner"
            style={{
              opacity: heroContentReveal,
              transform: `translateY(${lerp(16, 0, heroContentReveal)}px)`,
              transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}
          >
            <div className="hero-visual">
              {heroCar && (
                <div className="hero-visual-card">
                  <img src={heroCar.image_url} alt={`${heroCar.year} ${heroCar.make} ${heroCar.model}`} />
                </div>
              )}
            </div>
            <div className="hero-copy">
              <span className="hero-eyebrow">● Instant approvals, real fraud checks</span>
              <h1 className="hero-title">
                Financing your next car <span className="hero-title-accent">shouldn't feel like a loan application.</span>
              </h1>
              <p className="hero-subtitle">
                Browse a curated lot, run a real credit check, and see your exact monthly
                payment — all before you ever talk to a salesperson.
              </p>
              <div className="hero-actions">
                <Link to="/browse"><button className="btn-lg">Browse inventory</button></Link>
                <Link to="/loan-calculator"><button className="btn-lg secondary">Calculate your loan</button></Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      {summary && (
        <div className="stat-bar">
          <Reveal as="div" className="stat-bar-item">
            <div className="stat-bar-value"><AnimatedNumber value={Number(summary.inventory.total)} /></div>
            <div className="stat-bar-label">Cars listed</div>
          </Reveal>
          <Reveal as="div" className="stat-bar-item" delay={60}>
            <div className="stat-bar-value"><AnimatedNumber value={Number(summary.inventory.available)} /></div>
            <div className="stat-bar-label">Available now</div>
          </Reveal>
          <Reveal as="div" className="stat-bar-item" delay={120}>
            <div className="stat-bar-value"><AnimatedNumber value={Number(summary.sales.total)} /></div>
            <div className="stat-bar-label">Cars financed</div>
          </Reveal>
          <Reveal as="div" className="stat-bar-item" delay={180}>
            <div className="stat-bar-value"><AnimatedNumber value={Number(summary.sales.revenue)} format={formatPrice} /></div>
            <div className="stat-bar-label">Total financed</div>
          </Reveal>
        </div>
      )}

      <Reveal as="div" className="trust-strip">
        <span><LockIcon /> Bank-level encryption in transit</span>
        <span><ShieldIcon /> Real-time fraud screening on every purchase</span>
        <span><BoltIcon /> Instant, transparent credit decisions</span>
      </Reveal>

      {featured.length > 0 && (
        <section className="section">
          <Reveal as="div" className="section-header">
            <p className="section-eyebrow">Featured</p>
            <h2 className="section-title">Ready to go now</h2>
            <p className="section-subtitle">A few of what's currently available on the lot.</p>
          </Reveal>
          <div className="grid">
            {featured.map((car, i) => (
              <Reveal key={car.id} as="div" delay={i * 60}>
                <CarCard car={car} />
              </Reveal>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: 32 }}>
            <Link to="/browse"><button className="secondary">View all cars</button></Link>
          </div>
        </section>
      )}

      <section className="section">
        <Reveal as="div" className="section-header">
          <p className="section-eyebrow">How it works</p>
          <h2 className="section-title">Three steps to driving away</h2>
        </Reveal>
        <div className="steps-grid">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} as="div" delay={i * 100} className="card step-card">
              <div className="step-number">{i + 1}</div>
              <p className="card-title">{step.title}</p>
              <p className="card-copy">{step.copy}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="section">
        <Reveal as="div" className="section-header">
          <p className="section-eyebrow">Why us</p>
          <h2 className="section-title">Built like a fintech, not a used-car lot</h2>
        </Reveal>
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} as="div" delay={i * 100} className="card feature-card">
              <div className="feature-icon">{f.icon}</div>
              <p className="card-title">{f.title}</p>
              <p className="card-copy">{f.copy}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal as="div" className="cta-banner">
        <h2>Find your next car today</h2>
        <p>Real inventory, real credit checks, no dealership run-around.</p>
        <Link to="/browse"><button className="btn-lg">Browse inventory</button></Link>
      </Reveal>
    </div>
  );
}
