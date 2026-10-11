import { useState, useEffect } from 'react';
import { useAccounts } from '../hooks/useAccounts';
import Input from '../components/forms/Input';
import Button from '../components/forms/Button';
import Card from '../components/ui/Card';
import Modal from '../components/ui/Modal';

const ACCOUNT_TYPES = [
  { value: 'CASH', label: 'Cash', icon: '💵' },
  { value: 'BANK', label: 'Bank Account', icon: '🏦' },
  { value: 'UPI_WALLET', label: 'UPI/Wallet', icon: '📱' },
  { value: 'CREDIT_CARD', label: 'Credit Card', icon: '💳' },
  { value: 'OTHER', label: 'Other', icon: '📦' }
];

const formatCurrency = (amount, currency = 'INR') => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
};

export default function Accounts() {
  const { accounts, loading, createAccount, updateAccount, deleteAccount } = useAccounts();
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'BANK',
    balance: 0,
    currency: 'INR',
    icon: '',
    color: '#22c55e',
    isDefault: false
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setFormData({
      name: '',
      type: 'BANK',
      balance: 0,
      currency: 'INR',
      icon: '',
      color: '#22c55e',
      isDefault: false
    });
    setFormErrors({});
    setEditingAccount(null);
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      type: account.type,
      balance: account.balance,
      currency: account.currency,
      icon: account.icon || '',
      color: account.color || '#22c55e',
      isDefault: account.isDefault
    });
    setShowForm(true);
  };

  const handleDelete = (account) => {
    setDeleteConfirm(account);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteAccount(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.type) errors.type = 'Account type is required';
    if (formData.balance < 0) errors.balance = 'Balance cannot be negative';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      if (editingAccount) {
        await updateAccount(editingAccount.id, formData);
      } else {
        await createAccount(formData);
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
    if (showForm && !editingAccount) {
      resetForm();
    }
  }, [showForm, editingAccount]);

  const totalBalance = accounts.reduce((sum, a) => sum + (a.balance || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="section-title">Accounts</h1>
          <p className="section-subtitle">Manage your financial accounts</p>
        </div>
        <Button onClick={() => setShowForm(true)} variant="primary">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Account
        </Button>
      </div>

      <Card className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
        <div className="col-span-1 sm:col-span-2 lg:col-span-4">
          <p className="text-sm text-gray-500">Total Balance</p>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalBalance)}</p>
        </div>
      </Card>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-8 bg-gray-200 rounded w-1/2" />
            </Card>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts yet</h3>
          <p className="text-gray-500 mb-4">Create your first account to start tracking finances</p>
          <Button onClick={() => setShowForm(true)} variant="primary">
            Add Account
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <Card key={account.id} hover className="relative">
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl`} style={{ backgroundColor: `${account.color}20` }}>
                    {ACCOUNT_TYPES.find(t => t.value === account.type)?.icon || '💰'}
                  </div>
                  <div className="ml-3">
                    <h3 className="font-semibold text-gray-900">{account.name}</h3>
                    <p className="text-sm text-gray-500 capitalize">{account.type.toLowerCase().replace('_', ' ')}</p>
                  </div>
                </div>
                {account.isDefault && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 rounded-full">
                    Default
                  </span>
                )}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(account.balance, account.currency)}</p>
              </div>
              <div className="mt-4 flex items-center justify-end space-x-2">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(account)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(account)} className="text-danger-600 hover:bg-danger-50">
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => { setShowForm(false); resetForm(); }} title={editingAccount ? 'Edit Account' : 'Add Account'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Account Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={formErrors.name}
            placeholder="e.g. Main Checking"
            required
            autoFocus
          />
          <div>
            <label className="label">Account Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="input"
              required
            >
              {ACCOUNT_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.icon} {type.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Initial Balance"
            type="number"
            value={formData.balance}
            onChange={(e) => setFormData({ ...formData, balance: parseFloat(e.target.value) || 0 })}
            error={formErrors.balance}
            placeholder="0"
            required
            min="0"
            step="0.01"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Currency"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              placeholder="INR"
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
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={formData.isDefault}
              onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="isDefault" className="text-sm text-gray-700">
              Set as default account
            </label>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              {editingAccount ? 'Update' : 'Create'} Account
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Account" size="sm">
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone.
        </p>
        <p className="text-sm text-gray-500 mb-4">
          Note: Accounts with transactions cannot be deleted.
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