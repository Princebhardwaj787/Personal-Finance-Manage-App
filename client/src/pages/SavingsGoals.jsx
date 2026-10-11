import { useState, useCallback } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/forms/Button';
import Loading from '../components/ui/Loading';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Modal from '../components/ui/Modal';
import GoalCard from '../components/savingsGoals/GoalCard';
import GoalFormModal from '../components/savingsGoals/GoalFormModal';
import ContributionModal from '../components/savingsGoals/ContributionModal';
import ContributionHistory from '../components/savingsGoals/ContributionHistory';
import { useSavingsGoals } from '../hooks/useSavingsGoals';
import { formatCurrency } from '../utils/format';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ARCHIVED', label: 'Archived' }
];

export default function SavingsGoals() {
  const {
    goals, visibleGoals, loading, error, status, setStatus, totals,
    refresh, createGoal, updateGoal, deleteGoal, addContribution
  } = useSavingsGoals();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [contributing, setContributing] = useState(null);
  const [historyGoal, setHistoryGoal] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [deleting, setDeleting] = useState(null);
  const [banner, setBanner] = useState(null);

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (goal) => { setEditing(goal); setShowForm(true); };

  const handleContribution = useCallback(
    async (payload) => {
      const result = await addContribution(contributing.id, payload);
      // Progress, remaining, percentage and status all come back recalculated.
      setHistoryVersion((v) => v + 1);
      setBanner({
        type: 'success',
        text: `Added ${formatCurrency(payload.amount)} to ${contributing.name}` +
          (result.goal.status === 'COMPLETED' ? ' — goal completed! 🎉' : '')
      });
      return result;
    },
    [addContribution, contributing]
  );

  const confirmDelete = async () => {
    try {
      await deleteGoal(deleting.id);
      setDeleting(null);
      setBanner({ type: 'success', text: `Deleted “${deleting.name}”` });
    } catch (err) {
      setBanner({ type: 'error', text: err.response?.data?.error || 'Failed to delete goal' });
      setDeleting(null);
    }
  };

  const activeGoals = goals.filter((g) => g.status === 'ACTIVE');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Savings Goals</h1>
          <p className="text-gray-500 mt-1">Track progress toward what you are saving for</p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>+ New Goal</Button>
      </div>

      {banner && (
        <div
          className={`p-3 rounded-lg text-sm flex justify-between ${
            banner.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
          }`}
        >
          <span>{banner.text}</span>
          <button className="font-medium" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      {!loading && !error && goals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card padding="p-4">
            <p className="text-sm text-gray-500">Active goals</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {goals.filter((g) => g.status === 'ACTIVE').length}
            </p>
          </Card>
          <Card padding="p-4">
            <p className="text-sm text-gray-500">Saved</p>
            <p className="text-2xl font-bold text-primary-700 mt-1">{formatCurrency(totals.totalSaved)}</p>
          </Card>
          <Card padding="p-4">
            <p className="text-sm text-gray-500">Total targets</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totals.totalTargets)}</p>
          </Card>
        </div>
      )}

      {goals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                status === f.value
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loading /></div>
      ) : error ? (
        <ErrorState title="Unable to load savings goals" description={error} onRetry={() => refresh()} />
      ) : goals.length === 0 ? (
        <EmptyState
          title="No savings goals yet"
          description="Create your first goal — an emergency fund, a new laptop, a vacation — and start saving."
          showForm={() => { setStatus(''); openCreate(); }}
          formTitle="Create Goal"
        />
      ) : visibleGoals.length === 0 ? (
        <EmptyState
          title="No goals with this filter"
          description="Try a different filter, or create a new goal."
          showForm={() => setStatus('')}
          formTitle="Show all goals"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {visibleGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onAdd={setContributing}
              onEdit={openEdit}
              onDelete={setDeleting}
              onHistory={setHistoryGoal}
            />
          ))}
        </div>
      )}

      {activeGoals.length > 0 && (
        <p className="text-xs text-gray-400">
          {activeGoals.length} active goal{activeGoals.length === 1 ? '' : 's'} ·
          {' '}{formatCurrency(totals.totalSaved)} saved of {formatCurrency(totals.totalTargets)}
        </p>
      )}

      <GoalFormModal
        key={editing ? editing.id : 'new-goal'}
        open={showForm}
        onClose={() => setShowForm(false)}
        goal={editing}
        onSubmit={async (payload) => {
          if (editing) await updateGoal(editing.id, payload);
          else await createGoal(payload);
        }}
      />

      <ContributionModal
        key={contributing ? `contrib-${contributing.id}` : 'contrib-new'}
        open={Boolean(contributing)}
        onClose={() => setContributing(null)}
        goal={contributing}
        onSubmit={handleContribution}
      />

      {historyGoal && (
        <ContributionHistory
          key={`${historyGoal.id}-${historyVersion}`}
          open
          onClose={() => setHistoryGoal(null)}
          goal={historyGoal}
        />
      )}

      <Modal isOpen={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete Savings Goal" size="sm">
        <p className="text-sm text-gray-600">
          Delete <strong>{deleting?.name}</strong> and its contribution history?
          Your transactions are not affected.
        </p>
        <div className="flex justify-end space-x-3 mt-5">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete}>Delete Goal</Button>
        </div>
      </Modal>
    </div>
  );
}
