import { Navigate, useLocation } from 'react-router-dom';
import { useKeycloak } from '../context/KeycloakContext';

/**
 * Waits for Keycloak init() before deciding auth state.
 * Rendering children too early causes the classic redirect loop.
 */
export default function ProtectedRoute({ children }) {
  const { initialized, authenticated } = useKeycloak();
  const location = useLocation();

  if (!initialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-pam-500 border-t-transparent" />
          <p className="text-sm text-slate-600">Checking session…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
