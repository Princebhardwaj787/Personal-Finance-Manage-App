export default function Card({ children, className = '', hover = false, padding = 'p-6' }) {
  return (
    <div className={`card ${hover ? 'card-hover' : ''} ${padding} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className = '', level = 3 }) {
  const Heading = level === 2 ? 'h2' : level === 4 ? 'h4' : 'h3';
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <div>
        <Heading className="text-lg font-semibold text-gray-900">{title}</Heading>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardContent({ children, className = '' }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return (
    <div className={`mt-4 pt-4 border-t border-gray-100 ${className}`}>
      {children}
    </div>
  );
}