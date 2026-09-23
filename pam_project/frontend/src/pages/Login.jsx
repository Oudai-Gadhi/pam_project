import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useKeycloak } from '../context/KeycloakContext';
import { loginWithKeycloak } from '../keycloak';
import { getAppConfig } from '../config';

function getHostMismatchWarning(keycloakUrl) {
  try {
    const kcHost = new URL(keycloakUrl).hostname;
    const pageHost = window.location.hostname;
    if (kcHost !== pageHost && pageHost !== 'localhost' && pageHost !== '127.0.0.1') {
      return (
        `Wrong Keycloak host: config points to "${kcHost}" but you opened this app as "${pageHost}". ` +
        `On the VM run: ./scripts/setup-env.sh ${pageHost} && docker compose up -d --force-recreate frontend`
      );
    }
  } catch {
    /* ignore invalid URL */
  }
  return null;
}

export default function Login() {
  const { initialized, authenticated, initError } = useKeycloak();
  const [loginError, setLoginError] = useState(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const config = getAppConfig();
  const hostMismatch = config.keycloakUrl ? getHostMismatchWarning(config.keycloakUrl) : null;

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

  const handleLogin = async () => {
    if (hostMismatch) {
      setLoginError(hostMismatch);
      return;
    }

    setLoginError(null);
    setIsRedirecting(true);

    try {
      await loginWithKeycloak();
    } catch (error) {
      setIsRedirecting(false);
      setLoginError(error?.message || 'Login failed — check Keycloak configuration.');
    }
  };

  const displayError = loginError || initError || hostMismatch;

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

        {displayError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {displayError}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={isRedirecting}
          className="w-full rounded-lg bg-pam-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-pam-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRedirecting ? 'Redirecting to Keycloak…' : 'Sign in with Keycloak'}
        </button>

        <div className="mt-6 space-y-1 text-center text-xs text-slate-500">
          <p>Keycloak: {config.keycloakUrl || 'not configured'}</p>
          <p>This page: {window.location.origin}</p>
          <p>Realm: {config.keycloakRealm} · Client: {config.keycloakClientId}</p>
        </div>
      </div>
    </div>
  );
}
