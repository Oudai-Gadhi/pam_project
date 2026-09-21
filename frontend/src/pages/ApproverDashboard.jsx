import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { fetchMe } from '../api/client';
import { getGroupsFromToken } from '../context/KeycloakContext';

export default function ApproverDashboard() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const groups = getGroupsFromToken();

  useEffect(() => {
    fetchMe()
      .then(setProfile)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header groups={groups} />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Approver Dashboard</h1>
          <p className="mt-2 text-slate-600">
            Placeholder for Phase 2 — review and approve/deny access requests.
          </p>

          <div className="mt-6 rounded-lg bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-800">Your role: approvers</p>
            <p className="mt-1 text-sm text-slate-600">
              Future: pending request queue, approval workflow, audit trail.
            </p>
          </div>

          {profile && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Backend verification (/api/me)
              </h2>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs text-green-400">
                {JSON.stringify(profile, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-red-600">API error: {error}</p>
          )}
        </div>
      </main>
    </div>
  );
}
