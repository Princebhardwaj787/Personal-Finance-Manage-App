import * as recurringExpenseService from '../services/recurringExpenseService.js';
import * as recurringProcessingService from '../services/recurringProcessingService.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

/** POST /api/recurring-expenses/process — run the recurring transaction
 *  processor for the CALLER ONLY (identity always comes from the JWT). */
export const processDue = handle(async (req, res) => {
  const result = await recurringProcessingService.processDueRecurringTransactions(req.user.id, {
    asOfDate: req.body?.asOfDate,
    maxCatchUp: req.body?.maxCatchUp,
    dryRun: req.body?.dryRun
  });
  res.json(result);
});

/** GET /api/recurring-expenses/:id/occurrences — idempotency / failure log. */
export const getOccurrences = handle(async (req, res) => {
  const result = await recurringProcessingService.listOccurrences(req.user.id, req.params.id, {
    limit: req.query.limit
  });
  res.json(result);
});

/** GET /api/recurring-expenses */
export const listRecurringExpenses = handle(async (req, res) => {
  const items = await recurringExpenseService.listRecurringExpenses(req.user.id, {
    status: req.query.status
  });
  res.json({ recurringExpenses: items, count: items.length });
});

/** GET /api/recurring-expenses/summary */
export const getSummary = handle(async (req, res) => {
  const summary = await recurringExpenseService.getSummary(req.user.id, {
    days: req.query.days
  });
  res.json(summary);
});

/** GET /api/recurring-expenses/upcoming */
export const getUpcoming = handle(async (req, res) => {
  const result = await recurringExpenseService.getUpcoming(req.user.id, {
    days: req.query.days,
    limit: req.query.limit
  });
  res.json(result);
});

/** GET /api/recurring-expenses/:id */
export const getRecurringExpense = handle(async (req, res) => {
  const item = await recurringExpenseService.getRecurringExpense(req.user.id, req.params.id);
  res.json({ recurringExpense: item });
});

/** POST /api/recurring-expenses */
export const createRecurringExpense = handle(async (req, res) => {
  const item = await recurringExpenseService.createRecurringExpense(req.user.id, req.body);
  res.status(201).json({ recurringExpense: item });
});

/** PUT /api/recurring-expenses/:id — also used for pause/resume (isActive) */
export const updateRecurringExpense = handle(async (req, res) => {
  const item = await recurringExpenseService.updateRecurringExpense(
    req.user.id,
    req.params.id,
    req.body
  );
  res.json({ recurringExpense: item });
});

/** DELETE /api/recurring-expenses/:id */
export const deleteRecurringExpense = handle(async (req, res) => {
  await recurringExpenseService.deleteRecurringExpense(req.user.id, req.params.id);
  res.json({ message: 'Recurring expense deleted successfully' });
});
