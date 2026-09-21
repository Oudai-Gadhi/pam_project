import Header from '../components/Header';
import { getGroupsFromToken } from '../context/KeycloakContext';

export default function Unauthorized() {
  const groups = getGroupsFromToken();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header groups={groups} />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-red-700">Unauthorized</h1>
          <p className="mt-2 text-slate-600">
            Your account is authenticated but not assigned to any PAM role.
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Required groups: <code className="rounded bg-slate-100 px-1">pam_users</code> or{' '}
            <code className="rounded bg-slate-100 px-1">approvers</code>
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Contact your administrator to be added to the appropriate Keycloak group.
          </p>
        </div>
      </main>
    </div>
  );
}
