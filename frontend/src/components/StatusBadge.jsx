const STATUS_MAP = {
  APPROVED:        { color: 'var(--status-good)', label: 'Approved' },
  PENDING_REVIEW:  { color: 'var(--status-warning)', label: 'Pending review' },
  DECLINED:        { color: 'var(--status-critical)', label: 'Declined' },
  BLOCKED:         { color: 'var(--status-critical)', label: 'Blocked' },
};

export default function StatusBadge({ status }) {
  const entry = STATUS_MAP[status] || { color: 'var(--text-muted)', label: status };
  return (
    <span className="badge">
      <span className="badge-dot" style={{ background: entry.color }} aria-hidden="true" />
      {entry.label}
    </span>
  );
}
