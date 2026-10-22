/**
 * PLATFORM DETECTION (Android conversion — Phase D)
 * ================================================
 * One place that answers: "is this the Android app or the web app?"
 *
 * The web build keeps talking to the Express API. The Android build talks to
 * the on-device SQLite database. Every screen above the API layer is
 * identical in both.
 *
 * Detection order:
 *   1. An explicit build flag (`VITE_NATIVE_BUILD`) — set by the Android
 *      build so the decision never depends on a runtime check.
 *   2. Capacitor's own runtime check (when the plugin is present).
 *   3. A conservative fallback: the web build.
 */

/** True when the bundle was produced for the Android target. */
export const isNativeBuild = () => {
  const flag = import.meta.env?.VITE_NATIVE_BUILD;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return false;
};

/**
 * True when the app is running inside the Android WebView.
 *
 * This is only used for platform-specific behaviour (the biometric app
 * lock, the file picker). Data-source selection uses the build flag, which
 * is deterministic and cannot be spoofed by the page.
 */
export const isNativePlatform = () => {
  if (isNativeBuild()) return true;

  try {
    // Capacitor sets `window.Capacitor` when the runtime is injected.
    const capacitor = globalThis.Capacitor;
    if (capacitor?.isNativePlatform) return Boolean(capacitor.isNativePlatform());
  } catch {
    // The Capacitor global is simply absent in the browser.
  }

  return false;
};

export default isNativeBuild;
