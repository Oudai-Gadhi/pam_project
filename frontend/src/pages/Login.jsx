import { Navigate } from 'react-router-dom';
import { useKeycloak } from '../context/KeycloakContext';

export default function Login() {
  const { initialized, authenticated, keycloak } = useKeycloak();

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }

  if (authenticated) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = () => {
    keycloak.login({ redirectUri: window.location.origin });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-pam-900 to-slate-800 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-pam-500 text-2xl font-bold text-white">
            P
          </div>
          <h1 className="text-2xl font-bold text-slate-900">PAM Platform</h1>
          <p className="mt-2 text-sm text-slate-600">
            Privileged Access Management — Phase 1
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogin}
          className="w-full rounded-lg bg-pam-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pam-700"
        >
          Sign in with Keycloak
        </button>

        <p className="mt-6 text-center text-xs text-slate-500">
          MFA (TOTP) is enforced by your identity provider.
        </p>
      </div>
    </div>
  );
}
