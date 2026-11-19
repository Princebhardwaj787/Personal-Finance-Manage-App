import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import Layout from '../components/layout/Layout';
import Login from '../pages/Login';
import Register from '../pages/Register';

const LoadingFallback = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
  </div>
);

// Auth pages are small; load them eagerly.
const Dashboard = lazy(() => import('../pages/Dashboard').then((mod) => ({ default: mod.Default ?? mod })));
const Profile = lazy(() => import('../pages/Profile').then((mod) => ({ default: mod.Default ?? mod })));
const Accounts = lazy(() => import('../pages/Accounts').then((mod) => ({ default: mod.Default ?? mod })));
const Categories = lazy(() => import('../pages/Categories').then((mod) => ({ default: mod.Default ?? mod })));
const Transactions = lazy(() => import('../pages/Transactions').then((mod) => ({ default: mod.Default ?? mod })));
const Transfers = lazy(() => import('../pages/Transfers').then((mod) => ({ default: mod.Default ?? mod })));
const Reports = lazy(() => import('../pages/Reports').then((mod) => ({ default: mod.Default ?? mod })));
const Notifications = lazy(() => import('../pages/Notifications').then((mod) => ({ default: mod.Default ?? mod })));
const BudgetPage = lazy(() => import('../pages/BudgetPage').then((mod) => ({ default: mod.Default ?? mod })));
const SavingsGoals = lazy(() => import('../pages/SavingsGoals').then((mod) => ({ default: mod.Default ?? mod })));
const RecurringExpenses = lazy(() => import('../pages/RecurringExpenses').then((mod) => ({ default: mod.Default ?? mod })));
const NotificationSettings = lazy(() => import('../pages/settings/NotificationSettings').then((mod) => ({ default: mod.Default ?? mod })));
const BackupSettings = lazy(() => import('../pages/settings/BackupSettings').then((mod) => ({ default: mod.Default ?? mod })));

/**
 * On the ANDROID build there is no server and no account, so the sign-in
 * screens do not apply — the app opens straight into the dashboard. The
 * routes are kept (so a shared link still resolves) but they redirect.
 */
function NativeRedirect({ children }) {
  const { isNative } = useAuth();
  if (isNative) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <NativeRedirect>
            <Login />
          </NativeRedirect>
        }
      />
      <Route
        path="/register"
        element={
          <NativeRedirect>
            <Register />
          </NativeRedirect>
        }
      />

      <Route element={
        <Suspense fallback={<LoadingFallback />}>
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        </Suspense>
      }>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/transfers" element={<Transfers />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/settings/notifications" element={<NotificationSettings />} />
        <Route path="/settings/backup" element={<BackupSettings />} />
        {/* Income / Expenses are transaction views filtered by type. */}
        <Route path="/income" element={<Navigate to="/transactions?type=INCOME" replace />} />
        <Route path="/expenses" element={<Navigate to="/transactions?type=EXPENSE" replace />} />
        <Route path="/budgets" element={<BudgetPage />} />
        <Route path="/savings-goals" element={<SavingsGoals />} />
        <Route path="/recurring-expenses" element={<RecurringExpenses />} />
        <Route path="/analytics" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
