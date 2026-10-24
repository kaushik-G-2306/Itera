import { Component, type ReactNode, type ErrorInfo } from 'react';
import { clearAllExperiments } from '../services/experiments';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.clear();
      clearAllExperiments();
    } catch {
      // ignore
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8fafc',
            fontFamily: 'system-ui, sans-serif',
            padding: '24px',
          }}
        >
          <div
            style={{
              maxWidth: '520px',
              width: '100%',
              background: '#ffffff',
              borderRadius: '16px',
              padding: '32px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🧪</div>
            <h2 style={{ fontSize: '20px', color: '#0f172a', marginBottom: '8px' }}>
              Itera Encountered an Issue
            </h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '20px', lineHeight: 1.5 }}>
              A cached dataset mismatch occurred. Click below to reload fresh material experiments.
            </p>
            {this.state.error && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '12px',
                  color: '#991b1b',
                  textAlign: 'left',
                  marginBottom: '20px',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReset}
              style={{
                background: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              ↺ Reset & Load 3 Food Material Datasets
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
