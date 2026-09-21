const styles = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function RequestStatus({ status }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status] || 'bg-slate-100 text-slate-700'}`}>{status}</span>;
}
