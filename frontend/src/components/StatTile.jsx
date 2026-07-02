import AnimatedNumber from './AnimatedNumber';

export default function StatTile({ label, value, format }) {
  const isNumeric = typeof value === 'number' && !Number.isNaN(value);

  return (
    <div className="card stat-tile">
      <p className="stat-label">{label}</p>
      <p className="stat-value">
        {isNumeric ? <AnimatedNumber value={value} format={format} /> : value}
      </p>
    </div>
  );
}
