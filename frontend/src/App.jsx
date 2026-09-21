import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import GroupRedirect from './components/GroupRedirect';
import { KeycloakProvider } from './context/KeycloakContext';
import Login from './pages/Login';
import UserDashboard from './pages/UserDashboard';
import ApproverDashboard from './pages/ApproverDashboard';
import Unauthorized from './pages/Unauthorized';
import RolePicker from './pages/RolePicker';

export default function App() {
  return (
    <KeycloakProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <GroupRedirect />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/user"
          element={
            <ProtectedRoute>
              <UserDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard/approver"
          element={
            <ProtectedRoute>
              <ApproverDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/role-picker"
          element={
            <ProtectedRoute>
              <RolePicker />
            </ProtectedRoute>
          }
        />

        <Route
          path="/unauthorized"
          element={
            <ProtectedRoute>
              <Unauthorized />
            </ProtectedRoute>
          }
        />
      </Routes>
    </KeycloakProvider>
  );
}
