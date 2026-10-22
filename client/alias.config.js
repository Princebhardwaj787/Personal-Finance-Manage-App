import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Shared build aliases.
 *
 * `@shared` points at the repository-level `shared/` folder, which holds the
 * pure domain rules (money, date ranges, budget/goal status, recurrence
 * stepping). The Express server imports the very same files, so the financial
 * rules exist exactly ONCE and cannot drift between the web app and the
 * Android app.
 */
export const sharedAlias = {
  '@shared': path.resolve(here, '../shared')
};

/** True when building for the Android (Capacitor) target. */
export const isAndroidBuild = (mode) =>
  process.env.CAPACITOR_ANDROID === 'true' ||
  process.env.CAPACITOR_PLATFORM === 'android' ||
  process.env.VITE_NATIVE_BUILD === 'true' ||
  mode === 'android';

export default sharedAlias;
