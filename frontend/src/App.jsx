import { useEffect, useRef, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import NavBar from './components/NavBar';
import Footer from './components/Footer';
import IntroLogoMorph from './components/IntroLogoMorph';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import CarsPage from './pages/CarsPage';
import CarDetailPage from './pages/CarDetailPage';
import LoanCalculatorPage from './pages/LoanCalculatorPage';
import PurchasesPage from './pages/PurchasesPage';
import SummaryPage from './pages/SummaryPage';
import { INTRO_SCROLL_DISTANCE as SCROLL_DISTANCE } from './constants';

export default function App() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const [progress, setProgress] = useState(isHome ? 0 : 1);
  const tickingRef = useRef(false);

  useEffect(() => {
    if (!isHome) {
      setProgress(1);
      return undefined;
    }

    setProgress(Math.min(window.scrollY / SCROLL_DISTANCE, 1));

    const onScroll = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        setProgress(Math.min(window.scrollY / SCROLL_DISTANCE, 1));
        tickingRef.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  return (
    <>
      <NavBar opacity={isHome ? Math.max(0, (progress - 0.7) / 0.3) : 1} />
      {isHome && <IntroLogoMorph progress={progress} />}
      <Routes>
        <Route path="/" element={<HomePage introProgress={progress} />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/browse" element={<CarsPage />} />
        <Route path="/cars/:id" element={<CarDetailPage />} />
        <Route path="/loan-calculator" element={<LoanCalculatorPage />} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/summary" element={<SummaryPage />} />
      </Routes>
      <Footer />
    </>
  );
}
