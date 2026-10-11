import {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount
} from '../services/accountService.js';

export const listAccounts = async (req, res, next) => {
  try {
    const accounts = await getAccounts(req.user.id);
    res.json({ accounts });
  } catch (error) {
    next(error);
  }
};

export const getAccount = async (req, res, next) => {
  try {
    const account = await getAccountById(req.user.id, req.params.id);
    res.json({ account });
  } catch (error) {
    next(error);
  }
};

export const createAccountController = async (req, res, next) => {
  try {
    const account = await createAccount(req.user.id, req.body);
    res.status(201).json({ account });
  } catch (error) {
    next(error);
  }
};

export const updateAccountController = async (req, res, next) => {
  try {
    const account = await updateAccount(req.user.id, req.params.id, req.body);
    res.json({ account });
  } catch (error) {
    next(error);
  }
};

export const deleteAccountController = async (req, res, next) => {
  try {
    await deleteAccount(req.user.id, req.params.id);
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
};