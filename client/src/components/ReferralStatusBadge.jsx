export default function ReferralStatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}
