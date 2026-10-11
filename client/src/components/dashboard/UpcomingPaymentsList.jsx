import { formatCurrency } from '../../utils/format';

/**
 * Upcoming recurring payments (§14) — sorted by next due date by the server.
 * These are planning records only; no transaction is ever created from them.
 */
export default function UpcomingPaymentsList({ payments }) {
  return (
    <ul className="divide-y divide-gray-100">
      {payments.map((payment) => (
        <li key={payment.id} className="py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {payment.name}
              {!payment.isActive && <span className="ml-2 text-xs text-gray-400">(paused)</span>}
            </p>
            <p className="text-xs text-gray-500">
              {payment.dueLabel}
              {payment.frequencyLabel ? ` · ${payment.frequencyLabel}` : ''}
            </p>
          </div>
          <span className="text-sm font-semibold text-gray-900 shrink-0">
            {formatCurrency(payment.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
