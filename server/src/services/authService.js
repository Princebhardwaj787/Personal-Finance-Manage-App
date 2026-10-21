import { prisma } from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { createAccessToken } from '../utils/jwt.js';
import { AppError } from '../middleware/errorHandler.js';
import { record, AUDIT_ACTIONS, AUDIT_OUTCOMES } from './auditService.js';

const DEFAULT_CATEGORIES = [
  { name: 'Salary', type: 'INCOME', icon: '💰', color: '#22c55e' },
  { name: 'Freelance', type: 'INCOME', icon: '💻', color: '#16a34a' },
  { name: 'Investments', type: 'INCOME', icon: '📈', color: '#15803d' },
  { name: 'Gifts', type: 'INCOME', icon: '🎁', color: '#166534' },
  { name: 'Other Income', type: 'INCOME', icon: '➕', color: '#14532d' },
  { name: 'Food & Dining', type: 'EXPENSE', icon: '🍔', color: '#ef4444' },
  { name: 'Shopping', type: 'EXPENSE', icon: '🛍️', color: '#dc2626' },
  { name: 'Transport', type: 'EXPENSE', icon: '🚌', color: '#b91c1c' },
  { name: 'Bills & Utilities', type: 'EXPENSE', icon: '💡', color: '#991b1b' },
  { name: 'Entertainment', type: 'EXPENSE', icon: '🎮', color: '#7f1d1d' },
  { name: 'Health & Medical', type: 'EXPENSE', icon: '🏥', color: '#f97316' },
  { name: 'Education', type: 'EXPENSE', icon: '📚', color: '#ea580c' },
  { name: 'Travel', type: 'EXPENSE', icon: '✈️', color: '#c2410c' },
  { name: 'Personal Care', type: 'EXPENSE', icon: '💇', color: '#9a3412' },
  { name: 'Other Expenses', type: 'EXPENSE', icon: '📦', color: '#7c2d12' }
];

export const registerUser = async (email, password, name) => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError('Email already registered', 409);
  }

  const passwordHash = await hashPassword(password);
  
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: name || null
    }
  });

  await createDefaultCategories(user.id);

  const token = createAccessToken(user);

  // Exclude passwordHash from response
  const { passwordHash: _, ...userWithoutPassword } = user;
  
  return { user: userWithoutPassword, token };
};

export const loginUser = async (email, password, context = {}) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Record the failure without revealing whether the account exists.
    await record({
      userId: null,
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
      outcome: AUDIT_OUTCOMES.FAILURE,
      source: 'API',
      route: context.route ?? 'POST /api/auth/login',
      ip: context.ip ?? null,
      metadata: { reason: 'unknown_email' }
    });
    throw new AppError('Invalid credentials', 401);
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    await record({
      userId: user.id,
      action: AUDIT_ACTIONS.AUTH_LOGIN_FAILURE,
      outcome: AUDIT_OUTCOMES.FAILURE,
      source: 'API',
      route: context.route ?? 'POST /api/auth/login',
      ip: context.ip ?? null,
      metadata: { reason: 'invalid_password' }
    });
    throw new AppError('Invalid credentials', 401);
  }

  const token = createAccessToken(user);

  await record({
    userId: user.id,
    action: AUDIT_ACTIONS.AUTH_LOGIN_SUCCESS,
    outcome: AUDIT_OUTCOMES.SUCCESS,
    source: 'API',
    route: context.route ?? 'POST /api/auth/login',
    ip: context.ip ?? null
  });

  // Exclude passwordHash from response
  const { passwordHash: _passwordHash, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, token };
};

export const getUserProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      createdAt: true
    }
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

export const updateUserProfile = async (userId, data) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      avatar: data.avatar
    },
    select: {
      id: true,
      email: true,
      name: true,
      avatar: true,
      createdAt: true
    }
  });

  return user;
};

export const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const isValid = await comparePassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new AppError('Current password is incorrect', 401);
  }

  const passwordHash = await hashPassword(newPassword);
  
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });

  await record({
    userId,
    action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGE,
    outcome: AUDIT_OUTCOMES.SUCCESS,
    source: 'API',
    route: 'PUT /api/auth/password'
  });

  return { success: true };
};

const createDefaultCategories = async (userId) => {
  console.log('Creating default categories for user:', userId);
  try {
    // Check if categories already exist for this user
    const existingCount = await prisma.category.count({ where: { userId } });
    if (existingCount > 0) {
      console.log('Categories already exist for user, skipping creation');
      return;
    }
    
    const result = await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map(cat => ({
        ...cat,
        userId
      }))
    });
    console.log('Default categories created:', result.count);
  } catch (error) {
    console.error('Error creating default categories:', error);
    // Don't throw - categories are not critical for registration
    console.warn('Failed to create default categories, continuing without them');
  }
};