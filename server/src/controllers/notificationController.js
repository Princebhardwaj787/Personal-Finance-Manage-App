import * as notificationService from '../services/notificationService.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications — paginated list, newest first.
 * `limit` is clamped to 50 in the service.
 */
export const list = handle(async (req, res) => {
  const result = await notificationService.listNotifications(req.user.id, {
    page: req.query.page,
    limit: req.query.limit
  });
  res.json(result);
});

/** GET /api/notifications/unread-count — badge number for the bell. */
export const unreadCount = handle(async (req, res) => {
  res.json(await notificationService.getUnreadCount(req.user.id));
});

/** PATCH /api/notifications/:id/read — mark one read (owner only). */
export const markRead = handle(async (req, res) => {
  const notification = await notificationService.markRead(req.user.id, req.params.id);
  res.json(notification);
});

/** PATCH /api/notifications/read-all — mark every notification read. */
export const markAllRead = handle(async (req, res) => {
  res.json(await notificationService.markAllRead(req.user.id));
});

/** DELETE /api/notifications/:id — delete one (owner only). */
export const remove = handle(async (req, res) => {
  res.json(await notificationService.deleteNotification(req.user.id, req.params.id));
});

/**
 * POST /api/notifications/process — run the scheduled checks for the
 * authenticated user. Idempotent, so the UI can offer a manual refresh and
 * tests can trigger it deterministically. There is deliberately no
 * endpoint that processes OTHER users' notifications.
 */
export const process = handle(async (req, res) => {
  const result = await notificationService.processScheduledNotifications(req.user.id);
  res.json(result);
});

/** GET /api/notification-preferences — current toggles (defaults if unset). */
export const getPreferences = handle(async (req, res) => {
  res.json(await notificationService.getPreferences(req.user.id));
});

/** PUT /api/notification-preferences — persist toggles (one row per user). */
export const updatePreferences = handle(async (req, res) => {
  const preferences = await notificationService.updatePreferences(req.user.id, req.body);
  res.json(preferences);
});
