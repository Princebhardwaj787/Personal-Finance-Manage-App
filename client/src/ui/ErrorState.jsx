import Button from '../components/forms/Button';

const ErrorState = ({ title, description, onRetry }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-12 text-center">
      <div className="w-full max-w-md">
        <svg className="w-12 h-12 mx-auto text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 6v2m-6-3h12m-6 3h12m0 0h12m-6-3v-2m0-6v-2" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-500 mb-6">{description}</p>
      </div>
      <Button variant="primary" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
};

export default ErrorState;