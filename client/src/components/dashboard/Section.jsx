import Card, { CardHeader } from '../ui/Card';
import Button from '../forms/Button';
import { InlineSkeleton, ListSkeleton, ChartSkeleton } from './Skeleton';

function ErrorBlock({ title, message, onRetry }) {
  return (
    <div role="alert" className="py-6 text-center">
      <p className="text-sm font-medium text-gray-900">
        Unable to load {title.toLowerCase()}.
      </p>
      {message && <p className="text-sm text-gray-500 mt-1">{message}</p>}
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-4">
        Try again
      </Button>
    </div>
  );
}

function ErrorBanner({ title, onRetry }) {
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2"
    >
      <p className="text-sm text-danger-700">Unable to load {title.toLowerCase()}.</p>
      <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button>
    </div>
  );
}

function EmptyBlock({ title, description, action }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const SUGGESTED_SKELETON = <InlineSkeleton />;

/**
 * One dashboard section: heading + action, then the correct one of
 * loading / error / empty / content (§20–§22). Every section on the dashboard
 * goes through this so those four states can never drift apart.
 */
export default function Section({
  title,
  subtitle,
  action,
  className = '',
  loading = false,
  refreshing = false,
  error = null,
  onRetry,
  empty = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
  skeleton,
  children
}) {
  const body = loading
    ? (skeleton || SUGGESTED_SKELETON)
    : (
      <>
        {error && <ErrorBanner title={title} onRetry={onRetry} />}
        {empty
          ? (
            <EmptyBlock
              title={emptyTitle || `No ${title.toLowerCase()} yet`}
              description={emptyDescription}
              action={emptyAction}
            />
          )
          : children}
      </>
    );

  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} action={action} level={2} />
      <div aria-busy={refreshing || undefined}>
        {loading && <span className="sr-only" role="status">Loading {title.toLowerCase()}…</span>}
        {body}
      </div>
    </Card>
  );
}

export { ErrorBlock, EmptyBlock, ListSkeleton, ChartSkeleton };
