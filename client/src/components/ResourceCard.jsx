import StaleFlag from './StaleFlag';

export default function ResourceCard({ type, quantity, stale }) {
  return (
    <div className="resource">
      <span>{type}</span>
      <span className="quantity">{quantity}</span>
      {stale && <StaleFlag />}
    </div>
  );
}
