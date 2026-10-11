import { useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../forms/Input';
import Button from '../forms/Button';
import { formatCurrency } from '../../utils/format';

/**
 * Contribution dialog: "Add to <goal>".
 * Amount is capped at the goal's remaining amount (overfunding is not
 * supported), and the note becomes part of the contribution history.
 */
export default function ContributionModal({ open, onClose, goal, onSubmit }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!goal) return null;

  const remaining = goal.remainingAmount ?? 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    const next = {};

    if (!amount || Number.isNaN(value)) next.amount = 'Amount is required';
    else if (value <= 0) next.amount = 'Amount must be greater than 0';
    else if (value > remaining) next.amount = `Only ${formatCurrency(remaining)} remaining on this goal`;

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit({ amount: value, note: note.trim() || null });
      setAmount('');
      setNote('');
      setErrors({});
      onClose();
    } catch (err) {
      setErrors({ form: err.response?.data?.error || 'Failed to add contribution' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={`Add to ${goal.name}`} size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-lg bg-gray-50 text-sm text-gray-600">
          <div className="flex justify-between">
            <span>Saved so far</span>
            <span className="font-medium text-gray-900">{formatCurrency(goal.currentAmount)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Target</span>
            <span className="font-medium text-gray-900">{formatCurrency(goal.targetAmount)}</span>
          </div>
          <div className="flex justify-between mt-1 pt-1 border-t border-gray-200">
            <span>Remaining</span>
            <span className="font-medium text-primary-700">{formatCurrency(remaining)}</span>
          </div>
        </div>

        <Input
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="5000"
          error={errors.amount}
          helperText={remaining > 0 ? `Up to ${formatCurrency(remaining)} can be added` : 'Goal is already fully funded'}
          disabled={submitting || remaining <= 0}
          required
        />

        <Input
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Savings from September salary"
          maxLength={300}
          disabled={submitting}
        />

        {errors.form && (
          <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{errors.form}</div>
        )}

        <div className="flex justify-end space-x-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={submitting} disabled={remaining <= 0}>
            Add Contribution
          </Button>
        </div>
      </form>
    </Modal>
  );
}
