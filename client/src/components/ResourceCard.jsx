import StaleFlag from './StaleFlag';

// Turns a time into a short "how long ago" phrase.
function timeAgo(time) {
  const minutes = Math.floor((Date.now() - new Date(time).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

export default function ResourceCard({ type, quantity, stale, updatedAt }) {
  return (
    <div className="resource">
      <span>{type}</span>
      <span className="quantity">{quantity}</span>
      {updatedAt && <small>Updated {timeAgo(updatedAt)}</small>}
      {stale && <StaleFlag />}
    </div>
  );
}
