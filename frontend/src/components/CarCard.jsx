import { Link } from 'react-router-dom';
import CarPhoto from './CarPhoto';

const formatPrice = (price) =>
  Number(price).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export default function CarCard({ car, style }) {
  return (
    <Link to={`/cars/${car.id}`} className="card car-card fade-in-up" style={style}>
      <div className="car-card-media">
        <CarPhoto car={car} className="car-illustration" />
      </div>
      <div className="car-card-body">
        <p className="car-card-title">{car.year} {car.make} {car.model}</p>
        <p className="car-card-meta">{car.color} · {Number(car.mileage).toLocaleString()} mi</p>
        <p className="car-card-price">{formatPrice(car.price)}</p>
      </div>
    </Link>
  );
}
