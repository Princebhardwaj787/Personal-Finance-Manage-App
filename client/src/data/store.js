/**
 * LOCAL DATA STORE (Android conversion — Phase C)
 * ==============================================
 * Wires every local service onto one database connection.
 *
 * The app creates ONE store at start-up and hands it to the API layer. Tests
 * create a store over an in-memory database.
 *
 * Everything below this line is storage. The UI never touches SQL.
 */

import { createAccountService } from './services/accountService.js';
import { createCategoryService } from './services/categoryService.js';
import { createTransactionService } from './services/transactionService.js';
import { createTransferService } from './services/transferService.js';
import { createBudgetService } from './services/budgetService.js';
import { createSavingsGoalService } from './services/savingsGoalService.js';
import { createRecurringExpenseService } from './services/recurringExpenseService.js';
import { createAnalyticsService } from './services/analyticsService.js';
import { createReportService } from './services/reportService.js';
import { createNotificationService } from './services/notificationService.js';

/**
 * @param {import('./db.js').Database} db
 */
export const createDataStore = (db) => {
  const accounts = createAccountService(db);
  const categories = createCategoryService(db);
  const transactions = createTransactionService(db);
  const transfers = createTransferService(db);
  const budgets = createBudgetService(db);
  const savingsGoals = createSavingsGoalService(db);
  const recurring = createRecurringExpenseService(db);

  const analytics = createAnalyticsService(db, {
    savingsGoalService: savingsGoals,
    recurringExpenseService: recurring
  });

  const reports = createReportService(db, {
    transactionService: transactions,
    budgetService: budgets,
    analyticsService: analytics
  });

  const notifications = createNotificationService(db);

  return {
    db,
    accounts,
    categories,
    transactions,
    transfers,
    budgets,
    savingsGoals,
    recurring,
    analytics,
    reports,
    notifications
  };
};

export default createDataStore;
