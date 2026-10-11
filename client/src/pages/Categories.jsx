import { useState, useEffect, useCallback } from 'react';
import { useCategories } from '../hooks/useCategories';
import Input from '../components/forms/Input';
import Button from '../components/forms/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';

const CATEGORY_TYPES = [
  { value: 'INCOME', label: 'Income', color: 'text-green-600', bgColor: 'bg-green-50' },
  { value: 'EXPENSE', label: 'Expense', color: 'text-danger-600', bgColor: 'bg-danger-50' }
];

export default function Categories() {
  const [activeType, setActiveType] = useState('EXPENSE');
  const { categories, loading, createCategory, updateCategory, deleteCategory } = useCategories(activeType);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'EXPENSE',
    icon: '',
    color: '#ef4444'
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      type: activeType,
      icon: '',
      color: activeType === 'INCOME' ? '#22c55e' : '#ef4444'
    });
    setFormErrors({});
    setEditingCategory(null);
  }, [activeType]);

  const handleEdit = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      type: category.type,
      icon: category.icon || '',
      color: category.color || (category.type === 'INCOME' ? '#22c55e' : '#ef4444')
    });
    setShowForm(true);
  };

  const handleDelete = (category) => {
    setDeleteConfirm(category);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteCategory(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.type) errors.type = 'Type is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, formData);
      } else {
        await createCategory(formData);
      }
      setShowForm(false);
      resetForm();
    } catch (err) {
      console.error('Submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (showForm && !editingCategory) {
      resetForm();
    }
  }, [showForm, activeType, editingCategory, resetForm]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="section-title">Categories</h1>
          <p className="section-subtitle">Manage your income and expense categories</p>
        </div>
        <Button onClick={() => setShowForm(true)} variant="primary">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Category
        </Button>
      </div>

      <div className="flex gap-2 mb-4" role="tablist">
        {CATEGORY_TYPES.map(type => (
          <button
            key={type.value}
            role="tab"
            aria-selected={activeType === type.value}
            onClick={() => setActiveType(type.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeType === type.value
                ? `${type.bgColor} ${type.color} shadow-sm`
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-1/2" />
            </Card>
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No {activeType.toLowerCase()} categories yet</h3>
          <p className="text-gray-500 mb-4">Create your first category to organize transactions</p>
          <Button onClick={() => setShowForm(true)} variant="primary">
            Add Category
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((category) => (
            <Card key={category.id} hover>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl`} style={{ backgroundColor: `${category.color}20` }}>
                    {category.icon || '📦'}
                  </div>
                  <div className="ml-3">
                    <h3 className="font-semibold text-gray-900">{category.name}</h3>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${category.type === 'INCOME' ? 'bg-green-100 text-green-700' : 'bg-danger-100 text-danger-700'}`}>
                      {category.type}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(category)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(category)} className="text-danger-600 hover:bg-danger-50">
                    Delete
                  </Button>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
                <span>{category._count?.transactions || 0} transactions</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); resetForm(); }} title={editingCategory ? 'Edit Category' : 'Add Category'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Category Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={formErrors.name}
            placeholder="e.g. Groceries"
            required
            autoFocus
          />
          <div>
            <label className="label">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="input"
              required
            >
              {CATEGORY_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Icon (Emoji)"
              value={formData.icon}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
              placeholder="🍔"
              maxLength={2}
            />
            <div>
              <label className="label">Color</label>
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-full h-10 rounded-lg border border-gray-300 cursor-pointer"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {editingCategory ? 'Update' : 'Create'} Category
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Category" size="sm">
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone.
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Note: Categories with transactions or budgets cannot be deleted.
        </p>
        <div className="flex justify-end space-x-3">
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}