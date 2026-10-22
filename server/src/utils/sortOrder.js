/**
 * Re-export of the shared domain module.
 *
 * The canonical implementation lives in <repo>/shared/sortOrder.js so the
 * Android client and the Express server share ONE copy of the financial
 * rules. This file keeps the server's existing import paths working
 * (../utils/sortOrder.js) so no service, controller or route has to change.
 */
export * from '../../../shared/sortOrder.js';
