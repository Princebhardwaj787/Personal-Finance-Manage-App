import { useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../forms/Input';
import Button from '../forms/Button';
import { useAccounts } from '../../hooks/useAccounts';
import { useCategories } from '../../hooks/useCategories';
import { FREQUENCY_OPTIONS } from '../../utils/constants';

const toInputDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Reusable create/edit form. Pass `key` so state resets per item. */
export default function RecurringFormModal({ open, onClose, item, onSubmit }) {
  const isEdit = Boolean(item);
  const { accounts, loading: accountsLoading } = useAccounts();
  const { categories: expenseCategories, loading: categoriesLoading } = useCategories('EXPENSE');

  const [name, setName] = useState(item?.name || '');
  const [amount, setAmount] = useState(item ? String(item.amount) : '');
  const [frequency, setFrequency] = useState(item?.frequency || 'MONTHLY');
  const [nextDueDate, setNextDueDate] = useState(toInputDate(item?.nextDueDate));
  const [accountId, setAccountId] = useState(item?.accountId || '');
  const [categoryId, setCategoryId] = useState(item?.categoryId || '');
  const [description, setDescription] = useState(item?.description || '');
  const [isActive, setIsActive] = useState(item ? item.isActive : true);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = 'Name is required';
    const value = parseFloat(amount);
    if (!amount || Number.isNaN(value)) next.amount = 'Amount is required';
    else if (value <= 0) next.amount = 'Amount must be greater than 0';
    if (!frequency) next.frequency = 'Frequency is required';
    if (!nextDueDate || Number.isNaN(new Date(nextDueDate).getTime())) {
      next.nextDueDate = 'Next due date must be a valid date';
    }
    if (!accountId) next.accountId = 'Account is required';
    if (!categoryId) next.categoryId = 'Expense category is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        amount: parseFloat(amount),
        frequency,
        nextDueDate,
        accountId,
        categoryId,
        description: description.trim() || null
      };
      if (isEdit) payload.isActive = isActive;

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setErrors({ form: err.response?.data?.error || 'Failed to save recurring expense' });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = accountsLoading || categoriesLoading;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? `Edit ${item.name}` : 'New Recurring Expense'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Netflix"
          error={errors.name}
          disabled={submitting}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="649"
            error={errors.amount}
            disabled={submitting}
            required
          />
          <div>
            <label htmlFor="recurring-frequency" className="label text-sm text-gray-500 mb-1">
              Frequency
            </label>
            <select
              id="recurring-frequency"
              className="input"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              disabled={submitting}
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        <Input
          label="Next due date"
          type="date"
          value={nextDueDate}
          onChange={(e) => setNextDueDate(e.target.value)}
          error={errors.nextDueDate}
          disabled={submitting}
          required
        />

        <div>
          <label htmlFor="recurring-account" className="label text-sm text-gray-500 mb-1">
            Account
          </label>
          <select
            id="recurring-account"
            className="input"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            disabled={submitting || busy}
          >
            <option value="">Select an account</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
          {errors.accountId && <p className="text-danger-600 text-xs mt-1">{errors.accountId}</p>}
        </div>

        <div>
          <label htmlFor="recurring-category" className="label text-sm text-gray-500 mb-1">
            Expense category
          </label>
          <select
            id="recurring-category"
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={submitting || busy}
          >
            <option value="">Select a category</option>
            {expenseCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          {errors.categoryId && <p className="text-danger-600 text-xs mt-1">{errors.categoryId}</p>}
        </div>

        <div>
          <label htmlFor="recurring-description" className="label text-sm text-gray-500 mb-1">
            Description
          </label>
          <textarea
            id="recurring-description"
            className="input"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Netflix subscription"
            disabled={submitting}
          />
        </div>

        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={submitting}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            Active (uncheck to pause this recurring expense)
          </label>
        )}

        {errors.form && (
          <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{errors.form}</div>
        )}

        <div className="flex justify-end space-x-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {isEdit ? 'Save Changes' : 'Add Recurring Expense'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
