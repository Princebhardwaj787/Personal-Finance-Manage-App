import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

export const getCategories = async (userId, type = null) => {
  const where = { userId };
  if (type) {
    where.type = type;
  }
  
  return prisma.category.findMany({
    where,
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: { transactions: true }
      }
    }
  });
};

export const getCategoryById = async (userId, categoryId) => {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    include: {
      transactions: {
        take: 10,
        orderBy: { date: 'desc' }
      }
    }
  });
  
  if (!category) {
    throw new AppError('Category not found', 404);
  }
  
  return category;
};

export const createCategory = async (userId, data) => {
  const { name, type, icon, color } = data;
  
  const existing = await prisma.category.findFirst({
    where: { userId, name, type }
  });
  
  if (existing) {
    throw new AppError('Category with this name already exists', 409);
  }
  
  return prisma.category.create({
    data: {
      name,
      type,
      icon,
      color,
      userId
    }
  });
};

export const updateCategory = async (userId, categoryId, data) => {
  const { name, icon, color } = data;
  
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId }
  });
  
  if (!category) {
    throw new AppError('Category not found', 404);
  }
  
  if (name && name !== category.name) {
    const existing = await prisma.category.findFirst({
      where: { userId, name, type: category.type }
    });
    
    if (existing) {
      throw new AppError('Category with this name already exists', 409);
    }
  }
  
  return prisma.category.update({
    where: { id: categoryId },
    data: { name, icon, color }
  });
};

export const deleteCategory = async (userId, categoryId) => {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    include: {
      _count: { select: { transactions: true, budgets: true } }
    }
  });
  
  if (!category) {
    throw new AppError('Category not found', 404);
  }
  
  if (category._count.transactions > 0 || category._count.budgets > 0) {
    throw new AppError('Cannot delete category with existing transactions or budgets', 400);
  }
  
  await prisma.category.delete({ where: { id: categoryId } });
  
  return { success: true };
};

export const getCategoriesByType = async (userId, type) => {
  return prisma.category.findMany({
    where: { userId, type },
    orderBy: { name: 'asc' }
  });
};