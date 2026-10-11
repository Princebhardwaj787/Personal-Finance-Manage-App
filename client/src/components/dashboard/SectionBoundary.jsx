import React from 'react';
import Button from '../forms/Button';

/**
 * Per-section error boundary (§22).
 *
 * A crash inside one chart must not take down the rest of the dashboard, so
 * every heavy section is wrapped in its own boundary with its own retry.
 */
export default class SectionBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Dashboard section failed:', error, info);
  }

  retry() {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="py-6 text-center">
          <p className="text-sm font-medium text-gray-900">Unable to load this section.</p>
          <p className="text-sm text-gray-500 mt-1">Try again.</p>
          <Button variant="secondary" size="sm" onClick={this.retry} className="mt-4">
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
