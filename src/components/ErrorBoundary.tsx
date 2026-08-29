import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error:', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="error-boundary" role="alert">
        <h2>Something went wrong</h2>
        <p>
          Quantum AI hit an unexpected error and couldn&apos;t display this view. Your
          conversations are safe — nothing was lost.
        </p>
        <pre className="error-boundary-detail">{this.state.error.message}</pre>
        <div className="error-boundary-actions">
          <button type="button" className="btn btn-primary" onClick={this.handleReset}>
            Try again
          </button>
          <button type="button" className="btn" onClick={this.handleReload}>
            Reload app
          </button>
        </div>
      </div>
    );
  }
}