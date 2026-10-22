/**
 * NATIVE RUNTIME INTEGRATION (Android conversion — Phase E)
 * ======================================================
 * Wires the Android platform behaviours the app needs:
 *   - the hardware BACK button navigates the app, and exits on the root
 *     screen (instead of the WebView going blank);
 *   - the status bar is styled to match the app and its insets are exposed
 *     to CSS through `env(safe-area-inset-*)`;
 *   - the splash screen is hidden once the first screen is ready;
 *   - the keyboard resizes the layout instead of covering the form.
 *
 * Everything is optional: when the Capacitor plugins are absent (the web
 * build) the module does nothing.
 */

import { isNativePlatform } from './platform';

let backHandler = null;
let listeners = [];

/**
 * Start the native integrations.
 *
 * @param {object} [options]
 * @param {() => void} [options.onExit] called when the user presses back on
 *        the root screen (the app then closes).
 */
export const initNativeRuntime = async ({ onExit } = {}) => {
  if (!isNativePlatform()) return;

  try {
    const { App } = await import('@capacitor/app');
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const { SplashScreen } = await import('@capacitor/splash-screen');
    const { Keyboard } = await import('@capacitor/keyboard');

    // The status bar matches the app's primary colour and the WebView draws
    // behind it (the header adds the top safe-area padding).
    try {
      await StatusBar.setStyle({ style: Style.Light });
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
      await StatusBar.setOverlaysWebView({ overlay: true });
    } catch {
      // Some devices/versions do not allow the background colour; the
      // overlay setting above is the important one.
    }

    // The keyboard must resize the WebView, otherwise a form field at the
    // bottom of the screen is hidden behind the keyboard.
    try {
      await Keyboard.setScroll({ isScroll: true });
    } catch {
      // Not fatal — and `setAccessoryBarVisible` is iOS-only, so it is
      // deliberately not called here.
    }

    // Hide the splash screen once the app is painted.
    setTimeout(() => {
      SplashScreen.hide().catch(() => {});
    }, 300);

    // The hardware back button.
    backHandler = await App.addListener('backButton', () => {
      // Let the app's own router handle it first.
      const handled = listeners.reduce((wasHandled, listener) => {
        if (wasHandled) return true;
        return listener() !== false;
      }, false);

      if (!handled) {
        onExit?.();
      }
    });
  } catch {
    // A missing plugin must never stop the app from starting.
  }
};

/**
 * Register a back-button handler.
 *
 * Handlers are called most-recently-registered first, so the topmost piece
 * of UI (a modal, then the drawer) gets the chance to close itself before
 * the app navigates.
 *
 * @param {() => boolean|void} handler return `false` to say "not handled".
 * @returns {() => void} an unsubscribe function
 */
export const addBackHandler = (handler) => {
  listeners.unshift(handler);
  return () => {
    listeners = listeners.filter((listener) => listener !== handler);
  };
};

/** Remove the native listeners (used when the app is torn down). */
export const disposeNativeRuntime = async () => {
  if (backHandler) {
    await backHandler.remove();
    backHandler = null;
  }
  listeners = [];
};

export default initNativeRuntime;
