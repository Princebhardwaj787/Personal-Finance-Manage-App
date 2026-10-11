import Button from '../components/forms/Button';

const EmptyState = ({ title, description, showForm, formTitle, compact = false }) => {
  return (
    <div
      className={`${compact ? 'py-8' : 'min-h-screen py-12'} flex flex-col items-center justify-center text-center`}
    >
      <div className={compact ? 'w-full' : 'w-full max-w-md'}>
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
        <p className="text-gray-500 mb-6">{description}</p>
      </div>
      {showForm && (
        <Button variant="primary" onClick={() => showForm(false)} className="mt-4">
          {formTitle || 'Create'}
        </Button>
      )}
    </div>
  );
};

export default EmptyState;