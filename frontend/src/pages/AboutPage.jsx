import { Link } from 'react-router-dom';
import Reveal from '../components/Reveal';
import Faq from '../components/Faq';

const RATE_TABLE = [
  { tier: 'EXCELLENT', range: '750+',      apr: '3.9%' },
  { tier: 'GOOD',      range: '700 – 749', apr: '5.9%' },
  { tier: 'FAIR',      range: '650 – 699', apr: '8.9%' },
  { tier: 'POOR',      range: '600 – 649', apr: '12.9%' },
  { tier: 'DECLINED',  range: 'below 600', apr: '—' },
];

const VALUES = [
  {
    title: 'Transparent by default',
    copy: 'Every rate, fee, and fraud flag is visible to you before you submit an application — never buried in fine print.',
  },
  {
    title: 'Decisions in seconds',
    copy: 'Our underwriting engine runs a credit check and fraud scan the moment you apply. No waiting on a callback.',
  },
  {
    title: 'Built to say yes fairly',
    copy: 'Five credit tiers, priced by risk, mean more buyers qualify — without hiding the real cost of a bad rate.',
  },
];

export default function AboutPage() {
  return (
    <div className="container page-transition" style={{ paddingTop: 32 }}>
      <Reveal as="div" className="section-header" style={{ margin: '0 auto 48px' }}>
        <p className="section-eyebrow">About us</p>
        <h1 className="page-title" style={{ margin: '0 0 12px' }}>Car buying, run like a fintech</h1>
        <p className="section-subtitle">
          We built Car$ync because financing a car shouldn't require
          a trip to a dealership finance office. Browse real inventory, get a real
          credit decision, and see the real math — all in the same place.
        </p>
      </Reveal>

      <Reveal as="section" className="section" style={{ paddingTop: 0 }}>
        <div className="feature-grid">
          {VALUES.map((v, i) => (
            <Reveal key={v.title} as="div" delay={i * 100} className="card feature-card">
              <p className="card-title">{v.title}</p>
              <p className="card-copy">{v.copy}</p>
            </Reveal>
          ))}
        </div>
      </Reveal>

      <Reveal as="section" className="card" style={{ padding: 32, marginBottom: 32 }}>
        <p className="card-title" style={{ fontSize: 18, marginBottom: 12 }}>How underwriting works</p>
        <p className="card-copy" style={{ marginBottom: 20 }}>
          Credit score maps to one of five tiers, each with its own fixed rate — no
          hidden markup on top. Every purchase also runs through fraud scoring: an
          unusually large loan, a down payment under 5% of the price, or a down
          payment exceeding the price all raise the risk score. A high score blocks
          the purchase outright; a moderate score approves it as <em>pending review</em>
          instead of an automatic pass.
        </p>
        <table>
          <thead>
            <tr><th>Credit tier</th><th>Score range</th><th>APR</th></tr>
          </thead>
          <tbody>
            {RATE_TABLE.map((r) => (
              <tr key={r.tier}>
                <td>{r.tier}</td>
                <td>{r.range}</td>
                <td>{r.apr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>

      <Reveal as="section" className="section-header" style={{ margin: '0 auto 24px' }}>
        <p className="section-eyebrow">FAQ</p>
        <h2 className="section-title">Common questions</h2>
      </Reveal>
      <Reveal as="div" style={{ marginBottom: 64 }}>
        <Faq />
      </Reveal>

      <Reveal as="div" className="cta-banner">
        <h2>See it for yourself</h2>
        <p>Run a real purchase through credit check and fraud scoring in under a minute.</p>
        <Link to="/browse"><button className="btn-lg">Browse inventory</button></Link>
      </Reveal>
    </div>
  );
}
