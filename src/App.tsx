import { useState, useEffect } from 'react';
import './styles/global.css';
import ExperimentsPage from './pages/ExperimentsPage';
import ExperimentWorkspacePage from './pages/ExperimentWorkspacePage';
import ComparePage from './pages/ComparePage';
import InsightsPage from './pages/InsightsPage';
import { auth, ensureAuth, signInWithGoogle, logOut } from './firebase';
import type { User } from 'firebase/auth';
import type { Experiment } from './types/experiment';
import { fetchExperiments } from './services/experiments';

type Page = 'experiments' | 'experiment-workspace' | 'compare' | 'insights';

interface NavigationState {
  page: Page;
  data?: Record<string, unknown>;
}

function App() {
  const [nav, setNav] = useState<NavigationState>({ page: 'experiments' });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  useEffect(() => {
    // Listen for real-time auth changes (Google login, anonymous, logout)
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      setRefreshKey((k) => k + 1);
    });

    ensureAuth().catch((err) => console.warn('Auth check fallback:', err));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    fetchExperiments()
      .then((data) => {
        setExperiments(data || []);
      })
      .catch(() => {
        setExperiments([]);
      });
  }, [refreshKey, currentUser]);

  function navigate(page: string, data?: Record<string, unknown>) {
    setNav({ page: page as Page, data });
    window.scrollTo(0, 0);
  }

  function handleDataUpdated() {
    setRefreshKey((k) => k + 1);
  }

  const navItems: { id: Page; icon: string; label: string }[] = [
    { id: 'experiments', icon: '🧪', label: 'Experiments Hub' },
  ];

  function renderPage() {
    switch (nav.page) {
      case 'experiments':
        return (
          <ExperimentsPage key={refreshKey} onNavigate={navigate} />
        );
      case 'experiment-workspace': {
        const exp = (nav.data?.experiment as Experiment) || experiments[0];
        // Ensure we pass the freshest copy from experiments array if available
        const freshExp = experiments.find((e) => e.id === exp.id) || exp;
        return (
          <ExperimentWorkspacePage
            key={freshExp.id + refreshKey}
            experiment={freshExp}
            onNavigate={navigate}
            onExperimentUpdated={handleDataUpdated}
          />
        );
      }
      case 'compare':
        return (
          <ComparePage
            key={refreshKey}
            experimentId={nav.data?.experimentId as string | undefined}
            runAId={nav.data?.runAId as string | undefined}
            runBId={nav.data?.runBId as string | undefined}
            experiments={experiments}
            onNavigate={navigate}
          />
        );
      case 'insights':
        return (
          <InsightsPage
            key={refreshKey}
            experimentId={nav.data?.experimentId as string | undefined}
            experiments={experiments}
            onNavigate={navigate}
          />
        );
      default:
        return <ExperimentsPage key={refreshKey} onNavigate={navigate} />;
    }
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand" onClick={() => navigate('experiments')} style={{ cursor: 'pointer' }}>
          <div className="sidebar-brand-icon">🧪</div>
          <h1>Itera</h1>
        </div>
        <div className="sidebar-tagline">
          Every experiment moves you forward.
        </div>

        <div className="sidebar-divider" />

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item ${nav.page === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Active Experiment Container Indicator if in Workspace */}
        {nav.page === 'experiment-workspace' && Boolean(nav.data?.experiment) && (
          <div style={{ padding: '0 20px', marginTop: '12px' }}>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
              }}
            >
              <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                ACTIVE EXPERIMENT
              </span>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: '12px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(nav.data?.experiment as Experiment)?.title}
              </div>
            </div>
          </div>
        )}

        <div className="sidebar-divider" />

        {/* User Auth Status Panel */}
        <div style={{ padding: '0 20px', fontSize: '11px' }}>
          {currentUser ? (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt=""
                    style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                  />
                ) : (
                  <span style={{ fontSize: '16px' }}>👤</span>
                )}
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: '#fff' }}>
                  {currentUser.displayName || currentUser.email || 'Anonymous Lab User'}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-success)', fontSize: '10px' }}>● Cloud Sync Active</span>
                <button
                  onClick={() => logOut()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '10px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button
                className="btn btn-secondary btn-sm"
                style={{
                  width: '100%',
                  fontSize: '11px',
                  padding: '8px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                onClick={async () => {
                  try {
                    await signInWithGoogle();
                  } catch (err) {
                    console.warn('Google sign-in error:', err);
                  }
                }}
              >
                <span>🔐</span> Sign in with Google
              </button>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginTop: '6px', textAlign: 'center' }}>
                or use local offline storage
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
