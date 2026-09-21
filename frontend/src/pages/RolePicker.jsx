import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { getGroupsFromToken } from '../context/KeycloakContext';

export default function RolePicker() {
  const navigate = useNavigate();
  const groups = getGroupsFromToken();

  return (
    <div className="min-h-screen bg-slate-50">
      <Header groups={groups} />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Choose your role</h1>
          <p className="mt-2 text-slate-600">
            You belong to multiple PAM groups. Select which dashboard to open.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {groups.includes('pam_users') && (
              <button
                type="button"
                onClick={() => navigate('/dashboard/user')}
                className="rounded-xl border-2 border-pam-200 bg-pam-50 p-6 text-left transition hover:border-pam-500 hover:shadow-md"
              >
                <h2 className="text-lg font-semibold text-pam-700">User</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Request privileged access to target systems.
                </p>
              </button>
            )}

            {groups.includes('approvers') && (
              <button
                type="button"
                onClick={() => navigate('/dashboard/approver')}
                className="rounded-xl border-2 border-amber-200 bg-amber-50 p-6 text-left transition hover:border-amber-500 hover:shadow-md"
              >
                <h2 className="text-lg font-semibold text-amber-800">Approver</h2>
                <p className="mt-2 text-sm text-slate-600">
                  Review and approve access requests.
                </p>
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
