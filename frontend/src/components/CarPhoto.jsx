import { useState } from 'react';
import CarIllustration from './CarIllustration';

// Real photo first; if it 404s or fails to load for any reason, fall back to
// the SVG illustration rather than showing a broken image.
export default function CarPhoto({ car, className = '' }) {
  const [failed, setFailed] = useState(false);

  if (failed || !car.image_url) {
    return <CarIllustration color={car.color} className={className} />;
  }

  return (
    <img
      src={car.image_url}
      alt={`${car.year} ${car.make} ${car.model}`}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
