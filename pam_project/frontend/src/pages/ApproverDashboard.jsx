import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { decideAccessRequest, listPendingRequests } from '../api/client';
import { getGroupsFromToken } from '../context/KeycloakContext';

export default function ApproverDashboard() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);
  const [comments, setComments] = useState({});
  const groups = getGroupsFromToken();

  useEffect(() => {
    listPendingRequests()
      .then(setRequests)
      .catch((err) => setError(err.message));
  }, []);

  const decide = async (request, approved) => {
    const comment = comments[request.id] || '';
    if (comment.trim().length < 3) { setError('A decision comment of at least 3 characters is required.'); return; }
    try {
      await decideAccessRequest(request.id, { approved, comment });
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setError(null);
    } catch (err) { setError(err.response?.data?.detail || err.message); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header groups={groups} />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Approver Dashboard</h1>
          <p className="mt-2 text-slate-600">Review pending privileged-access requests. The broker prevents approving your own request.</p>
          <div className="mt-6 space-y-4">
            {requests.length === 0 && <p className="text-sm text-slate-500">No pending requests.</p>}
            {requests.map((request) => <article key={request.id} className="rounded-xl border border-slate-200 p-5"><p className="font-semibold">{request.target_system} · {request.requested_role}</p><p className="mt-1 text-sm text-slate-600">Requested by {request.requester_username} for {request.duration_minutes} minutes</p><p className="mt-3 text-sm">{request.justification}</p><textarea value={comments[request.id] || ''} onChange={(e) => setComments({ ...comments, [request.id]: e.target.value })} placeholder="Required decision comment" className="mt-4 min-h-20 w-full rounded border border-slate-300 px-3 py-2 text-sm" /><div className="mt-3 flex gap-3"><button onClick={() => decide(request, true)} className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Approve</button><button onClick={() => decide(request, false)} className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white">Reject</button></div></article>)}
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600">API error: {error}</p>
          )}
        </div>
      </main>
    </div>
  );
}
