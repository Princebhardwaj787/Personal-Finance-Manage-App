import { PERIOD_OPTIONS } from '../../utils/period';

const BASE_CHIP =
  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1';

/**
 * Centralised period selector (§4, §23).
 * Pill buttons are real buttons with `aria-pressed`, and the custom range uses
 * labelled native date inputs so keyboard and screen-reader users get the
 * standard controls for free.
 */
export default function PeriodSelector({
  draftPeriod,
  isCustom,
  customStart,
  customEnd,
  error,
  needsDates,
  label,
  onSelect,
  onChangeStart,
  onChangeEnd
}) {
  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div
        role="group"
        aria-label="Dashboard period"
        className="flex flex-wrap gap-1.5 sm:justify-end"
      >
        {PERIOD_OPTIONS.map((option) => {
          const active = draftPeriod === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(option.value)}
              className={`${BASE_CHIP} ${
                active
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {isCustom && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="dashboard-start-date" className="label mb-1">Start date</label>
            <input
              id="dashboard-start-date"
              type="date"
              className="input"
              value={customStart}
              max={customEnd || undefined}
              onChange={(event) => onChangeStart(event.target.value)}
              aria-describedby={error ? 'dashboard-period-error' : undefined}
            />
          </div>
          <div>
            <label htmlFor="dashboard-end-date" className="label mb-1">End date</label>
            <input
              id="dashboard-end-date"
              type="date"
              className="input"
              value={customEnd}
              min={customStart || undefined}
              onChange={(event) => onChangeEnd(event.target.value)}
              aria-describedby={error ? 'dashboard-period-error' : undefined}
            />
          </div>
        </div>
      )}

      {error && (
        <p id="dashboard-period-error" role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}
      {!error && needsDates && (
        <p className="text-sm text-gray-500">Choose a start and end date.</p>
      )}

      <p className="text-sm text-gray-600 font-medium" aria-live="polite">
        <span className="sr-only">Selected period: </span>
        {label}
      </p>
    </div>
  );
}
