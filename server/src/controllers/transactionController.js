import * as transactionService from '../services/transactionService.js';
import * as transferService from '../services/transferService.js';
import { recordFromRequest, AUDIT_ACTIONS } from '../services/auditService.js';

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error);
  }
};

/** GET /api/transactions — filters, search, sorting and paging all in SQL. */
export const listTransactions = handle(async (req, res) => {
  const {
    page,
    limit,
    type,
    accountId,
    categoryId,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    search,
    sortBy,
    sortOrder
  } = req.query;

  const result = await transactionService.getTransactions(req.user.id, {
    page,
    limit,
    type,
    accountId,
    categoryId,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    search,
    sortBy,
    sortOrder
  });

  res.json(result);
});

/** GET /api/transactions/summary — period + filter scoped totals (DB aggregate). */
export const getSummary = handle(async (req, res) => {
  const { startDate, endDate, type, accountId, categoryId, minAmount, maxAmount, search } = req.query;
  const summary = await transactionService.getTransactionSummary(req.user.id, {
    startDate,
    endDate,
    type,
    accountId,
    categoryId,
    minAmount,
    maxAmount,
    search
  });
  res.json(summary);
});

/** GET /api/transactions/category-breakdown */
export const getCategoryBreakdown = handle(async (req, res) => {
  const { startDate, endDate, type } = req.query;
  const breakdown = await transactionService.getTransactionsByCategory(req.user.id, {
    startDate,
    endDate,
    type
  });
  res.json({ breakdown });
});

/** GET /api/transactions/:id — detail view. */
export const getTransaction = handle(async (req, res) => {
  const transaction = await transactionService.getTransactionById(req.user.id, req.params.id);
  res.json({ transaction });
});

/** POST /api/transactions */
export const createTransactionController = handle(async (req, res) => {
  const transaction = await transactionService.createTransaction(req.user.id, req.body);
  await recordFromRequest(req, AUDIT_ACTIONS.TRANSACTION_CREATE, {
    metadata: {
      transactionId: transaction.id,
      type: transaction.type,
      accountId: transaction.accountId
    }
  });
  res.status(201).json({ transaction });
});

/** PUT /api/transactions/:id */
export const updateTransactionController = handle(async (req, res) => {
  const transaction = await transactionService.updateTransaction(req.user.id, req.params.id, req.body);
  await recordFromRequest(req, AUDIT_ACTIONS.TRANSACTION_UPDATE, {
    metadata: { transactionId: transaction.id, type: transaction.type }
  });
  res.json({ transaction });
});

/** DELETE /api/transactions/:id */
export const deleteTransactionController = handle(async (req, res) => {
  await transactionService.deleteTransaction(req.user.id, req.params.id);
  await recordFromRequest(req, AUDIT_ACTIONS.TRANSACTION_DELETE, {
    metadata: { transactionId: req.params.id }
  });
  res.json({ message: 'Transaction deleted successfully' });
});

/** POST /api/transactions/:id/duplicate — independent new record, new balance impact. */
export const duplicateTransactionController = handle(async (req, res) => {
  const transaction = await transactionService.duplicateTransaction(
    req.user.id,
    req.params.id,
    req.body ?? {}
  );
  res.status(201).json({ transaction });
});

/** POST /api/transactions/bulk-delete — atomic, ownership re-checked per id. */
export const bulkDeleteTransactionsController = handle(async (req, res) => {
  const result = await transactionService.bulkDeleteTransactions(req.user.id, req.body?.ids);
  await recordFromRequest(req, AUDIT_ACTIONS.TRANSACTION_DELETE, {
    metadata: { deletedCount: result?.deleted ?? 0, bulk: true }
  });
  res.json(result);
});

/**
 * POST /api/transactions/transfer — LEGACY path, kept for older clients.
 * It now delegates to the transfer service: a single atomic Transfer record
 * instead of the old EXPENSE + INCOME row pair (which used to inflate
 * income/expense analytics and budgets).
 */
export const createTransferController = handle(async (req, res) => {
  const transfer = await transferService.createTransfer(req.user.id, req.body);
  res.status(201).json({
    transfer,
    message: 'Transfer created. Transfers are stored separately from income and expenses.'
  });
});
