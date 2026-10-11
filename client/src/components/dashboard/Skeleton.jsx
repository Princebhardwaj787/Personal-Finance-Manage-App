/** Reusable loading placeholders so no dashboard section ever looks empty (§20). */

export function Skeleton({ className = '' }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

/** Screen-reader announcement used by every skeleton. */
export function LoadingText({ children }) {
  return <span className="sr-only" role="status">{children}</span>;
}

export function CardsSkeleton({ count = 5, label = 'Loading financial summary…' }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card p-6 animate-pulse" aria-hidden="true">
          <Skeleton className="h-4 w-1/2 mb-3" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4, label = 'Loading…' }) {
  return (
    <div className="space-y-3" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3" aria-hidden="true">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 260, label = 'Loading chart…' }) {
  return (
    <div style={{ height }} className="w-full" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="h-full flex items-end gap-2 px-2 pb-6" aria-hidden="true">
        {[42, 68, 35, 80, 55, 72, 48].map((value, index) => (
          <div key={index} className="flex-1 bg-gray-200 rounded animate-pulse" style={{ height: `${value}%` }} />
        ))}
      </div>
    </div>
  );
}

export function InlineSkeleton({ label = 'Loading…' }) {
  return (
    <div className="py-6" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-4 w-2/3 mb-3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
