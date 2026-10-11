import { useState } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/forms/Button';
import Input from '../components/forms/Input';
import Modal from '../components/ui/Modal';
import Loading from '../components/ui/Loading';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { useBudgets } from '../hooks/useBudgets';
import { useCategories } from '../hooks/useCategories';
import { formatCurrency } from '../utils/format';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const statusFor = (percentage) => {
  if (percentage >= 100) return { label: 'Exceeded', chip: 'bg-red-100 text-red-700', bar: 'bg-red-500' };
  if (percentage >= 80) return { label: 'Warning', chip: 'bg-yellow-100 text-yellow-800', bar: 'bg-yellow-500' };
  return { label: 'On Track', chip: 'bg-green-100 text-green-700', bar: 'bg-green-500' };
};

function BudgetCard({ budget, month, year, onEdit, onDelete }) {
  const status = statusFor(budget.percentageUsed);

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${budget.category.color || '#22c55e'}20` }}
          >
            {budget.category.icon || '💰'}
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{budget.category.name}</h3>
            <p className="text-sm text-gray-500">{MONTH_NAMES[month - 1]} {year}</p>
          </div>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.chip}`}>
          {status.label} · {budget.percentageUsed}%
        </span>
      </div>

      <div className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between text-gray-500">
          <span>Budget</span>
          <span>{formatCurrency(budget.budgetAmount)}</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Spent</span>
          <span>{formatCurrency(budget.spentAmount)}</span>
        </div>
        <div className="flex justify-between font-medium text-gray-900">
          <span>Remaining</span>
          <span className={budget.remainingAmount < 0 ? 'text-red-600' : 'text-green-600'}>
            {budget.remainingAmount < 0
              ? `${formatCurrency(Math.abs(budget.remainingAmount))} over`
              : formatCurrency(budget.remainingAmount)}
          </span>
        </div>
      </div>

      <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-full rounded-full transition-all ${status.bar}`}
          style={{ width: `${Math.min(budget.percentageUsed, 100)}%` }}
        />
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end space-x-2">
        <Button variant="ghost" size="sm" onClick={() => onEdit(budget)}>Edit</Button>
        <Button variant="danger" size="sm" onClick={() => onDelete(budget)}>Delete</Button>
      </div>
    </Card>
  );
}

function BudgetFormModal({ open, onClose, budget, month, year, categories, onSubmit }) {
  const [categoryId, setCategoryId] = useState(budget?.category?.id || '');
  const [amount, setAmount] = useState(budget ? String(budget.budgetAmount) : '');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    if (!categoryId) nextErrors.categoryId = 'Category is required';
    if (!amount || parseFloat(amount) <= 0) nextErrors.amount = 'Amount must be greater than 0';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit({ categoryId, amount: parseFloat(amount), month, year });
      onClose();
    } catch (err) {
      setErrors({ form: err.response?.data?.error || 'Failed to save budget' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={budget ? 'Edit Budget' : 'Create Budget'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="budget-category" className="label text-sm text-gray-500 mb-1">Category</label>
          <select
            id="budget-category"
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={!!budget || submitting}
          >
            <option value="">Select a category</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          {errors.categoryId && <p className="text-danger-600 text-xs mt-1">{errors.categoryId}</p>}
          {budget && <p className="text-xs text-gray-400 mt-1">Category cannot be changed after creation.</p>}
        </div>

        <Input
          label="Budget Amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 8000"
          error={errors.amount}
          disabled={submitting}
          required
        />

        <p className="text-sm text-gray-500">
          {MONTH_NAMES[month - 1]} {year}
        </p>

        {errors.form && (
          <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{errors.form}</div>
        )}

        <div className="flex justify-end space-x-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {budget ? 'Save Changes' : 'Create Budget'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function BudgetPage() {
  const {
    budgets, loading, error, month, year, setMonth, setYear,
    fetchBudgets, createBudget, updateBudget, deleteBudget
  } = useBudgets(new Date().getMonth() + 1, new Date().getFullYear());

  const { categories: expenseCategories } = useCategories('EXPENSE');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [actionError, setActionError] = useState(null);

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); } else { setMonth(month - 1); }
  };
  const goNext = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); } else { setMonth(month + 1); }
  };

  const totalBudget = budgets.reduce((sum, b) => sum + b.budgetAmount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.spentAmount, 0);
  const totalRemaining = budgets.reduce((sum, b) => sum + b.remainingAmount, 0);
  const exceededCount = budgets.filter((b) => b.status === 'EXCEEDED').length;

  const handleDelete = async () => {
    try {
      await deleteBudget(deleting.id);
      setDeleting(null);
    } catch (err) {
      setActionError(err.response?.data?.error || 'Failed to delete budget');
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loading />
        <span className="ml-4 text-gray-500">Loading budgets...</span>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Unable to load budgets"
        description={error}
        onRetry={() => fetchBudgets(month, year)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budgets</h1>
          <p className="text-gray-500 mt-1">{MONTH_NAMES[month - 1]} {year} budget overview</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="secondary" size="sm" onClick={goPrev}>
            ← {MONTH_NAMES[month === 1 ? 11 : month - 2]} {month === 1 ? year - 1 : year}
          </Button>
          <Button variant="secondary" size="sm" onClick={goNext}>
            {MONTH_NAMES[month === 12 ? 0 : month]} {month === 12 ? year + 1 : year} →
          </Button>
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            + Add Budget
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 rounded bg-red-50 text-red-700 text-sm flex justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-medium">Dismiss</button>
        </div>
      )}

      {budgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card padding="p-4">
            <p className="text-sm text-gray-500">Total Budget</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalBudget)}</p>
          </Card>
          <Card padding="p-4">
            <p className="text-sm text-gray-500">Total Spent</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalSpent)}</p>
          </Card>
          <Card padding="p-4">
            <p className="text-sm text-gray-500">Remaining</p>
            <p className={`text-2xl font-bold mt-1 ${totalRemaining < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(totalRemaining)}
            </p>
          </Card>
        </div>
      )}

      {exceededCount > 0 && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          You have {exceededCount} budget{exceededCount !== 1 ? 's' : ''} exceeded. Review your spending.
        </div>
      )}

      {budgets.length === 0 ? (
        <EmptyState
          title="No budgets for this month"
          description="Create your first budget to start tracking your spending. Set an amount for each expense category and watch your progress."
          showForm={() => { setEditing(null); setShowForm(true); }}
          formTitle="Create Budget"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              month={month}
              year={year}
              onEdit={(b) => { setEditing(b); setShowForm(true); }}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <BudgetFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        budget={editing}
        month={month}
        year={year}
        categories={expenseCategories}
        onSubmit={async (data) => {
          if (editing) await updateBudget(editing.id, { amount: data.amount });
          else await createBudget(data);
        }}
      />

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete Budget" size="sm">
        <p className="text-sm text-gray-600">
          Delete the budget for <strong>{deleting?.category?.name}</strong> in {MONTH_NAMES[month - 1]} {year}?
          This does not affect your transactions.
        </p>
        <div className="flex justify-end space-x-3 mt-5">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
