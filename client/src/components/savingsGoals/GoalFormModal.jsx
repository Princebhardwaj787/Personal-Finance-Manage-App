import { useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../forms/Input';
import Button from '../forms/Button';
import { GOAL_STATUSES } from '../../utils/constants';

const toInputDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Reusable create/edit form for savings goals.
 * Render it with a `key` so state resets between different goals.
 */
export default function GoalFormModal({ open, onClose, goal, onSubmit }) {
  const isEdit = Boolean(goal);

  const [name, setName] = useState(goal?.name || '');
  const [description, setDescription] = useState(goal?.description || '');
  const [targetAmount, setTargetAmount] = useState(
    goal ? String(goal.targetAmount) : ''
  );
  const [currentAmount, setCurrentAmount] = useState(
    goal ? String(goal.currentAmount) : ''
  );
  const [targetDate, setTargetDate] = useState(toInputDate(goal?.targetDate));
  const [status, setStatus] = useState(goal?.status || 'ACTIVE');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = 'Goal name is required';
    else if (name.trim().length > 100) next.name = 'Name must be 100 characters or fewer';

    const target = parseFloat(targetAmount);
    if (!targetAmount || Number.isNaN(target)) next.targetAmount = 'Target amount is required';
    else if (target <= 0) next.targetAmount = 'Target amount must be greater than 0';

    const current = currentAmount === '' ? 0 : parseFloat(currentAmount);
    if (Number.isNaN(current)) next.currentAmount = 'Current amount must be a number';
    else if (current < 0) next.currentAmount = 'Current amount cannot be negative';
    else if (!Number.isNaN(target) && target > 0 && current > target) {
      next.currentAmount = 'Current amount cannot exceed the target amount';
    }

    if (!targetDate) next.targetDate = 'Target date is required';
    else if (Number.isNaN(new Date(targetDate).getTime())) next.targetDate = 'Enter a valid date';

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
        description: description.trim() || null,
        targetAmount: parseFloat(targetAmount),
        targetDate
      };

      if (!isEdit) {
        payload.currentAmount = currentAmount === '' ? 0 : parseFloat(currentAmount);
      } else {
        payload.status = status;
      }

      await onSubmit(payload);
      onClose();
    } catch (err) {
      setErrors({
        form: err.response?.data?.error || 'Failed to save savings goal'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? `Edit ${goal.name}` : 'New Savings Goal'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Goal name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. New Laptop"
          error={errors.name}
          disabled={submitting}
          required
        />

        <div>
          <label htmlFor="goal-description" className="label text-sm text-gray-500 mb-1">
            Description
          </label>
          <textarea
            id="goal-description"
            className="input"
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Savings for a new laptop"
            disabled={submitting}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Target amount"
            type="number"
            min="0"
            step="0.01"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="80000"
            error={errors.targetAmount}
            disabled={submitting}
            required
          />
          <Input
            label={isEdit ? 'Amount saved' : 'Current amount'}
            type="number"
            min="0"
            step="0.01"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
            placeholder="15000"
            error={errors.currentAmount}
            helperText={isEdit ? 'Use "Add money" to change this.' : undefined}
            disabled={submitting || isEdit}
            required={!isEdit}
          />
        </div>

        <Input
          label="Target date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          error={errors.targetDate}
          disabled={submitting}
          required
        />

        {isEdit && (
          <div>
            <label htmlFor="goal-status" className="label text-sm text-gray-500 mb-1">
              Status
            </label>
            <select
              id="goal-status"
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={submitting}
            >
              {GOAL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Archived goals are hidden from active totals. Choose Active to reopen a goal.
            </p>
          </div>
        )}

        {errors.form && (
          <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{errors.form}</div>
        )}

        <div className="flex justify-end space-x-3 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {isEdit ? 'Save Changes' : 'Create Goal'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
