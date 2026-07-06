import { useEffect, useRef, useState } from 'react';
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
  const drawerRef = useRef(null);

  // Close the drawer whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  // While the drawer is open: lock body scroll, close on Escape, and move
  // keyboard focus into the panel so tabbing lands on the nav links.
  useEffect(() => {
    if (!menuOpen) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    drawerRef.current?.querySelector('a')?.focus();

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <div
        className="navbar"
        style={{
          opacity,
          visibility: opacity < 0.05 ? 'hidden' : 'visible',
          // Clickable as soon as it's not hidden, rather than waiting for it to
          // be nearly opaque — the original 0.5 threshold left the hamburger
          // (mobile's only nav entry point) locked out for most of the intro
          // scroll. This doesn't touch the fade curve itself, just how early
          // the already-appearing bar responds to input.
          pointerEvents: opacity < 0.05 ? 'none' : 'auto',
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
          className={`navbar-hamburger${menuOpen ? ' is-open' : ''}`}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="navbar-drawer"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {/* Drawer + backdrop live OUTSIDE .navbar on purpose: the bar's
          backdrop-filter makes it a containing block for position:fixed, which
          would otherwise pin these to the bar instead of the viewport. */}
      <div
        className={`navbar-backdrop${menuOpen ? ' is-open' : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <nav
        id="navbar-drawer"
        ref={drawerRef}
        className={`navbar-drawer${menuOpen ? ' is-open' : ''}`}
        aria-label="Site menu"
        inert={!menuOpen}
      >
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>{link.label}</NavLink>
        ))}
      </nav>
    </>
  );
}
