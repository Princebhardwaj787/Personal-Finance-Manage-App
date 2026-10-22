import { useState, useEffect, useCallback } from 'react';
import { AuthContext } from './AuthContext';
import { authApi } from '../services/authApi';
import { isNativeBuild } from '../services/platform';
import { initLocalData, LOCAL_USER } from '../data/runtime';

/**
 * AuthProvider owns session state (user, token).
 *
 * WEB: the session is a JWT issued by the Express API and stored in
 * localStorage.
 *
 * ANDROID: there is NO server and NO account — the data lives on the device
 * and belongs to whoever holds the phone. The provider therefore provides a
 * local session: it opens the on-device database and reports a single local
 * user. No login, no password, no token, and nothing to lose.
 *
 * (An optional biometric app lock lives in `AppLock`, not here — see
 * `contexts/AppLock.jsx`.)
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const native = isNativeBuild();

  const loadUser = useCallback(async () => {
    if (native) {
      setError(null);
      try {
        // Open the on-device database before anything reads from it.
        await initLocalData();
        setUser({
          id: LOCAL_USER,
          email: 'local@device',
          name: 'Me',
          isLocal: true
        });
        setToken(null);
        setError(null);
      } catch (initError) {
        setError(
          initError?.message ?? 'The local database could not be opened'
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      try {
        setToken(storedToken);
        const userData = await authApi.getMe(storedToken);
        setUser(userData);
      } catch {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      }
    }
    setLoading(false);
  }, [native]);

  /** Retry the initialisation (used by the "Try again" button). */
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    await loadUser();
  }, [loadUser]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email, password) => {
    if (native) {
      // There is nothing to sign in to on the device.
      return { id: LOCAL_USER, email: 'local@device', name: 'Me', isLocal: true };
    }
    const { user: userData, token: newToken } = await authApi.login(email, password);
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const register = async (email, password, name) => {
    if (native) {
      return { id: LOCAL_USER, email: 'local@device', name: 'Me', isLocal: true };
    }
    const { user: userData, token: newToken } = await authApi.register(email, password, name);
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    if (native) {
      // Locking the app is handled by the app lock; the local session stays.
      return;
    }
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (data) => {
    if (native) {
      const updated = { ...(user ?? {}), ...data, id: LOCAL_USER, isLocal: true };
      setUser(updated);
      return updated;
    }
    const updatedUser = await authApi.updateProfile(data, token);
    setUser(updatedUser);
    return updatedUser;
  };

  const updatePassword = async (currentPassword, newPassword) => {
    if (native) {
      // The device owner is the only user; there is no server-side password.
      return;
    }
    await authApi.updatePassword(currentPassword, newPassword, token);
  };

  const value = {
    user,
    token,
    loading,
    error,
    isNative: native,
    reload,
    login,
    register,
    logout,
    updateProfile,
    updatePassword,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
