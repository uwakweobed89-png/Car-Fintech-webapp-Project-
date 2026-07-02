import { useEffect, useState } from 'react';
import { api } from '../api';
import CarCard from '../components/CarCard';

export default function CarsPage() {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ make: '', maxPrice: '', available: 'true' });

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = {};
    if (filters.make) params.make = filters.make;
    if (filters.maxPrice) params.maxPrice = filters.maxPrice;
    if (filters.available) params.available = filters.available;

    api.listCars(params)
      .then((data) => setCars(data.cars))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <div className="container page-transition">
      <h1 className="page-title">Browse cars</h1>

      <div className="filters">
        <div className="field">
          <label htmlFor="make">Make</label>
          <input
            id="make"
            placeholder="e.g. Toyota"
            value={filters.make}
            onChange={(e) => setFilters((f) => ({ ...f, make: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="maxPrice">Max price</label>
          <input
            id="maxPrice"
            type="number"
            placeholder="e.g. 40000"
            value={filters.maxPrice}
            onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="available">Availability</label>
          <select
            id="available"
            value={filters.available}
            onChange={(e) => setFilters((f) => ({ ...f, available: e.target.value }))}
          >
            <option value="true">Available only</option>
            <option value="">All</option>
          </select>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!loading && !error && cars.length === 0 && <p className="muted">No cars match those filters.</p>}

      <div className="grid">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton skeleton-card" />)
          : cars.map((car, i) => (
              <CarCard key={car.id} car={car} style={{ '--delay': `${Math.min(i, 8) * 40}ms` }} />
            ))}
      </div>
    </div>
  );
}
