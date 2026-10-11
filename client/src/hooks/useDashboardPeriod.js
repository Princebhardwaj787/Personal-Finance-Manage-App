import { useState, useCallback, useMemo } from 'react';
import { resolvePeriod, currentMonthRange } from '../utils/period';

/**
 * Centralised dashboard period selector state (§23).
 *
 * `query` is only ever updated when the draft resolves to a valid range, so an
 * incomplete custom range can never trigger a request with bad dates — the
 * dashboard keeps showing the last good period and `error` explains why.
 */
export default function useDashboardPeriod(initialPeriod = 'this_month') {
  const [period, setPeriod] = useState(initialPeriod);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [committed, setCommitted] = useState(() => resolvePeriod({ period: initialPeriod }));

  const apply = useCallback((next) => {
    const resolved = resolvePeriod(next);
    if (resolved.valid) setCommitted(resolved);
    return resolved;
  }, []);

  const selectPeriod = useCallback((value) => {
    setPeriod(value);
    if (value === 'custom' && !customStart && !customEnd) {
      // Prefill with the current month so "Custom" is usable immediately.
      const range = currentMonthRange();
      setCustomStart(range.start);
      setCustomEnd(range.end);
      return apply({ period: 'custom', startDate: range.start, endDate: range.end });
    }
    return apply({ period: value, startDate: customStart, endDate: customEnd });
  }, [apply, customStart, customEnd]);

  const changeCustomStart = useCallback((value) => {
    setCustomStart(value);
    return apply({ period: 'custom', startDate: value, endDate: customEnd });
  }, [apply, customEnd]);

  const changeCustomEnd = useCallback((value) => {
    setCustomEnd(value);
    return apply({ period: 'custom', startDate: customStart, endDate: value });
  }, [apply, customStart]);

  const draft = useMemo(
    () => resolvePeriod({ period, startDate: customStart, endDate: customEnd }),
    [period, customStart, customEnd]
  );

  return {
    // committed (valid) state -> drives every request
    period: committed.query.period,
    query: committed.query,
    label: committed.label,
    // draft state -> drives the selector UI and validation messages
    draftPeriod: period,
    customStart,
    customEnd,
    error: draft.error,
    needsDates: draft.needsDates,
    isCustom: period === 'custom',
    selectPeriod,
    changeCustomStart,
    changeCustomEnd
  };
}
