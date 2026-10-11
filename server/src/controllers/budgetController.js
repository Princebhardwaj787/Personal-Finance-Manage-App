import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  CATEGORY_SELECT,
  calculateBudgetStatus,
  calculateBudgetStatusBulk,
  serializeBudget
} from '../services/budgetService.js';

/**
 * List budgets with optional filtering by month and year
 */
export const listBudgets = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const userId = req.user.id;

    const where = { userId };

    if (month && year) {
      where.month = parseInt(month);
      where.year = parseInt(year);
    }

    const budgets = await prisma.budget.findMany({
      where,
      include: {
        category: {
          select: { id: true, name: true, type: true, icon: true, color: true }
        }
      },
      orderBy: [{ month: 'desc' }, { year: 'desc' }]
    });

    // One aggregate per calendar month instead of one query per budget.
    const statuses = await calculateBudgetStatusBulk(userId, budgets);

    res.json({
      budgets: budgets.map((budget, index) => serializeBudget(budget, statuses[index]))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new budget
 */
export const createBudget = async (req, res, next) => {
  try {
    const { categoryId, amount, month, year } = req.body;
    const userId = req.user.id;

    // Validate category exists and belongs to user
    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId, type: 'EXPENSE' }
    });

    if (!category) {
      throw new AppError('Category not found or does not belong to user or is not an EXPENSE category', 400);
    }

    // `Budget.name` is NOT NULL with no default — it must always be provided.
    // Previously it was omitted, which made EVERY budget creation fail with a
    // PrismaClientValidationError.
    await prisma.budget.create({
      data: {
        userId,
        categoryId,
        name: `${category.name} budget`,
        amount: parseFloat(amount),
        month: parseInt(month),
        year: parseInt(year)
      }
    });

    // Re-read with the category relation so we only ever return owned, joined data
    const budget = await prisma.budget.findFirst({
      where: { userId, categoryId, month: parseInt(month), year: parseInt(year) },
      include: {
        category: {
          select: CATEGORY_SELECT
        }
      }
    });

    if (!budget) {
      throw new AppError('Failed to create budget', 500);
    }

    // Calculate status
    const statusInfo = await calculateBudgetStatus(userId, categoryId, month, year);

    res.status(201).json(serializeBudget(budget, statusInfo));
  } catch (error) {
    // Express does not await async handlers, so errors must go through next()
    // to reach the global errorHandler instead of hanging the request.
    if (error.code === 'P2003') {
      return next(new AppError('Category not found', 404));
    }
    if (error.code === 'P2002') {
      // Unique constraint violation
      return next(new AppError('A budget already exists for this category, month, and year', 400));
    }
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError('Failed to create budget', 500));
  }
};

/**
 * Get a single budget by ID
 */
export const getBudget = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const budget = await prisma.budget.findFirst({
      where: { id, userId },
      include: {
        category: {
          select: { id: true, name: true, type: true, icon: true, color: true }
        }
      }
    });

    if (!budget) {
      throw new AppError('Budget not found', 404);
    }

    const statusInfo = await calculateBudgetStatus(userId, budget.categoryId, budget.month, budget.year);

    res.json(serializeBudget(budget, statusInfo));
  } catch (error) {
    next(error);
  }
};

/**
 * Update a budget
 */
export const updateBudget = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, month, year } = req.body;
    const userId = req.user.id;

    // First verify the budget exists and belongs to this user
    const budget = await prisma.budget.findFirst({
      where: { id, userId }
    });

    if (!budget) {
      throw new AppError('Budget not found', 404);
    }

    // Build update data - only allow specified fields
    const updateData = {};
    if (amount !== undefined) updateData.amount = parseFloat(amount);
    if (month !== undefined) updateData.month = parseInt(month);
    if (year !== undefined) updateData.year = parseInt(year);

    // Note: categoryId cannot be changed via update to maintain uniqueness
    // If category change is needed, user should delete and create new budget

    const updatedBudget = await prisma.budget.update({
      where: { id },
      data: updateData,
      include: {
        category: {
          select: { id: true, name: true, type: true, icon: true, color: true }
        }
      }
    });

    const statusInfo = await calculateBudgetStatus(userId, updatedBudget.categoryId, updatedBudget.month, updatedBudget.year);

    res.json(serializeBudget(updatedBudget, statusInfo));
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    if (error.code === 'P2025') {
      return next(new AppError('Budget not found', 404));
    }
    if (error.code === 'P2002') {
      return next(new AppError('A budget already exists for this category, month, and year', 400));
    }
    return next(new AppError('Failed to update budget', 500));
  }
};

/**
 * Delete a budget
 */
export const deleteBudget = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const budget = await prisma.budget.findFirst({
      where: { id, userId }
    });

    if (!budget) {
      throw new AppError('Budget not found', 404);
    }

    await prisma.budget.delete({
      where: { id }
    });

    res.json({ message: 'Budget deleted successfully' });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    return next(new AppError('Failed to delete budget', 500));
  }
};

/**
 * Get budgets for the current month (or specified month)
 */
export const getCurrentMonthBudgets = async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const userId = req.user.id;

    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1; // JavaScript month 0-indexed
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    const budgets = await prisma.budget.findMany({
      where: {
        userId,
        month: targetMonth,
        year: targetYear
      },
      include: {
        category: {
          select: CATEGORY_SELECT
        }
      }
    });

    // One aggregate for the whole month instead of two queries per budget.
    const statuses = await calculateBudgetStatusBulk(userId, budgets);

    res.json({
      budgets: budgets.map((budget, index) => serializeBudget(budget, statuses[index]))
    });
  } catch (error) {
    next(error);
  }
};