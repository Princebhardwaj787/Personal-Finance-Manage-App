import { createContext, useContext } from 'react';

/**
 * The auth context object and its consumer hook.
 *
 * This module intentionally exports no components — the AuthProvider
 * component lives in ./AuthProvider.jsx so React Fast Refresh keeps a clean
 * boundary (and so the filenames never collide on case-insensitive
 * filesystems).
 */
export const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
