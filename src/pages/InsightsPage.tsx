import { useState } from 'react';
import type { Experiment, AIHypothesisResponse } from '../types/experiment';
import { suggestNextExperiment } from '../services/ai';

interface InsightsPageProps {
  experimentId?: string;
  experiments: Experiment[];
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
}

export default function InsightsPage({
  experimentId,
  experiments,
  onNavigate,
}: InsightsPageProps) {
  const [selectedExpId, setSelectedExpId] = useState<string>(
    experimentId || experiments[0]?.id || ''
  );
  const [hypothesis, setHypothesis] = useState<AIHypothesisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeExp = experiments.find((e) => e.id === selectedExpId) || experiments[0];
  const runs = activeExp?.runs || [];

  async function handleSuggest() {
    if (!activeExp) return;
    setLoading(true);
    setError(null);
    try {
      const result = await suggestNextExperiment(runs, activeExp.material);
      setHypothesis(result);
    } catch (err) {
      console.error('AI suggestion failed:', err);
      setError('AI suggestion failed. Check connection or retry.');
    } finally {
      setLoading(false);
    }
  }

  function handleExperimentChange(id: string) {
    setSelectedExpId(id);
    setHypothesis(null);
    setError(null);
  }

  // Summary counts for this experiment
  const outcomes = runs.reduce(
    (acc, r) => {
      acc[r.outcome] = (acc[r.outcome] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h2>AI Insights & Next-Step Hypotheses</h2>
            <p>
              Gemini 2.5 Flash analyzes test runs strictly within the selected experiment container to formulate the next trial.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => onNavigate('experiments')}>
            ← Back to All Experiments
          </button>
        </div>
      </div>

      {/* Experiment Selector Bar */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-body" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)' }}>
              SELECT EXPERIMENT CONTAINER:
            </span>
            <select
              className="form-select"
              style={{ maxWidth: '440px', fontWeight: 600 }}
              value={selectedExpId}
              onChange={(e) => handleExperimentChange(e.target.value)}
            >
              {experiments.map((exp) => (
                <option key={exp.id} value={exp.id}>
                  {exp.title} ({exp.material}) — {exp.runs.length} runs
                </option>
              ))}
            </select>
            {activeExp && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onNavigate('experiment-workspace', { experiment: activeExp })}
              >
                Open {activeExp.title.split(' ')[0]} Workspace →
              </button>
            )}
          </div>
        </div>
      </div>

      {activeExp && (
        <div className="stats-row" style={{ marginBottom: '24px' }}>
          <div className="stat-card">
            <span className="stat-label">Isolated Runs in {activeExp.title.split(' ')[0]}</span>
            <span className="stat-value accent">{runs.length}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Successes</span>
            <span className="stat-value" style={{ color: 'var(--color-success)' }}>
              {outcomes['Success'] || 0}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Partial Trials</span>
            <span className="stat-value" style={{ color: 'var(--color-accent)' }}>
              {outcomes['Partial'] || 0}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Failed Trials</span>
            <span className="stat-value" style={{ color: 'var(--color-error)' }}>
              {outcomes['Failed'] || 0}
            </span>
          </div>
        </div>
      )}

      {/* Button to suggest */}
      {!hypothesis && !loading && (
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', maxWidth: '520px', margin: '0 auto 16px' }}>
            Gemini will synthesize rheological and processing patterns from the {runs.length} logged runs for{' '}
            <strong>{activeExp?.material}</strong> and propose the next parameter step.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={handleSuggest}
            disabled={runs.length === 0}
          >
            🧠 Suggest Next Trial for {activeExp?.title.split(' ')[0]}
          </button>
          {runs.length === 0 && (
            <p style={{ color: 'var(--color-warning-text)', fontSize: 'var(--font-size-xs)', marginTop: '8px' }}>
              Feed at least one test run into this experiment first.
            </p>
          )}
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="spinner spinner-lg" />
          <p>Analyzing isolated runs with Gemini 2.5 Flash…</p>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--color-error)', marginBottom: '24px' }}>
          <div className="card-body">
            <p style={{ color: 'var(--color-error-text)' }}>⚠ {error}</p>
            <button className="btn btn-secondary btn-sm" onClick={handleSuggest} style={{ marginTop: '12px' }}>
              🔄 Try Again
            </button>
          </div>
        </div>
      )}

      {/* Hypothesis View */}
      {hypothesis && (
        <div className="insight-card" style={{ marginBottom: '24px' }}>
          <div className="insight-header">
            <span className="icon">🧠</span>
            <h3>Suggested Next Trial for {activeExp?.title}</h3>
            <span className="badge badge-success">{hypothesis.confidence} confidence</span>
          </div>

          <div className="insight-section">
            <h4>💡 Scientific Hypothesis</h4>
            <p style={{ fontStyle: 'italic', fontSize: 'var(--font-size-base)' }}>
              "{hypothesis.hypothesis}"
            </p>
          </div>

          {hypothesis.proposedChange && (
            <div className="insight-section">
              <h4>🔧 Proposed Parameter Change</h4>
              <div
                style={{
                  background: 'white',
                  padding: '12px 18px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  display: 'inline-flex',
                  gap: '24px',
                }}
              >
                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Parameter</span>
                  <div style={{ fontWeight: 700 }}>{hypothesis.proposedChange.parameterName}</div>
                </div>
                <div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Suggested Value</span>
                  <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                    {hypothesis.proposedChange.suggestedValue} {hypothesis.proposedChange.unit}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="insight-section">
            <h4>📝 Reasoning</h4>
            <p>{hypothesis.reasoning}</p>
          </div>

          <div className="insight-section">
            <h4>📎 Supporting Evidence Runs</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {hypothesis.evidenceRunIds.map((id) => {
                const r = runs.find((run) => run.id === id);
                return (
                  <span key={id} className="evidence-tag">
                    🔬 {r ? r.title : id}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="insight-section">
            <h4>👁 Next Observation</h4>
            <p>{hypothesis.nextObservation}</p>
          </div>

          {hypothesis.caveats && (
            <div className="insight-section">
              <h4>⚠ Caveats</h4>
              <p style={{ color: 'var(--color-text-muted)' }}>{hypothesis.caveats}</p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => onNavigate('experiment-workspace', { experiment: activeExp })}
            >
              Enter {activeExp?.title.split(' ')[0]} Workspace & Feed Trial →
            </button>
            <button className="btn btn-secondary" onClick={handleSuggest}>
              🔄 Try Different Suggestion
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
