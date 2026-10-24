import { useState } from 'react';
import type { Experiment, OutcomeStatus } from '../types/experiment';
import { compareTestRuns, formatDiff } from '../services/comparison';

interface ComparePageProps {
  runAId?: string;
  runBId?: string;
  experimentId?: string;
  experiments: Experiment[];
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
}

export default function ComparePage({
  runAId,
  runBId,
  experimentId,
  experiments,
  onNavigate,
}: ComparePageProps) {
  // Select active experiment container
  const [selectedExpId, setSelectedExpId] = useState<string>(
    experimentId || experiments[0]?.id || ''
  );

  const activeExp = experiments.find((e) => e.id === selectedExpId) || experiments[0];
  const runs = activeExp?.runs || [];

  const defaultAId = runAId && runs.some((r) => r.id === runAId) ? runAId : runs[0]?.id || '';
  const defaultBId = runBId && runs.some((r) => r.id === runBId) ? runBId : runs[1]?.id || runs[0]?.id || '';

  const [selectedAId, setSelectedAId] = useState<string>(defaultAId);
  const [selectedBId, setSelectedBId] = useState<string>(defaultBId);

  // Sync run selection when experiment container changes
  function handleExperimentChange(newExpId: string) {
    setSelectedExpId(newExpId);
    const exp = experiments.find((e) => e.id === newExpId);
    if (exp && exp.runs.length > 0) {
      setSelectedAId(exp.runs[0].id);
      setSelectedBId(exp.runs[1]?.id || exp.runs[0].id);
    } else {
      setSelectedAId('');
      setSelectedBId('');
    }
  }

  const runA = runs.find((r) => r.id === selectedAId);
  const runB = runs.find((r) => r.id === selectedBId);

  function handleSwap() {
    setSelectedAId(selectedBId);
    setSelectedBId(selectedAId);
  }

  function getOutcomeBadgeClass(outcome: OutcomeStatus): string {
    const map: Record<OutcomeStatus, string> = {
      Success: 'badge-success',
      Partial: 'badge-partial',
      Failed: 'badge-failed',
      Uncertain: 'badge-uncertain',
    };
    return map[outcome] || '';
  }

  function getDiffCellClass(status: string): string {
    switch (status) {
      case 'changed':
        return 'diff-changed';
      case 'missing':
        return 'diff-missing';
      case 'unit-mismatch':
        return 'diff-mismatch';
      default:
        return '';
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h2>Compare Test Runs</h2>
            <p>
              Compare trials side by side strictly within an isolated experiment. Data from different experiments is never merged.
            </p>
          </div>
          <button className="btn btn-ghost" onClick={() => onNavigate('experiments')}>
            ← Back to All Experiments
          </button>
        </div>
      </div>

      {/* Experiment Container Selector Bar */}
      <div className="card" style={{ marginBottom: '20px', background: 'var(--color-bg-card)' }}>
        <div className="card-body" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)' }}>
              SELECT EXPERIMENT CONTAINER:
            </span>
            <select
              className="form-select"
              style={{ maxWidth: '420px', fontWeight: 600 }}
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

      {runs.length < 2 ? (
        <div className="empty-state">
          <div className="empty-icon">⚖️</div>
          <h3>At least 2 test runs needed in {activeExp?.title}</h3>
          <p>
            This experiment container currently has {runs.length} test run. Enter this experiment and feed at least two runs to compare them.
          </p>
          {activeExp && (
            <button
              className="btn btn-primary"
              onClick={() => onNavigate('experiment-workspace', { experiment: activeExp })}
            >
              Enter {activeExp.title} & Feed Runs →
            </button>
          )}
        </div>
      ) : !runA || !runB ? (
        <div className="empty-state">
          <p>Please select two valid test runs to compare.</p>
        </div>
      ) : (
        <>
          {/* Run Selectors Card */}
          <div className="card" style={{ marginBottom: '24px' }}>
            <div className="card-body" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center' }}>
                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', display: 'block', marginBottom: '6px' }}>
                    TRIAL A (BASELINE)
                  </label>
                  <select
                    className="form-select"
                    value={selectedAId}
                    onChange={(e) => setSelectedAId(e.target.value)}
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} ({r.outcome})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ paddingTop: '20px' }}>
                  <button
                    className="btn btn-secondary btn-icon"
                    onClick={handleSwap}
                    title="Swap Trial A and Trial B"
                  >
                    ⇄
                  </button>
                </div>

                <div>
                  <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-accent)', display: 'block', marginBottom: '6px' }}>
                    TRIAL B (COMPARISON)
                  </label>
                  <select
                    className="form-select"
                    value={selectedBId}
                    onChange={(e) => setSelectedBId(e.target.value)}
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} ({r.outcome})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Photo Comparison */}
          {((runA.imageUrls && runA.imageUrls.length > 0) || (runB.imageUrls && runB.imageUrls.length > 0)) && (
            <div className="card" style={{ marginBottom: '24px' }}>
              <div className="card-body">
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: '16px' }}>
                  Visual Outcome Diff (Micrographs)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', display: 'block', marginBottom: '8px' }}>
                      TRIAL A ARTIFACT PHOTO ({runA.title})
                    </span>
                    {runA.imageUrls && runA.imageUrls.length > 0 ? (
                      <div className="gallery-thumbnail" style={{ height: '220px' }}>
                        <img src={runA.imageUrls[0]} alt="Trial A outcome" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                    ) : (
                      <div style={{ height: '220px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                        No photo attached for Trial A
                      </div>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-accent)', display: 'block', marginBottom: '8px' }}>
                      TRIAL B ARTIFACT PHOTO ({runB.title})
                    </span>
                    {runB.imageUrls && runB.imageUrls.length > 0 ? (
                      <div className="gallery-thumbnail" style={{ height: '220px' }}>
                        <img src={runB.imageUrls[0]} alt="Trial B outcome" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      </div>
                    ) : (
                      <div style={{ height: '220px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                        No photo attached for Trial B
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Parameter Differences Table */}
          {(() => {
            const comp = compareTestRuns(runA, runB);
            return (
              <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-body" style={{ paddingBottom: 0 }}>
                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: '16px' }}>
                    Parameter Comparison
                  </h3>
                </div>
                <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th>Parameter</th>
                        <th>Trial A</th>
                        <th>Trial B</th>
                        <th>Difference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comp.parameterDiffs.map((diff) => (
                        <tr key={diff.name}>
                          <td style={{ fontWeight: 600 }}>{diff.name}</td>
                          <td className={getDiffCellClass(diff.status)}>
                            {diff.runA ? `${diff.runA.value} ${diff.runA.unit}` : '—'}
                          </td>
                          <td className={getDiffCellClass(diff.status)}>
                            {diff.runB ? `${diff.runB.value} ${diff.runB.unit}` : '—'}
                          </td>
                          <td>
                            {diff.numericDifference !== null ? (
                              <span
                                className={`diff-indicator ${
                                  diff.numericDifference > 0
                                    ? 'positive'
                                    : diff.numericDifference < 0
                                    ? 'negative'
                                    : 'neutral'
                                }`}
                              >
                                {formatDiff(diff.numericDifference)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                diff.status === 'changed'
                                  ? 'badge-warning'
                                  : diff.status === 'missing'
                                  ? 'badge-error'
                                  : 'badge-success'
                              }`}
                            >
                              {diff.status === 'unchanged'
                                ? '✓ Same'
                                : diff.status === 'changed'
                                ? '△ Changed'
                                : '✕ Missing'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Outcome & Quality Diff */}
          {(() => {
            const comp = compareTestRuns(runA, runB);
            return (
              <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-body">
                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: '16px' }}>
                    Outcome & Quality Deltas
                  </h3>
                  <div className="table-container" style={{ border: 'none' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Trial A</th>
                          <th>Trial B</th>
                          <th>Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Outcome</td>
                          <td>
                            <span className={`badge ${getOutcomeBadgeClass(comp.outcomeDiff.runA)}`}>
                              {comp.outcomeDiff.runA}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${getOutcomeBadgeClass(comp.outcomeDiff.runB)}`}>
                              {comp.outcomeDiff.runB}
                            </span>
                          </td>
                          <td>
                            {comp.outcomeDiff.changed ? (
                              <span className="badge badge-warning">△ Changed</span>
                            ) : (
                              <span className="badge badge-success">✓ Same</span>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td style={{ fontWeight: 600 }}>Quality Score</td>
                          <td>{comp.qualityDiff.runA ?? '—'}</td>
                          <td>{comp.qualityDiff.runB ?? '—'}</td>
                          <td>
                            {comp.qualityDiff.difference !== null ? (
                              <span className={`diff-indicator ${comp.qualityDiff.difference > 0 ? 'positive' : 'negative'}`}>
                                {formatDiff(comp.qualityDiff.difference)}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
