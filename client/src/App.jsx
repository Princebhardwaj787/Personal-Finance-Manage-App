import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import { initNativeRuntime, addBackHandler } from './services/nativeRuntime';
import { isNativePlatform } from './services/platform';

/**
 * The routes the app can leave from. Pressing back on any of them closes
 * the app instead of navigating to a dead end.
 */
const ROOT_ROUTES = ['/dashboard', '/transactions'];

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Start the native integrations (status bar, splash, back button).
  useEffect(() => {
    initNativeRuntime({
      onExit: () => {
        // On the root screen the back button closes the app.
        if (typeof window !== 'undefined' && window.App?.exitApp) {
          window.App.exitApp();
        }
      }
    });
  }, []);

  /**
   * App-level back handling: go back through the app's own history, and
   * only exit when there is nowhere left to go.
   */
  useEffect(() => {
    if (!isNativePlatform()) return undefined;

    return addBackHandler(() => {
      const isRoot = ROOT_ROUTES.includes(location.pathname);
      if (!isRoot && window.history.length > 1) {
        navigate(-1);
        return true;
      }
      return false; // let the runtime exit the app
    });
  }, [navigate, location.pathname]);

  return <AppRoutes />;
}

export default App;
