/**
 * LOCAL CATEGORY SERVICE (Android conversion — Phase C)
 * ====================================================
 * The on-device counterpart of `server/src/services/categoryService.js`.
 *
 * A category is either INCOME or EXPENSE. The type is part of the unique
 * key, so "Food" can exist as both an income and an expense category.
 */

import { AppError } from '@shared/AppError.js';
import { makeId } from '../schema.js';

const now = () => new Date().toISOString();

const CATEGORY_TYPES = ['INCOME', 'EXPENSE'];

const assertType = (type) => {
  if (!CATEGORY_TYPES.includes(type)) {
    throw new AppError(`Category type must be one of: ${CATEGORY_TYPES.join(', ')}`, 400);
  }
  return type;
};

export const createCategoryService = (db) => ({
  async getCategories(userId, type = null) {
    const params = [userId];
    let where = 'userId = ?';
    if (type) {
      assertType(type);
      where += ' AND type = ?';
      params.push(type);
    }

    const categories = await db.select(
      `SELECT * FROM "Category" WHERE ${where} ORDER BY type ASC, name ASC`,
      params
    );

    if (categories.length === 0) return [];

    const counts = await db.select(
      `SELECT categoryId, COUNT(*) AS c FROM "Transaction" WHERE userId = ? GROUP BY categoryId`,
      [userId]
    );
    const countById = new Map(counts.map((c) => [c.categoryId, Number(c.c)]));

    return categories.map((category) => ({
      ...category,
      _count: { transactions: countById.get(category.id) ?? 0 }
    }));
  },

  async getCategoriesByType(userId, type) {
    assertType(type);
    return db.select(
      'SELECT * FROM "Category" WHERE userId = ? AND type = ? ORDER BY name ASC',
      [userId, type]
    );
  },

  async getCategoryById(userId, categoryId) {
    const rows = await db.select('SELECT * FROM "Category" WHERE id = ? AND userId = ?', [
      categoryId,
      userId
    ]);
    if (rows.length === 0) throw new AppError('Category not found', 404);

    const transactions = await db.select(
      'SELECT * FROM "Transaction" WHERE categoryId = ? AND userId = ? ORDER BY date DESC LIMIT 10',
      [categoryId, userId]
    );

    return { ...rows[0], transactions };
  },

  async createCategory(userId, data) {
    const { name, type, icon, color } = data;

    if (!name || !String(name).trim()) throw new AppError('Category name is required', 400);
    assertType(type);

    const existing = await db.select(
      'SELECT id FROM "Category" WHERE userId = ? AND name = ? AND type = ?',
      [userId, String(name).trim(), type]
    );
    if (existing.length > 0) {
      throw new AppError('Category with this name already exists', 409);
    }

    const id = makeId();
    const timestamp = now();
    await db.execute(
      `INSERT INTO "Category" (id, name, type, icon, color, userId, "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, String(name).trim(), type, icon ?? null, color ?? null, userId, timestamp, timestamp]
    );

    const rows = await db.select('SELECT * FROM "Category" WHERE id = ?', [id]);
    return rows[0];
  },

  async updateCategory(userId, categoryId, data) {
    const { name, icon, color } = data;

    const existing = await db.select('SELECT * FROM "Category" WHERE id = ? AND userId = ?', [
      categoryId,
      userId
    ]);
    if (existing.length === 0) throw new AppError('Category not found', 404);

    const current = existing[0];

    if (name && name.trim() !== current.name) {
      const clash = await db.select(
        'SELECT id FROM "Category" WHERE userId = ? AND name = ? AND type = ?',
        [userId, name.trim(), current.type]
      );
      if (clash.length > 0) {
        throw new AppError('Category with this name already exists', 409);
      }
    }

    const timestamp = now();
    await db.execute(
      `UPDATE "Category" SET name = ?, icon = ?, color = ?, "updatedAt" = ? WHERE id = ? AND userId = ?`,
      [
        name === undefined ? current.name : name.trim(),
        icon === undefined ? current.icon : icon,
        color === undefined ? current.color : color,
        timestamp,
        categoryId,
        userId
      ]
    );

    const rows = await db.select('SELECT * FROM "Category" WHERE id = ?', [categoryId]);
    return rows[0];
  },

  async deleteCategory(userId, categoryId) {
    const existing = await db.select('SELECT * FROM "Category" WHERE id = ? AND userId = ?', [
      categoryId,
      userId
    ]);
    if (existing.length === 0) throw new AppError('Category not found', 404);

    const counts = await db.select(
      `SELECT
         (SELECT COUNT(*) FROM "Transaction" t WHERE t.categoryId = ?) AS transactions,
         (SELECT COUNT(*) FROM "Budget" b WHERE b.categoryId = ?) AS budgets`,
      [categoryId, categoryId]
    );
    const row = counts[0];

    if (Number(row.transactions) > 0 || Number(row.budgets) > 0) {
      throw new AppError('Cannot delete category with existing transactions or budgets', 400);
    }

    await db.execute('DELETE FROM "Category" WHERE id = ? AND userId = ?', [categoryId, userId]);
    return { success: true };
  }
});

export default createCategoryService;
