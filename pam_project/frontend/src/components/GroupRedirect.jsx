import { Navigate } from 'react-router-dom';
import { getGroupsFromToken, useKeycloak } from '../context/KeycloakContext';

/**
 * Routes authenticated users to the correct dashboard based on JWT group claims.
 * Users in both groups are sent to the role picker instead of auto-picking one.
 */
export default function GroupRedirect() {
  const { initialized, authenticated } = useKeycloak();

  if (!initialized) {
    return null;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  const groups = getGroupsFromToken();
  const isUser = groups.includes('pam_users');
  const isApprover = groups.includes('approvers');

  if (isUser && isApprover) {
    return <Navigate to="/role-picker" replace />;
  }
  if (isUser) {
    return <Navigate to="/dashboard/user" replace />;
  }
  if (isApprover) {
    return <Navigate to="/dashboard/approver" replace />;
  }

  return <Navigate to="/unauthorized" replace />;
}
