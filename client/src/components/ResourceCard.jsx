import StaleFlag from './StaleFlag';

export default function ResourceCard({ type, quantity, stale }) {
  return (
    <div>
      <span>{type}</span>
      <span>{quantity}</span>
      {stale && <StaleFlag />}
    </div>
  );
}
