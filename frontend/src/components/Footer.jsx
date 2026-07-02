import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <Link to="/">Home</Link>
        <Link to="/browse">Browse</Link>
        <Link to="/loan-calculator">Loan Calculator</Link>
        <Link to="/about">About</Link>
        <Link to="/contact">Contact</Link>
      </div>
      <div style={{ marginTop: 8 }}>
        <Link to="/purchases">Purchases</Link>
        <Link to="/summary">Platform summary</Link>
      </div>
      <p style={{ marginTop: 12 }}>Car$ync — demo project, not a real lender.</p>
    </footer>
  );
}
