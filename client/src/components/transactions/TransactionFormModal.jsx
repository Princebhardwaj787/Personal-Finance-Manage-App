import { useState } from 'react';
import Input from '../forms/Input';
import Button from '../forms/Button';
import Modal from '../ui/Modal';

const TYPES = [
  { value: 'INCOME', label: 'Income', active: 'border-green-500 bg-green-50 text-green-700' },
  { value: 'EXPENSE', label: 'Expense', active: 'border-danger-500 bg-danger-50 text-danger-700' }
];

const today = () => new Date().toISOString().split('T')[0];

/**
 * Create / edit a single transaction (income or expense only — transfers have
 * their own screen). Adds the Phase 7 `notes` and `reference` fields.
 * The parent passes `key={editing?.id ?? 'new'}` so state resets per record.
 */
export default function TransactionFormModal({
  open,
  onClose,
  transaction,
  accounts,
  expenseCategories,
  incomeCategories,
  onSubmit,
  submitting
}) {
  const [formData, setFormData] = useState(() => ({
    type: transaction?.type || 'EXPENSE',
    amount: transaction?.amount ?? '',
    description: transaction?.description || '',
    notes: transaction?.notes || '',
    reference: transaction?.reference || '',
    date: transaction ? transaction.date.split('T')[0] : today(),
    accountId: transaction?.accountId || '',
    categoryId: transaction?.categoryId || ''
  }));
  const [errors, setErrors] = useState({});

  const set = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  const availableCategories =
    formData.type === 'INCOME' ? incomeCategories : expenseCategories;

  const validate = () => {
    const next = {};
    if (formData.amount === '' || Number(formData.amount) <= 0) {
      next.amount = 'Amount must be greater than 0';
    }
    if (!formData.accountId) next.accountId = 'Account is required';
    if (!formData.categoryId) next.categoryId = 'Category is required';
    if ((formData.notes || '').length > 2000) next.notes = 'Notes must be 2000 characters or fewer';
    if ((formData.reference || '').length > 100) next.reference = 'Reference must be 100 characters or fewer';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit({
      type: formData.type,
      amount: Number(formData.amount),
      description: formData.description,
      notes: formData.notes,
      reference: formData.reference,
      date: formData.date,
      accountId: formData.accountId,
      categoryId: formData.categoryId
    });
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={transaction ? 'Edit Transaction' : 'Add Transaction'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <span className="label">Type</span>
          <div className="flex gap-2">
            {TYPES.map((type) => (
              <label
                key={type.value}
                className={`flex-1 px-4 py-2 rounded-lg text-center text-sm font-medium cursor-pointer transition-colors border-2 ${
                  formData.type === type.value
                    ? type.active
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={type.value}
                  checked={formData.type === type.value}
                  onChange={(e) => set('type', e.target.value)}
                  className="sr-only"
                />
                {type.label}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Amount"
            type="number"
            value={formData.amount}
            onChange={(e) => set('amount', e.target.value)}
            error={errors.amount}
            placeholder="0.00"
            required
            min="0.01"
            step="0.01"
          />
          <Input
            label="Date"
            type="date"
            value={formData.date}
            onChange={(e) => set('date', e.target.value)}
            required
          />
        </div>

        <Input
          label="Description"
          value={formData.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="e.g. Weekly groceries"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="txn-account">Account</label>
            <select
              id="txn-account"
              value={formData.accountId}
              onChange={(e) => set('accountId', e.target.value)}
              className={`input ${errors.accountId ? 'input-error' : ''}`}
              required
            >
              <option value="">Select Account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {errors.accountId && <p className="mt-1 text-sm text-danger-600" role="alert">{errors.accountId}</p>}
          </div>
          <div>
            <label className="label" htmlFor="txn-category">Category</label>
            <select
              id="txn-category"
              value={formData.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
              className={`input ${errors.categoryId ? 'input-error' : ''}`}
              required
            >
              <option value="">Select Category</option>
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
            {errors.categoryId && <p className="mt-1 text-sm text-danger-600" role="alert">{errors.categoryId}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Reference"
            value={formData.reference}
            onChange={(e) => set('reference', e.target.value)}
            error={errors.reference}
            placeholder="Invoice / UPI / cheque no."
            maxLength={100}
          />
          <div />
        </div>

        <div>
          <label className="label" htmlFor="txn-notes">Notes</label>
          <textarea
            id="txn-notes"
            value={formData.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Anything you want to remember about this transaction"
            className={`input ${errors.notes ? 'input-error' : ''}`}
          />
          <div className="flex justify-between mt-1">
            {errors.notes ? (
              <p className="text-sm text-danger-600" role="alert">{errors.notes}</p>
            ) : (
              <span />
            )}
            <span className="text-xs text-gray-400">{(formData.notes || '').length}/2000</span>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {transaction ? 'Update' : 'Create Transaction'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
