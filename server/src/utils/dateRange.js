/**
 * Re-export of the shared domain module.
 *
 * The canonical implementation lives in <repo>/shared/dateRange.js so the
 * Android client and the Express server share ONE copy of the financial
 * rules. This file keeps the server's existing import paths working
 * (../utils/dateRange.js) so no service, controller or route has to change.
 */
export * from '../../../shared/dateRange.js';
