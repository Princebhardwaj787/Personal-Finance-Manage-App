/**
 * Sort whitelists shared by every list endpoint.
 *
 * User input is NEVER interpolated into an order-by: only fields that appear
 * in `allowed` are used, everything else falls back to `fallback`. A stable
 * `id` tiebreaker keeps pagination from repeating/skipping rows when the sort
 * column has duplicates.
 */
export const SORT_ORDERS = Object.freeze(['asc', 'desc']);

export const buildOrderBy = ({ sortBy, sortOrder, allowed = [], fallback = 'date' }) => {
  const field = Array.isArray(allowed) && allowed.includes(sortBy) ? sortBy : fallback;
  const requested = String(sortOrder ?? '').toLowerCase();
  const direction = SORT_ORDERS.includes(requested) ? requested : 'desc';
  return [{ [field]: direction }, { id: direction }];
};
