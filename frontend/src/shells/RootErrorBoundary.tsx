import { Component, type ReactNode } from 'react';

/**
 * RootErrorBoundary — last line of defense against a black screen.
 *
 * Any render error that escapes the page-level HallpassGate boundaries lands
 * here and renders a designed, honest failure state (what happened + reload)
 * instead of React unmounting the whole tree to black.
 *
 * Added 2026-10-14 after a module-level selector sanity check threw during
 * import and black-screened /app with zero body text.
 */
export class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[hallpass] uncaught render error:', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#121110',
          color: '#FFF9EF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '34rem',
            border: '1px solid rgba(255,178,36,0.3)',
            background: 'rgba(255,178,36,0.06)',
            borderRadius: '1rem',
            padding: '2.5rem',
          }}
        >
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>
            Something went wrong loading this page.
          </h1>
          <p style={{ marginTop: '0.75rem', lineHeight: 1.6, opacity: 0.75 }}>
            The app hit an unexpected error and stopped instead of showing you a
            broken page. Nothing was submitted on-chain — this is a display
            problem, not a transaction problem.
          </p>
          <p
            style={{
              marginTop: '0.75rem',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              opacity: 0.5,
              wordBreak: 'break-word',
            }}
          >
            {error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.5rem',
              minHeight: '52px',
              padding: '0 2rem',
              borderRadius: '999px',
              border: 'none',
              background: '#FFB224',
              color: '#121110',
              fontWeight: 800,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
