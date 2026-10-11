import { useState, useEffect, useRef, useCallback } from 'react';

const messageFrom = (error) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  'Request failed';

/**
 * Fetch state for ONE dashboard section (§20–§22).
 *
 * Each section owns its own request, so a failing analytics call can never
 * blank the recent-transactions card. `depKey` is a plain string (usually
 * `JSON.stringify(query)`) so the dependency array stays a constant length.
 *
 * - `loading`   : first load, nothing to show yet -> render a skeleton
 * - `refreshing`: refetching with previous data on screen -> aria-busy only
 * - `error`     : previous data is kept, plus a retry button
 */
export default function useSectionFetch(fetcher, depKey = '', { enabled = true } = {}) {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const requestIdRef = useRef(0);
  const [state, setState] = useState({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState((prev) => ({ data: prev.data, loading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      if (requestId !== requestIdRef.current) return; // superseded
      setState({ data, loading: false, error: null });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setState((prev) => ({ data: prev.data, loading: false, error: messageFrom(error) }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    return () => {
      // Invalidate any in-flight request when deps change or on unmount.
      requestIdRef.current += 1;
    };
  }, [load, enabled, depKey]);

  return {
    data: state.data,
    loading: state.loading && state.data === null,
    refreshing: state.loading && state.data !== null,
    error: state.error,
    retry: load
  };
}
