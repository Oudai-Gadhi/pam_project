import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { createAccessRequest, listMyRequests, startAccessSession } from '../api/client';
import { getGroupsFromToken } from '../context/KeycloakContext';
import RequestStatus from '../components/RequestStatus';

export default function UserDashboard() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [connectingId, setConnectingId] = useState(null);
  const [form, setForm] = useState({ target_system: '', requested_role: '', justification: '', duration_minutes: 60 });
  const groups = getGroupsFromToken();

  useEffect(() => {
    listMyRequests()
      .then(setRequests)
      .catch((err) => setError(err.message));
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const request = await createAccessRequest({ ...form, duration_minutes: Number(form.duration_minutes) });
      setRequests((current) => [request, ...current]);
      setForm({ target_system: '', requested_role: '', justification: '', duration_minutes: 60 });
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const connect = async (request) => {
    setConnectingId(request.id);
    setError(null);
    try {
      const { redirect_url: redirectUrl } = await startAccessSession(request.id);
      setRequests((current) => current.map((item) => (
        item.id === request.id ? { ...item, status: 'ACTIVE', connect_issued_at: new Date().toISOString() } : item
      )));
      window.location.assign(redirectUrl);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header groups={groups} />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">User Dashboard</h1>
          <p className="mt-2 text-slate-600">Request time-bounded SSH access to a registered server. A certificate is created only when an approved request starts.</p>

          <form onSubmit={submit} className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-5 sm:grid-cols-2">
            <label className="text-sm font-medium">Target IP address<input required inputMode="numeric" value={form.target_system} onChange={(e) => setForm({ ...form, target_system: e.target.value })} placeholder="192.168.0.176" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium">Target Linux user<input required value={form.requested_role} onChange={(e) => setForm({ ...form, requested_role: e.target.value })} placeholder="oudai" className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium sm:col-span-2">Business justification<textarea required minLength="10" value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} className="mt-1 min-h-24 w-full rounded border border-slate-300 px-3 py-2" /></label>
            <label className="text-sm font-medium">Duration (minutes)<input required type="number" min="15" max="43200" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} className="mt-1 w-full rounded border border-slate-300 px-3 py-2" /></label>
            <div className="flex items-end"><button disabled={submitting} className="rounded bg-pam-600 px-4 py-2 font-medium text-white disabled:opacity-60">{submitting ? 'Submitting…' : 'Submit request'}</button></div>
          </form>

          <h2 className="mt-8 text-lg font-semibold">My requests</h2>
          <div className="mt-3 space-y-3">
            {requests.length === 0 && <p className="text-sm text-slate-500">No access requests submitted yet.</p>}
            {requests.map((request) => <div key={request.id} className="rounded-lg border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{request.target_system} · {request.requested_role}</p><p className="mt-1 text-sm text-slate-600">{request.justification}</p><p className="mt-2 text-xs text-slate-500">{request.duration_minutes} minutes · {new Date(request.created_at).toLocaleString()}</p>{request.decision_comment && <p className="mt-2 text-sm">Decision: {request.decision_comment}</p>}{request.access_expires_at && <p className="mt-2 text-xs text-slate-500">Approval expires: {new Date(request.access_expires_at).toLocaleString()}</p>}{request.status === 'APPROVED' && <button disabled={connectingId === request.id} onClick={() => connect(request)} className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{connectingId === request.id ? 'Creating session…' : 'Connect'}</button>}</div><RequestStatus status={request.status} /></div></div>)}
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600">API error: {error}</p>
          )}
        </div>
      </main>
    </div>
  );
}
