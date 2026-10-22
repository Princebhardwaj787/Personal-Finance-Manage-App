import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import Layout from '../components/layout/Layout';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import Profile from '../pages/Profile';
import Accounts from '../pages/Accounts';
import Categories from '../pages/Categories';
import Transactions from '../pages/Transactions';
import BudgetPage from '../pages/BudgetPage';
import SavingsGoals from '../pages/SavingsGoals';
import RecurringExpenses from '../pages/RecurringExpenses';
import Transfers from '../pages/Transfers';
import Reports from '../pages/Reports';
import Notifications from '../pages/Notifications';
import NotificationSettings from '../pages/settings/NotificationSettings';
import BackupSettings from '../pages/settings/BackupSettings';

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

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
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
