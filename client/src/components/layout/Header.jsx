import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from '../notifications/NotificationBell';

export default function Header({ onMenuClick }) {
  const location = useLocation();
  const { user } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const pageTitles = {
    '/dashboard': 'Dashboard',
    '/income': 'Income',
    '/expenses': 'Expenses',
    '/budgets': 'Budgets',
    '/savings-goals': 'Savings Goals',
    '/recurring-expenses': 'Recurring Expenses',
    '/analytics': 'Analytics',
    '/accounts': 'Accounts',
    '/categories': 'Categories',
    '/transactions': 'Transactions',
    '/profile': 'Profile',
    '/notifications': 'Notifications',
    '/settings/notifications': 'Notification Settings'
  };

  const getPageTitle = () => {
    for (const [path, title] of Object.entries(pageTitles)) {
      if (location.pathname === path || (path !== '/dashboard' && location.pathname.startsWith(path))) {
        return title;
      }
    }
    return 'Finance Manager';
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 safe-area-top">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 -ml-2 text-gray-400 hover:text-gray-600"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <Link to="/dashboard" className="ml-2 lg:ml-0 text-xl font-bold text-primary-600">
            Finance
          </Link>
        </div>

        <div className="flex-1 lg:flex-none">
          <h1 className="text-lg font-semibold text-gray-900 lg:hidden">{getPageTitle()}</h1>
        </div>

        <div className="flex items-center space-x-4">
          <NotificationBell />
          <div className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              aria-expanded={profileOpen}
              aria-haspopup="true"
            >
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-sm font-medium text-primary-700">
                  {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="hidden sm:block text-sm font-medium text-gray-700">
                {user?.name || 'User'}
              </span>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-50">
                <Link
                  to="/profile"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={() => setProfileOpen(false)}
                >
                  Profile
                </Link>
                <button
                  onClick={() => setProfileOpen(false)}
                  className="w-full text-left px-4 py-2 text-sm text-danger-600 hover:bg-gray-100"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}