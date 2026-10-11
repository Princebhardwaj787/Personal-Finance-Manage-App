import { prisma } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';

export const getAccounts = async (userId) => {
  return prisma.account.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: {
      _count: {
        select: {
          transactions: true,
          // Phase 7: transfers reference this account from either side;
          // deleting the account would cascade away its history.
          transfersFrom: true,
          transfersTo: true
        }
      }
    }
  });
};

export const getAccountById = async (userId, accountId) => {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    include: {
      transactions: {
        take: 10,
        orderBy: { date: 'desc' },
        include: { category: true }
      }
    }
  });
  
  if (!account) {
    throw new AppError('Account not found', 404);
  }
  
  return account;
};

export const createAccount = async (userId, data) => {
  const { name, type, balance = 0, currency = 'INR', icon, color, isDefault = false, lowBalanceThreshold = null } = data;

  if (isDefault) {
    await prisma.account.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false }
    });
  }

  return prisma.account.create({
    data: {
      name,
      type,
      balance,
      currency,
      icon,
      color,
      isDefault,
      lowBalanceThreshold,
      userId
    }
  });
};

export const updateAccount = async (userId, accountId, data) => {
  const { name, type, icon, color, isDefault, currency, lowBalanceThreshold } = data;

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId }
  });

  if (!account) {
    throw new AppError('Account not found', 404);
  }

  if (isDefault && !account.isDefault) {
    await prisma.account.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false }
    });
  }

  return prisma.account.update({
    where: { id: accountId },
    data: {
      name,
      type,
      icon,
      color,
      isDefault,
      currency,
      lowBalanceThreshold: lowBalanceThreshold === undefined ? account.lowBalanceThreshold : lowBalanceThreshold
    }
  });
};

export const deleteAccount = async (userId, accountId) => {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    include: {
      _count: { select: { transactions: true } }
    }
  });
  
  if (!account) {
    throw new AppError('Account not found', 404);
  }
  
  if (account._count.transactions > 0) {
    throw new AppError('Cannot delete account with existing transactions', 400);
  }

  if (account._count.transfersFrom + account._count.transfersTo > 0) {
    throw new AppError('Cannot delete account with existing transfers', 400);
  }
  
  if (account.isDefault) {
    throw new AppError('Cannot delete default account. Set another account as default first.', 400);
  }
  
  await prisma.account.delete({ where: { id: accountId } });
  
  return { success: true };
};

export const getAccountBalance = async (userId, accountId) => {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { balance: true }
  });
  
  if (!account) {
    throw new AppError('Account not found', 404);
  }
  
  return account.balance;
};

export const updateAccountBalance = async (accountId, amountChange) => {
  return prisma.account.update({
    where: { id: accountId },
    data: {
      balance: {
        increment: amountChange
      }
    }
  });
};