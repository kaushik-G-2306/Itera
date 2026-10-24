import { useState, useEffect } from 'react';
import type { Experiment, Ingredient } from '../types/experiment';
import {
  fetchExperiments,
  createExperiment,
  deleteExperiment,
} from '../services/experiments';
import { exportAllExperimentsAsCsv, exportAllExperimentsAsJson } from '../services/export';

interface ExperimentsPageProps {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
}

export default function ExperimentsPage({ onNavigate }: ExperimentsPageProps) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMaterial, setNewMaterial] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newIngredients, setNewIngredients] = useState<Ingredient[]>([
    { name: '', quantity: '', notes: '' },
  ]);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadExperiments();
  }, []);

  async function loadExperiments() {
    try {
      const exps = await fetchExperiments();
      setExperiments(exps || []);
    } catch (err) {
      console.warn('Failed to fetch experiments, keeping current cache:', err);
    }
  }

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function handleAddIngredientRow() {
    setNewIngredients((prev) => [...prev, { name: '', quantity: '', notes: '' }]);
  }

  function handleIngredientChange(index: number, field: keyof Ingredient, value: string) {
    setNewIngredients((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  function handleRemoveIngredientRow(index: number) {
    setNewIngredients((prev) => {
      if (prev.length <= 1) {
        return [{ name: '', quantity: '', notes: '' }];
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleCreateExperiment(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newMaterial.trim()) {
      showToast('Please provide both Title and Material / Recipe Name', 'error');
      return;
    }
    setCreating(true);
    try {
      const validIngredients = newIngredients.filter(
        (ing) => ing.name.trim() || ing.quantity.trim() || ing.notes.trim()
      );
      const created = await createExperiment({
        title: newTitle.trim(),
        material: newMaterial.trim(),
        ingredients: validIngredients,
        description: newDescription.trim(),
        runs: [],
      });
      setExperiments((prev) => [created, ...prev]);
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewMaterial('');
      setNewDescription('');
      setNewIngredients([{ name: '', quantity: '', notes: '' }]);
      showToast(`Created experiment "${created.title}"!`, 'success');
      // Automatically enter the new experiment so they can feed tests immediately!
      onNavigate('experiment-workspace', { experiment: created });
    } catch (err) {
      console.error('Failed to create experiment:', err);
      showToast('Failed to create experiment', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteExperiment(e: React.MouseEvent, expId: string, title: string) {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${title}" and all its isolated test runs?`)) {
      return;
    }
    try {
      await deleteExperiment(expId);
      setExperiments((prev) => prev.filter((exp) => exp.id !== expId));
      showToast(`Deleted "${title}"`, 'success');
    } catch {
      showToast('Failed to delete experiment', 'error');
    }
  }

  const filtered = experiments.filter((exp) => {
    if (!exp) return false;
    const q = (searchQuery || '').toLowerCase();
    const title = (exp.title || '').toLowerCase();
    const material = (exp.material || '').toLowerCase();
    const desc = (exp.description || '').toLowerCase();
    return title.includes(q) || material.includes(q) || desc.includes(q);
  });

  const totalExperiments = experiments.length;

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div className="page-header-row">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2>Material Experiments</h2>
              <span
                style={{
                  background: 'var(--color-primary-subtle)',
                  color: 'var(--color-primary)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                }}
              >
                {totalExperiments} {totalExperiments === 1 ? 'Container' : 'Containers'}
              </span>
            </div>
            <p style={{ marginTop: '4px' }}>
              Create isolated experiment containers (e.g. Experiment X, Y). Enter an experiment to feed its test details without cross-contamination.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => exportAllExperimentsAsCsv(experiments)}
              title="Export all experiments and runs as CSV"
            >
              📥 Export All CSV
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => exportAllExperimentsAsJson(experiments)}
              title="Export all data as JSON"
            >
              📥 Export JSON
            </button>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setIsCreateModalOpen(true)}
            >
              ✚ Create New Experiment
            </button>
          </div>
        </div>
      </div>



      {/* Search Bar */}
      <div style={{ marginBottom: '24px' }}>
        <div className="search-bar" style={{ maxWidth: '480px' }}>
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="form-input"
            placeholder="Search experiments by title, material, objective…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Experiment Container Cards Grid */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>No experiments match your search</h3>
          <p>Create your first experiment container to start feeding test details.</p>
          <button className="btn btn-primary" onClick={() => setIsCreateModalOpen(true)}>
            ✚ Create Experiment
          </button>
        </div>
      ) : (
        <div className="experiment-container-grid">
          {filtered.map((exp) => {
            const runCount = exp.runs.length;
            const successCount = exp.runs.filter((r) => r.outcome === 'Success').length;
            const bestRunScore = exp.runs.reduce((max, r) => {
              if (r.qualityScore !== null && (max === null || r.qualityScore > max)) return r.qualityScore;
              return max;
            }, null as number | null);

            // Preview photos from runs
            const previewImgs: string[] = [];
            for (const r of exp.runs) {
              if (r.imageUrls && r.imageUrls.length > 0) {
                previewImgs.push(...r.imageUrls);
              }
              if (previewImgs.length >= 2) break;
            }

            return (
              <div
                key={exp.id}
                className="experiment-container-card"
                onClick={() => onNavigate('experiment-workspace', { experiment: exp })}
                style={{ cursor: 'pointer' }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="material-pill">
                      <span>🧪</span>
                      <span>{exp.material}</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--color-text-muted)', padding: '2px 6px' }}
                      onClick={(e) => handleDeleteExperiment(e, exp.id, exp.title)}
                      title="Delete this experiment container"
                    >
                      🗑
                    </button>
                  </div>

                  <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-text)', marginBottom: '6px' }}>
                    {exp.title}
                  </h3>

                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
                    {exp.description || 'Dedicated material study container. Test details and parameters are isolated.'}
                  </p>

                  {/* Ingredients preview pill */}
                  {exp.ingredients && exp.ingredients.length > 0 && (
                    <div style={{ marginBottom: '14px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                        Ingredients ({exp.ingredients.length}):
                      </span>
                      {exp.ingredients.slice(0, 3).map((ing, i) => (
                        <span
                          key={i}
                          style={{
                            fontSize: '11px',
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                            padding: '1px 7px',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {ing.name}{ing.quantity ? ` (${ing.quantity})` : ''}
                        </span>
                      ))}
                      {exp.ingredients.length > 3 && (
                        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                          +{exp.ingredients.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Micrograph Previews */}
                  {previewImgs.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                      {previewImgs.slice(0, 2).map((img, i) => (
                        <div
                          key={i}
                          style={{
                            width: '60px',
                            height: '45px',
                            borderRadius: 'var(--radius-sm)',
                            overflow: 'hidden',
                            border: '1px solid var(--color-border)',
                          }}
                        >
                          <img src={img} alt="Micrograph" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      ))}
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', alignSelf: 'center' }}>
                        📷 Attached micrographs
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  {/* Stats Row inside card */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'var(--color-bg)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '16px',
                      fontSize: 'var(--font-size-xs)',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>TEST RUNS</span>
                      <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-primary)' }}>
                        {runCount} fed
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>SUCCESS RATE</span>
                      <strong style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-success)' }}>
                        {runCount > 0 ? `${Math.round((successCount / runCount) * 100)}%` : '—'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-muted)', display: 'block' }}>BEST QUALITY</span>
                      <strong style={{ fontSize: 'var(--font-size-sm)' }}>
                        {bestRunScore !== null ? `${bestRunScore}/10` : '—'}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => onNavigate('experiment-workspace', { experiment: exp })}
                  >
                    Enter Experiment & Feed Tests →
                  </button>
                </div>
              </div>
            );
          })}

          {/* Quick Create Card */}
          <div
            className="experiment-container-card"
            style={{
              border: '2px dashed var(--color-border)',
              background: 'transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '260px',
              textAlign: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setIsCreateModalOpen(true)}
          >
            <div style={{ fontSize: '36px', marginBottom: '8px' }}>✚</div>
            <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-primary)' }}>
              Create Experiment 'Y'
            </h4>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', maxWidth: '240px', marginTop: '4px' }}>
              Create a new isolated experiment container for another food material or recipe without merging data.
            </p>
          </div>
        </div>
      )}

      {/* ── Create Experiment Modal ── */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreateExperiment}>
              <div className="modal-header">
                <h3>Create New Experiment Container</h3>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                  This creates an isolated workspace (e.g. Experiment X, Y). You will enter this container to feed all test details, compare trials, and synthesize hypotheses without data blending.
                </p>

                <div className="form-group">
                  <label className="form-label">
                    Experiment Title <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Experiment Y: Oat Milk Foam Aeration Study"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Material / Recipe Name <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Hydrocolloid Carrot Puree (1.2% Xanthan)"
                    value={newMaterial}
                    onChange={(e) => setNewMaterial(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <div style={{ marginBottom: '8px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>
                      Ingredients Used
                    </label>
                  </div>
                  <div
                    className="ingredients-scroll-table"
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-md)',
                      overflowY: 'auto',
                      overflowX: 'auto',
                      maxHeight: '220px',
                      background: 'var(--color-bg)',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                          <th style={{ padding: '8px 10px', width: '38%', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                            Ingredient Name
                          </th>
                          <th style={{ padding: '8px 10px', width: '24%', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                            Quantity
                          </th>
                          <th style={{ padding: '8px 10px', width: '38%', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'left' }}>
                            Notes (Source / Prep)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {newIngredients.map((ing, idx) => (
                          <tr key={idx} style={{ borderBottom: idx < newIngredients.length - 1 ? '1px solid var(--color-border)' : 'none', background: 'var(--color-bg-card)' }}>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="text"
                                className="form-input"
                                style={{ padding: '6px 8px', fontSize: '12px' }}
                                placeholder="e.g. Oat Flour / Xanthan"
                                value={ing.name}
                                onChange={(e) => handleIngredientChange(idx, 'name', e.target.value)}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="text"
                                className="form-input"
                                style={{ padding: '6px 8px', fontSize: '12px' }}
                                placeholder="e.g. 50g / 0.3%"
                                value={ing.quantity}
                                onChange={(e) => handleIngredientChange(idx, 'quantity', e.target.value)}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  style={{ padding: '6px 8px', fontSize: '12px', flex: 1 }}
                                  placeholder="e.g. Mill source, pre-hydrated 10m"
                                  value={ing.notes}
                                  onChange={(e) => handleIngredientChange(idx, 'notes', e.target.value)}
                                />
                                {newIngredients.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveIngredientRow(idx)}
                                    className="btn btn-ghost btn-sm"
                                    style={{ padding: '4px 6px', color: 'var(--color-text-muted)' }}
                                    title="Remove ingredient row"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      Enter formulation ingredients, quantities, and preparation/source notes.
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleAddIngredientRow}
                      style={{ padding: '4px 12px', fontSize: '12px' }}
                    >
                      ✚ Add Row
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Objective / Target Goal</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    placeholder="e.g. Optimize microfoam bubble diameter stability and steaming temperature threshold."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating || !newTitle.trim() || !newMaterial.trim()}
                >
                  {creating ? 'Creating…' : 'Create & Enter Experiment →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
