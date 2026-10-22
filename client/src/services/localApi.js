/**
 * LOCAL API ADAPTERS (Android conversion â€” Phase D)
 * ================================================
 * These mirror the Express API's response shapes EXACTLY, so every page,
 * hook and component above the API layer works unchanged whether it is
 * talking to the server (web) or to the on-device database (Android).
 *
 * Each adapter returns the same object the HTTP version returns:
 *   accountApi.list()  -> { accounts: [...] }
 *   transactionApi.list() -> { transactions, pagination }
 *   and so on.
 */

import { getStore, LOCAL_USER } from '../data/runtime.js';
import { resolveRange } from '@shared/dateRange.js';

/** Resolve the data store and the local user in one call. */
const getLocalContext = async () => {
  const { store } = await getStore();
  return { store, userId: LOCAL_USER };
};

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */
export const localAccountApi = {
  async list() {
    const { store, userId } = await getLocalContext();
    return { accounts: await store.accounts.getAccounts(userId) };
  },
  async get(id) {
    const { store, userId } = await getLocalContext();
    return { account: await store.accounts.getAccountById(userId, id) };
  },
  async create(data) {
    const { store, userId } = await getLocalContext();
    return { account: await store.accounts.createAccount(userId, data) };
  },
  async update(id, data) {
    const { store, userId } = await getLocalContext();
    return { account: await store.accounts.updateAccount(userId, id, data) };
  },
  async delete(id) {
    const { store, userId } = await getLocalContext();
    await store.accounts.deleteAccount(userId, id);
    return { message: 'Account deleted successfully' };
  }
};

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */
export const localCategoryApi = {
  async list(params = {}) {
    const { store, userId } = await getLocalContext();
    return { categories: await store.categories.getCategories(userId, params.type ?? null) };
  },
  async getByType(type) {
    const { store, userId } = await getLocalContext();
    return { categories: await store.categories.getCategoriesByType(userId, type) };
  },
  async get(id) {
    const { store, userId } = await getLocalContext();
    return { category: await store.categories.getCategoryById(userId, id) };
  },
  async create(data) {
    const { store, userId } = await getLocalContext();
    return { category: await store.categories.createCategory(userId, data) };
  },
  async update(id, data) {
    const { store, userId } = await getLocalContext();
    return { category: await store.categories.updateCategory(userId, id, data) };
  },
  async delete(id) {
    const { store, userId } = await getLocalContext();
    await store.categories.deleteCategory(userId, id);
    return { message: 'Category deleted successfully' };
  }
};

/* ------------------------------------------------------------------ */
/* Transactions                                                        */
/* ------------------------------------------------------------------ */
export const localTransactionApi = {
  async list(params = {}) {
    const { store, userId } = await getLocalContext();
    return store.transactions.getTransactions(userId, params);
  },
  async get(id) {
    const { store, userId } = await getLocalContext();
    return { transaction: await store.transactions.getTransactionById(userId, id) };
  },
  async create(data) {
    const { store, userId } = await getLocalContext();
    return { transaction: await store.transactions.createTransaction(userId, data) };
  },
  async update(id, data) {
    const { store, userId } = await getLocalContext();
    return { transaction: await store.transactions.updateTransaction(userId, id, data) };
  },
  async delete(id) {
    const { store, userId } = await getLocalContext();
    await store.transactions.deleteTransaction(userId, id);
    return { message: 'Transaction deleted successfully' };
  },
  async duplicate(id, data = {}) {
    const { store, userId } = await getLocalContext();
    return { transaction: await store.transactions.duplicateTransaction(userId, id, data) };
  },
  async bulkDelete(ids) {
    const { store, userId } = await getLocalContext();
    return store.transactions.bulkDeleteTransactions(userId, ids);
  },
  async getSummary(params = {}) {
    const { store, userId } = await getLocalContext();
    return store.transactions.getTransactionSummary(userId, params);
  },
  async getCategoryBreakdown(params = {}) {
    const { store, userId } = await getLocalContext();
    return { breakdown: await store.transactions.getTransactionsByCategory(userId, params) };
  }
};

/* ------------------------------------------------------------------ */
/* Transfers                                                           */
/* ------------------------------------------------------------------ */
export const localTransferApi = {
  async list(params = {}) {
    const { store, userId } = await getLocalContext();
    return store.transfers.getTransfers(userId, params);
  },
  async summary(params = {}) {
    const { store, userId } = await getLocalContext();
    return store.transfers.getTransferSummary(userId, params);
  },
  async get(id) {
    const { store, userId } = await getLocalContext();
    return { transfer: await store.transfers.getTransferById(userId, id) };
  },
  async create(data) {
    const { store, userId } = await getLocalContext();
    return { transfer: await store.transfers.createTransfer(userId, data) };
  },
  async update(id, data) {
    const { store, userId } = await getLocalContext();
    return { transfer: await store.transfers.updateTransfer(userId, id, data) };
  },
  async remove(id) {
    const { store, userId } = await getLocalContext();
    await store.transfers.deleteTransfer(userId, id);
    return { message: 'Transfer deleted successfully' };
  }
};

/* ------------------------------------------------------------------ */
/* Budgets                                                             */
/* ------------------------------------------------------------------ */
export const localBudgetApi = {
  async list(params = {}) {
    const { store, userId } = await getLocalContext();
    return { budgets: await store.budgets.getBudgets(userId, params) };
  },
  async getCurrentMonth(month, year) {
    const { store, userId } = await getLocalContext();
    const today = new Date();
    const targetMonth = month ? Number(month) : today.getMonth() + 1;
    const targetYear = year ? Number(year) : today.getFullYear();
    return store.budgets.getBudgetOverview(userId, {
      month: targetMonth,
      year: targetYear
    });
  },
  async get(id) {
    const { store, userId } = await getLocalContext();
    return store.budgets.getBudgetById(userId, id);
  },
  async create(data) {
    const { store, userId } = await getLocalContext();
    return store.budgets.createBudget(userId, data);
  },
  async update(id, data) {
    const { store, userId } = await getLocalContext();
    return store.budgets.updateBudget(userId, id, data);
  },
  async delete(id) {
    const { store, userId } = await getLocalContext();
    await store.budgets.deleteBudget(userId, id);
    return { message: 'Budget deleted successfully' };
  }
};

/* ------------------------------------------------------------------ */
/* Savings goals                                                       */
/* ------------------------------------------------------------------ */
export const localSavingsGoalApi = {
  async list(params = {}) {
    const { store, userId } = await getLocalContext();
    return { goals: await store.savingsGoals.listGoals(userId, params) };
  },
  async summary() {
    const { store, userId } = await getLocalContext();
    return store.savingsGoals.getSavingsSummary(userId);
  },
  async get(id) {
    const { store, userId } = await getLocalContext();
    return { goal: await store.savingsGoals.getGoal(userId, id) };
  },
  async create(data) {
    const { store, userId } = await getLocalContext();
    return { goal: await store.savingsGoals.createGoal(userId, data) };
  },
  async update(id, data) {
    const { store, userId } = await getLocalContext();
    return { goal: await store.savingsGoals.updateGoal(userId, id, data) };
  },
  async remove(id) {
    const { store, userId } = await getLocalContext();
    const result = await store.savingsGoals.deleteGoal(userId, id);
    return { message: 'Savings goal deleted successfully', ...result };
  },
  async addContribution(id, data) {
    const { store, userId } = await getLocalContext();
    return store.savingsGoals.addContribution(userId, id, data);
  },
  async listContributions(id, params = {}) {
    const { store, userId } = await getLocalContext();
    return store.savingsGoals.listContributions(userId, id, params);
  }
};

/* ------------------------------------------------------------------ */
/* Recurring expenses                                                  */
/* ------------------------------------------------------------------ */
export const localRecurringExpenseApi = {
  async list(params = {}) {
    const { store, userId } = await getLocalContext();
    const items = await store.recurring.listRecurringExpenses(userId, params);
    return { recurringExpenses: items, count: items.length };
  },
  async process(body = {}) {
    const { store, userId } = await getLocalContext();
    return store.recurring.processDueRecurringTransactions(userId, body);
  },
  async occurrences(id) {
    const { store, userId } = await getLocalContext();
    return store.recurring.listOccurrences(userId, id);
  },
  async summary(params = {}) {
    const { store, userId } = await getLocalContext();
    return store.recurring.getSummary(userId, params);
  },
  async upcoming(params = {}) {
    const { store, userId } = await getLocalContext();
    return store.recurring.getUpcoming(userId, params);
  },
  async get(id) {
    const { store, userId } = await getLocalContext();
    return { recurringExpense: await store.recurring.getRecurringExpense(userId, id) };
  },
  async create(data) {
    const { store, userId } = await getLocalContext();
    return { recurringExpense: await store.recurring.createRecurringExpense(userId, data) };
  },
  async update(id, data) {
    const { store, userId } = await getLocalContext();
    return { recurringExpense: await store.recurring.updateRecurringExpense(userId, id, data) };
  },
  async remove(id) {
    const { store, userId } = await getLocalContext();
    await store.recurring.deleteRecurringExpense(userId, id);
    return { message: 'Recurring expense deleted successfully' };
  }
};

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */
export const localDashboardApi = {
  async summary(params = {}) {
    const { store, userId } = await getLocalContext();
    const range = resolveRange(params);
    return store.analytics.getDashboardSummary(userId, range);
  },
  async widgets(params = {}) {
    const { store, userId } = await getLocalContext();
    return store.analytics.getWidgetData(userId, params);
  },
  async budgetOverview(params = {}) {
    const { store, userId } = await getLocalContext();
    const range = resolveRange(params);
    return store.budgets.getBudgetOverview(userId, {
      month: params.month ? Number(params.month) : range.end.getUTCMonth() + 1,
      year: params.year ? Number(params.year) : range.end.getUTCFullYear()
    });
  },
  async recentTransactions(limit = 10) {
    const { store, userId } = await getLocalContext();
    const result = await store.transactions.getTransactions(userId, {
      page: 1,
      limit: Math.min(Math.max(Number(limit) || 10, 1), 50)
    });
    return { transactions: result.transactions };
  }
};

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */
export const localAnalyticsApi = {
  async incomeExpenses(params = {}) {
    const { store, userId } = await getLocalContext();
    const range = resolveRange(params);
    return store.analytics.getIncomeExpenseTrend(userId, range, params.granularity);
  },
  async categorySpending(params = {}) {
    const { store, userId } = await getLocalContext();
    const range = resolveRange(params);
    return store.analytics.getCategorySpending(userId, range, params);
  },
  async monthlyTrends(months = 12) {
    const { store, userId } = await getLocalContext();
    return store.analytics.getMonthlyTrend(userId, months);
  }
};

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */
export const localNotificationApi = {
  async list(params = {}) {
    const { store, userId } = await getLocalContext();
    return store.notifications.list(userId, params);
  },
  async unreadCount() {
    const { store, userId } = await getLocalContext();
    return store.notifications.getUnreadCount(userId);
  },
  async markRead(id) {
    const { store, userId } = await getLocalContext();
    return store.notifications.markRead(userId, id);
  },
  async markAllRead() {
    const { store, userId } = await getLocalContext();
    return store.notifications.markAllRead(userId);
  },
  async remove(id) {
    const { store, userId } = await getLocalContext();
    return store.notifications.remove(userId, id);
  },
  async process() {
    const { store, userId } = await getLocalContext();
    return store.notifications.processScheduled(userId, {
      budgetService: store.budgets,
      savingsGoalService: store.savingsGoals,
      recurringExpenseService: store.recurring
    });
  },
  async getPreferences() {
    const { store, userId } = await getLocalContext();
    return store.notifications.getPreferences(userId);
  },
  async updatePreferences(preferences) {
    const { store, userId } = await getLocalContext();
    return store.notifications.updatePreferences(userId, preferences);
  }
};

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */
export const localReportApi = {
  async getReport(type, params = {}) {
    const { store, userId } = await getLocalContext();
    const report = await store.reports.getReport(userId, type, params);
    await store.reports.recordReportHistory(userId, {
      type,
      format: 'json',
      startDate: report.period.startISO,
      endDate: report.period.endInclusiveISO
    });
    return report;
  },
  async getHistory(params = {}) {
    const { store, userId } = await getLocalContext();
    return store.reports.getReportHistory(userId, params);
  }
};


