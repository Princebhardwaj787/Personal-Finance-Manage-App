import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoriesByType
} from '../services/categoryService.js';

export const listCategories = async (req, res, next) => {
  try {
    const { type } = req.query;
    const categories = await getCategories(req.user.id, type);
    res.json({ categories });
  } catch (error) {
    next(error);
  }
};

export const getCategory = async (req, res, next) => {
  try {
    const category = await getCategoryById(req.user.id, req.params.id);
    res.json({ category });
  } catch (error) {
    next(error);
  }
};

export const createCategoryController = async (req, res, next) => {
  try {
    const category = await createCategory(req.user.id, req.body);
    res.status(201).json({ category });
  } catch (error) {
    next(error);
  }
};

export const updateCategoryController = async (req, res, next) => {
  try {
    const category = await updateCategory(req.user.id, req.params.id, req.body);
    res.json({ category });
  } catch (error) {
    next(error);
  }
};

export const deleteCategoryController = async (req, res, next) => {
  try {
    await deleteCategory(req.user.id, req.params.id);
    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const listCategoriesByType = async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!['INCOME', 'EXPENSE'].includes(type)) {
      return res.status(400).json({ error: 'Invalid category type' });
    }
    const categories = await getCategoriesByType(req.user.id, type);
    res.json({ categories });
  } catch (error) {
    next(error);
  }
};