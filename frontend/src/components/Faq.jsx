const ITEMS = [
  {
    q: 'Is this a real lender?',
    a: 'No — this is a demo fintech marketplace. The credit checks, fraud scoring, and loan math are real logic running against a real database, but no actual credit bureau or bank is involved.',
  },
  {
    q: 'How is my interest rate decided?',
    a: 'Your credit score maps to one of five tiers (EXCELLENT through DECLINED), each with a fixed APR. See the rate table above — there is no hidden markup on top of it.',
  },
  {
    q: 'What triggers a fraud review?',
    a: 'A loan amount over $80,000, a down payment under 5% of the vehicle price, or a down payment that exceeds the price all raise the risk score. High risk blocks the purchase; moderate risk approves it as pending review instead of an automatic pass.',
  },
  {
    q: 'Can I change my down payment or loan term?',
    a: 'Yes — the purchase form lets you set a custom down payment and choose a term from 36 to 72 months before you submit.',
  },
];

export default function Faq() {
  return (
    <div className="faq-list">
      {ITEMS.map((item) => (
        <details key={item.q} className="card faq-item">
          <summary>{item.q}</summary>
          <p className="card-copy">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
