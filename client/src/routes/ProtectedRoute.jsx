import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Loading from '../components/ui/Loading';
import Button from '../components/forms/Button';

/**
 * Guards the authenticated area.
 *
 * WEB: redirects to the sign-in screen when there is no session.
 *
 * ANDROID: there is no sign-in screen — the app is local-only. If the
 * on-device database could not be opened, the user must SEE that (and be
 * able to retry) rather than being bounced between /login and /dashboard
 * forever.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, error, isNative, reload } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loading fullScreen />;
  }

  if (error && isNative) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-danger-200 shadow-sm p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            The local database could not be opened
          </h1>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <p className="text-xs text-gray-500 mb-5">
            Your financial records are stored on this device. Nothing has been
            changed. If this keeps happening, restart the app.
          </p>
          <Button variant="primary" onClick={reload}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
