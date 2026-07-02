import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/', end: true, label: 'Home' },
  { to: '/browse', label: 'Browse' },
  { to: '/loan-calculator', label: 'Loan Calculator' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export default function NavBar({ opacity = 1 }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div
      className="navbar"
      style={{
        opacity,
        visibility: opacity < 0.05 ? 'hidden' : 'visible',
        pointerEvents: opacity < 0.5 ? 'none' : 'auto',
        transition: 'opacity 0.15s ease',
      }}
    >
      <NavLink to="/" className="navbar-brand">Car$ync</NavLink>

      <nav className="navbar-links navbar-links-desktop">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>{link.label}</NavLink>
        ))}
      </nav>

      <button
        type="button"
        className="navbar-hamburger"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>

      {menuOpen && (
        <nav className="navbar-links navbar-links-mobile">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>{link.label}</NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
