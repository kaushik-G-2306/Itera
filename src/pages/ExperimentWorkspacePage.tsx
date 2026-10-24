import { useState, useRef } from 'react';
import type { Experiment, TestRun, Parameter, OutcomeStatus, StructuredNotes, AIHypothesisResponse } from '../types/experiment';
import { addTestRun, addMultipleTestRuns, deleteTestRun } from '../services/experiments';
import { extractNotesWithAI, suggestNextExperiment } from '../services/ai';
import { processImageFile, extractImagesFromPaste } from '../services/image';
import { compareTestRuns, formatDiff } from '../services/comparison';
import { exportExperimentRunsAsCsv, exportExperimentAsJson } from '../services/export';

interface ExperimentWorkspaceProps {
  experiment: Experiment;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onExperimentUpdated: () => void;
}

type WorkspaceTab = 'feed' | 'runs' | 'compare' | 'insights';

const EMPTY_PARAMETER: Parameter = { name: '', value: '', unit: '' };
const OUTCOME_OPTIONS: OutcomeStatus[] = ['Success', 'Partial', 'Failed', 'Uncertain'];

interface DraftItem {
  draftId: string;
  title: string;
  parameters: Parameter[];
  outcome: OutcomeStatus | '';
  qualityScore: string;
  notesRaw: string;
  structuredNotes: StructuredNotes | null;
  imageUrls: string[];
  aiExtracted: boolean;
  errors: Record<string, string>;
  isPrefill?: boolean;
}

function createDefaultDraft(index: number, baseParams?: Parameter[]): DraftItem {
  return {
    draftId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: `Run #${index} — Trial`,
    parameters: baseParams && baseParams.length > 0
      ? baseParams.map((p) => ({ ...p }))
      : [{ ...EMPTY_PARAMETER }],
    outcome: '',
    qualityScore: '',
    notesRaw: '',
    structuredNotes: null,
    imageUrls: [],
    aiExtracted: false,
    errors: {},
  };
}

export default function ExperimentWorkspacePage({
  experiment,
  onNavigate,
  onExperimentUpdated,
}: ExperimentWorkspaceProps) {
  const [currentExp, setCurrentExp] = useState<Experiment>(experiment);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    (experiment.runs?.length || 0) === 0 ? 'feed' : 'runs'
  );

  // ── Parallel Feed Drafts State ──
  const [drafts, setDrafts] = useState<DraftItem[]>(() => {
    // If experiment has previous runs, inherit the last run's parameter names as convenient template
    const runs = experiment.runs || [];
    const lastRun = runs[0];
    const initialParams = lastRun?.parameters?.map((p) => ({ name: p.name, value: '', unit: p.unit })) || [];
    return [createDefaultDraft(runs.length + 1, initialParams)];
  });
  const [activeDraftIndex, setActiveDraftIndex] = useState(0);
  const [savingRuns, setSavingRuns] = useState(false);
  const [extractingAI, setExtractingAI] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewLightbox, setPreviewLightbox] = useState<string | null>(null);
  const [selectedRunDetail, setSelectedRunDetail] = useState<TestRun | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Comparison State ──
  const [compareAId, setCompareAId] = useState<string>(
    currentExp.runs[0]?.id || ''
  );
  const [compareBId, setCompareBId] = useState<string>(
    currentExp.runs[1]?.id || currentExp.runs[0]?.id || ''
  );

  // ── AI Insights State ──
  const [aiHypothesis, setAiHypothesis] = useState<AIHypothesisResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const activeDraft = drafts[activeDraftIndex] || drafts[0];

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function updateActiveDraft(updates: Partial<DraftItem>) {
    setDrafts((prev) => {
      const copy = [...prev];
      copy[activeDraftIndex] = { ...copy[activeDraftIndex], ...updates };
      return copy;
    });
  }

  // ── Draft Tab Operations ──
  function addNewDraft() {
    const lastRun = currentExp.runs[0];
    const baseParams = lastRun?.parameters?.map((p) => ({ name: p.name, value: '', unit: p.unit }));
    const newDraft = createDefaultDraft(currentExp.runs.length + drafts.length + 1, baseParams);
    setDrafts((prev) => [...prev, newDraft]);
    setActiveDraftIndex(drafts.length);
    showToast(`Added Run Draft #${drafts.length + 1}`, 'success');
  }

  function cloneCurrentDraft() {
    const cur = activeDraft;
    const cloned: DraftItem = {
      ...cur,
      draftId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${cur.title || 'Trial'} (Variation)`,
      parameters: cur.parameters.map((p) => ({ ...p })),
      outcome: '',
      qualityScore: '',
      structuredNotes: null,
      aiExtracted: false,
      errors: {},
    };
    setDrafts((prev) => [...prev, cloned]);
    setActiveDraftIndex(drafts.length);
    showToast('Cloned parameters to new draft run', 'success');
  }

  function cloneRunToFeed(run: TestRun) {
    const cloned: DraftItem = {
      draftId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${run.title} (Variation)`,
      parameters: run.parameters.map((p) => ({ ...p })),
      outcome: '',
      qualityScore: '',
      notesRaw: `Iteration based on ${run.title}`,
      structuredNotes: null,
      imageUrls: [],
      aiExtracted: false,
      errors: {},
    };
    setDrafts((prev) => [cloned, ...prev]);
    setActiveDraftIndex(0);
    setActiveTab('feed');
    showToast(`Loaded "${run.title}" parameters into Feed tab`, 'success');
  }

  function removeDraft(idx: number) {
    if (drafts.length <= 1) return;
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    if (activeDraftIndex >= idx && activeDraftIndex > 0) {
      setActiveDraftIndex(activeDraftIndex - 1);
    }
  }

  // ── Parameter Rows ──
  function addParameter() {
    updateActiveDraft({
      parameters: [...activeDraft.parameters, { ...EMPTY_PARAMETER }],
    });
  }

  function updateParameter(index: number, field: keyof Parameter, value: string) {
    const updated = [...activeDraft.parameters];
    updated[index] = { ...updated[index], [field]: value };
    updateActiveDraft({ parameters: updated });
  }

  function removeParameter(index: number) {
    if (activeDraft.parameters.length <= 1) return;
    updateActiveDraft({
      parameters: activeDraft.parameters.filter((_, i) => i !== index),
    });
  }

  // ── Image Uploads ──
  async function handleImageFiles(files: FileList | File[]) {
    const array = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (array.length === 0) return;
    try {
      const processed = await Promise.all(array.map((f) => processImageFile(f)));
      updateActiveDraft({
        imageUrls: [...activeDraft.imageUrls, ...processed],
      });
      showToast(`Attached ${processed.length} image(s)`, 'success');
    } catch {
      showToast('Image processing failed', 'error');
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = extractImagesFromPaste(e);
    if (pasted.length > 0) {
      e.preventDefault();
      handleImageFiles(pasted);
    }
  }

  // ── AI Extraction ──
  async function handleExtractAI() {
    if (!activeDraft.notesRaw.trim()) {
      updateActiveDraft({
        errors: { ...activeDraft.errors, notesRaw: 'Enter notes first to extract parameters' },
      });
      return;
    }
    setExtractingAI(true);
    try {
      const result = await extractNotesWithAI(activeDraft.notesRaw);
      const updates: Partial<DraftItem> = { aiExtracted: true };
      if (result.title && (!activeDraft.title || activeDraft.title.startsWith('Run #'))) {
        updates.title = result.title;
      }
      if (result.parameters && result.parameters.length > 0) {
        updates.parameters = result.parameters;
      }
      if (result.outcome && !activeDraft.outcome) {
        updates.outcome = result.outcome;
      }
      if (result.qualityScore && !activeDraft.qualityScore) {
        updates.qualityScore = String(result.qualityScore);
      }
      if (result.structuredNotes) {
        updates.structuredNotes = result.structuredNotes;
      }
      updateActiveDraft(updates);
      showToast('AI note extraction completed!', 'success');
    } catch {
      showToast('AI extraction failed — enter parameters manually', 'error');
    } finally {
      setExtractingAI(false);
    }
  }

  // ── Validation & Saving ──
  function validateDraft(draft: DraftItem): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!draft.title.trim()) errors.title = 'Title is required';
    if (!draft.outcome) errors.outcome = 'Select an outcome';
    const score = parseFloat(draft.qualityScore);
    if (draft.qualityScore && (isNaN(score) || score < 1 || score > 10)) {
      errors.qualityScore = 'Score must be between 1 and 10';
    }
    return errors;
  }

  async function handleSaveCurrentRun() {
    const errors = validateDraft(activeDraft);
    if (Object.keys(errors).length > 0) {
      updateActiveDraft({ errors });
      return;
    }
    setSavingRuns(true);
    try {
      const score = activeDraft.qualityScore ? parseFloat(activeDraft.qualityScore) : null;
      const cleanParams = activeDraft.parameters.filter((p) => p.name.trim());
      const newRun = await addTestRun(currentExp.id, {
        title: activeDraft.title.trim(),
        parameters: cleanParams,
        outcome: activeDraft.outcome as OutcomeStatus,
        qualityScore: score,
        notesRaw: activeDraft.notesRaw,
        notesStructured: activeDraft.structuredNotes,
        imageUrls: activeDraft.imageUrls,
      });

      const updatedExp: Experiment = {
        ...currentExp,
        runs: [newRun, ...currentExp.runs],
      };
      setCurrentExp(updatedExp);
      onExperimentUpdated();
      showToast(`Saved "${newRun.title}" into ${currentExp.title}!`, 'success');

      if (drafts.length > 1) {
        removeDraft(activeDraftIndex);
      } else {
        const nextDraft = createDefaultDraft(updatedExp.runs.length + 1, cleanParams);
        setDrafts([nextDraft]);
        setActiveDraftIndex(0);
        setActiveTab('runs');
      }
    } catch (err) {
      console.error('Failed to save run:', err);
      showToast('Failed to save run', 'error');
    } finally {
      setSavingRuns(false);
    }
  }

  async function handleSaveAllRuns() {
    let hasError = false;
    const validated = drafts.map((d) => {
      const errors = validateDraft(d);
      if (Object.keys(errors).length > 0) hasError = true;
      return { ...d, errors };
    });
    if (hasError) {
      setDrafts(validated);
      showToast('Please fix required fields in highlighted runs', 'error');
      return;
    }

    setSavingRuns(true);
    try {
      const payloads = drafts.map((d) => ({
        title: d.title.trim(),
        parameters: d.parameters.filter((p) => p.name.trim()),
        outcome: d.outcome as OutcomeStatus,
        qualityScore: d.qualityScore ? parseFloat(d.qualityScore) : null,
        notesRaw: d.notesRaw,
        notesStructured: d.structuredNotes,
        imageUrls: d.imageUrls,
      }));

      const added = await addMultipleTestRuns(currentExp.id, payloads);
      const updatedExp: Experiment = {
        ...currentExp,
        runs: [...added, ...currentExp.runs],
      };
      setCurrentExp(updatedExp);
      onExperimentUpdated();
      showToast(`Successfully fed ${added.length} test runs into ${currentExp.title}!`, 'success');

      const nextDraft = createDefaultDraft(updatedExp.runs.length + 1, payloads[0]?.parameters);
      setDrafts([nextDraft]);
      setActiveDraftIndex(0);
      setActiveTab('runs');
    } catch (err) {
      console.error('Save all runs failed:', err);
      showToast('Failed to save runs', 'error');
    } finally {
      setSavingRuns(false);
    }
  }

  async function handleDeleteRun(runId: string) {
    if (!confirm('Delete this test run? This cannot be undone.')) return;
    try {
      await deleteTestRun(currentExp.id, runId);
      const updatedExp: Experiment = {
        ...currentExp,
        runs: currentExp.runs.filter((r) => r.id !== runId),
      };
      setCurrentExp(updatedExp);
      setSelectedRunDetail(null);
      onExperimentUpdated();
      showToast('Test run deleted', 'success');
    } catch {
      showToast('Failed to delete run', 'error');
    }
  }

  // ── AI Insights ──
  async function handleGenerateAIHypothesis() {
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await suggestNextExperiment(currentExp.runs, currentExp.material);
      setAiHypothesis(result);
    } catch (err) {
      console.error('AI suggestion failed:', err);
      setAiError('Failed to generate hypothesis. Ensure network connectivity.');
    } finally {
      setAiLoading(false);
    }
  }

  function handleAdoptAIHypothesis(hypo: AIHypothesisResponse) {
    if (!hypo.proposedChange) return;
    const existingParams = currentExp.runs[0]?.parameters?.map((p) => ({ ...p })) || [];
    const changeParam = hypo.proposedChange;

    // Replace or add proposed parameter
    const updatedParams = [...existingParams];
    const matchIdx = updatedParams.findIndex(
      (p) => p.name.toLowerCase() === changeParam.parameterName.toLowerCase()
    );
    if (matchIdx >= 0) {
      updatedParams[matchIdx] = {
        name: changeParam.parameterName,
        value: changeParam.suggestedValue,
        unit: changeParam.unit,
      };
    } else {
      updatedParams.push({
        name: changeParam.parameterName,
        value: changeParam.suggestedValue,
        unit: changeParam.unit,
      });
    }

    const aiDraft: DraftItem = {
      draftId: `draft-ai-${Date.now()}`,
      title: `Hypothesis Test: ${changeParam.parameterName} ${changeParam.suggestedValue}${changeParam.unit}`,
      parameters: updatedParams,
      outcome: '',
      qualityScore: '',
      notesRaw: `AI Hypothesis: ${hypo.hypothesis}\n\nObserving: ${hypo.nextObservation}\n\nReasoning: ${hypo.reasoning}`,
      structuredNotes: null,
      imageUrls: [],
      aiExtracted: false,
      isPrefill: true,
      errors: {},
    };

    setDrafts((prev) => [aiDraft, ...prev]);
    setActiveDraftIndex(0);
    setActiveTab('feed');
    showToast('AI hypothesis parameters loaded into Feed tab!', 'success');
  }

  // Metrics for Experiment X
  const expRuns = currentExp.runs || [];
  const totalRuns = expRuns.length;
  const successRuns = expRuns.filter((r) => r.outcome === 'Success').length;
  const bestQuality = expRuns.reduce((max, r) => {
    if (r.qualityScore !== null && (max === null || r.qualityScore > max)) {
      return r.qualityScore;
    }
    return max;
  }, null as number | null);

  const runA = expRuns.find((r) => r.id === compareAId) || expRuns[0];
  const runB = expRuns.find((r) => r.id === compareBId) || expRuns[1] || expRuns[0];
  const comparisonResult = runA && runB && runA.id !== runB.id ? compareTestRuns(runA, runB) : null;

  function getOutcomeBadgeClass(outcome: OutcomeStatus): string {
    const map: Record<OutcomeStatus, string> = {
      Success: 'badge-success',
      Partial: 'badge-partial',
      Failed: 'badge-failed',
      Uncertain: 'badge-uncertain',
    };
    return map[outcome] || '';
  }

  return (
    <div onPaste={handlePaste}>
      {/* Breadcrumb Navigation */}
      <div className="breadcrumb-bar">
        <span className="breadcrumb-link" onClick={() => onNavigate('experiments')}>
          ← All Experiments
        </span>
        <span>/</span>
        <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>
          {currentExp.title}
        </span>
      </div>

      {/* Experiment Container Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div className="page-header-row">
          <div>
            <div className="material-pill">
              <span>🧪 Material / Recipe:</span>
              <span>{currentExp.material || 'Generic Material Formulation'}</span>
            </div>
            <h2>{currentExp.title}</h2>
            <p style={{ maxWidth: '780px', marginTop: '4px' }}>
              {currentExp.description || 'Dedicated material experiment workspace. Test runs, formulations, and AI hypotheses remain isolated in this experiment.'}
            </p>

            {/* Ingredients table in workspace header */}
            {currentExp.ingredients && currentExp.ingredients.length > 0 && (
              <div style={{ marginTop: '12px', maxWidth: '780px' }}>
                <details style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '8px 12px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)' }}>
                    🥗 Ingredients Used ({currentExp.ingredients.length} items) — View formulation & preparation notes
                  </summary>
                  <div style={{ marginTop: '10px', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                          <th style={{ padding: '6px 8px', width: '35%' }}>Ingredient</th>
                          <th style={{ padding: '6px 8px', width: '25%' }}>Quantity</th>
                          <th style={{ padding: '6px 8px', width: '40%' }}>Preparation / Source Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentExp.ingredients.map((ing, i) => (
                          <tr key={i} style={{ borderBottom: i < currentExp.ingredients!.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--color-text)' }}>{ing.name}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--color-primary)' }}>{ing.quantity || '—'}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--color-text-secondary)' }}>{ing.notes || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => exportExperimentRunsAsCsv(currentExp)}
              title="Export all test runs in this experiment to CSV"
            >
              📥 Export CSV
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => exportExperimentAsJson(currentExp)}
              title="Export this experiment container as JSON"
            >
              📥 Export JSON
            </button>
          </div>
        </div>
      </div>

      {/* Quick Metrics Row for this Experiment Container */}
      <div className="stats-row" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <span className="stat-label">Isolated Test Runs</span>
          <span className="stat-value accent">{totalRuns}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Successes</span>
          <span className="stat-value success">{successRuns}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Best Quality Score</span>
          <span className="stat-value">
            {bestQuality !== null ? `${bestQuality} / 10` : '—'}
          </span>
        </div>
      </div>

      {/* Workspace Tabs */}
      <div className="workspace-tabs-bar">
        <button
          className={`workspace-tab-item ${activeTab === 'feed' ? 'active' : ''}`}
          onClick={() => setActiveTab('feed')}
        >
          <span>✚</span> Feed Test Details {drafts.length > 0 && `(${drafts.length} drafts)`}
        </button>
        <button
          className={`workspace-tab-item ${activeTab === 'runs' ? 'active' : ''}`}
          onClick={() => setActiveTab('runs')}
        >
          <span>📋</span> Test Runs Log ({totalRuns})
        </button>
        <button
          className={`workspace-tab-item ${activeTab === 'compare' ? 'active' : ''}`}
          onClick={() => setActiveTab('compare')}
        >
          <span>⚖️</span> Compare Runs ({totalRuns >= 2 ? 'Ready' : 'Need 2'})
        </button>
        <button
          className={`workspace-tab-item ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          <span>🧠</span> AI Next-Step Insights
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB 1: FEED TEST DETAILS (Multi-run parallel entry)
         ══════════════════════════════════════════════════════ */}
      {activeTab === 'feed' && (
        <div>
          {/* Draft Tabs Bar */}
          <div className="draft-tabs-bar">
            {drafts.map((draft, idx) => {
              const isActive = idx === activeDraftIndex;
              const hasError = Object.keys(draft.errors).length > 0;
              return (
                <button
                  key={draft.draftId}
                  type="button"
                  className={`draft-tab-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveDraftIndex(idx)}
                  style={hasError ? { borderColor: 'var(--color-error)' } : {}}
                >
                  <span>🧪</span>
                  <span>{draft.title || `Run #${idx + 1}`}</span>
                  {draft.imageUrls.length > 0 && <span>📷 {draft.imageUrls.length}</span>}
                  {draft.aiExtracted && <span>🤖</span>}
                  {drafts.length > 1 && (
                    <span
                      className="draft-tab-close"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDraft(idx);
                      }}
                      title="Close draft"
                    >
                      ✕
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addNewDraft}
              title="Add another test trial to feed in parallel"
            >
              ✚ Add Run Draft
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={cloneCurrentDraft}
              title="Clone current parameters to a new run draft"
            >
              📋 Clone Parameters
            </button>
          </div>

          {/* Active Draft Form Card */}
          <div className="card" style={{ maxWidth: '820px' }}>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)' }}>
                  FEEDING TEST {activeDraftIndex + 1} OF {drafts.length} INTO: {currentExp.title.toUpperCase()}
                </span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  Material: {currentExp.material}
                </span>
              </div>

              {activeDraft.isPrefill && (
                <div
                  className="sample-data-banner"
                  style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#166534', marginBottom: '16px' }}
                >
                  <span className="icon">💡</span>
                  <span><strong>AI Hypothesis Applied</strong> — Parameters populated from AI suggestion.</span>
                </div>
              )}

              {activeDraft.aiExtracted && (
                <div
                  className="sample-data-banner"
                  style={{ background: '#eef2ff', borderColor: '#a5b4fc', color: '#3730a3', marginBottom: '16px' }}
                >
                  <span className="icon">🤖</span>
                  <span><strong>Extracted via Gemini 2.5 Flash</strong> — Parameters and defects auto-populated from notes.</span>
                </div>
              )}

              {/* Title */}
              <div className="form-group">
                <label className="form-label">
                  Test Run Title <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Run 4 — Increased Flow Rate with 1.0mm Nozzle"
                  value={activeDraft.title}
                  onChange={(e) => updateActiveDraft({ title: e.target.value })}
                />
                {activeDraft.errors.title && <div className="form-error">{activeDraft.errors.title}</div>}
              </div>

              {/* Parameters */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Parameters (Variables & Settings)
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={addParameter}
                  >
                    + Add Parameter Row
                  </button>
                </div>
                <div className="parameter-rows">
                  {activeDraft.parameters.map((param, idx) => (
                    <div className="parameter-row" key={idx}>
                      <input
                        className="form-input"
                        placeholder="Parameter Name (e.g. Flow Rate)"
                        value={param.name}
                        onChange={(e) => updateParameter(idx, 'name', e.target.value)}
                      />
                      <input
                        className="form-input"
                        placeholder="Value (e.g. 28)"
                        value={param.value}
                        onChange={(e) => updateParameter(idx, 'value', e.target.value)}
                      />
                      <input
                        className="form-input"
                        placeholder="Unit (e.g. mm/s)"
                        value={param.unit}
                        onChange={(e) => updateParameter(idx, 'unit', e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => removeParameter(idx)}
                        disabled={activeDraft.parameters.length <= 1}
                        title="Remove parameter"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Outcome + Quality */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    Outcome <span className="required">*</span>
                  </label>
                  <select
                    className="form-select"
                    value={activeDraft.outcome}
                    onChange={(e) => updateActiveDraft({ outcome: e.target.value as OutcomeStatus })}
                  >
                    <option value="">Select trial outcome…</option>
                    {OUTCOME_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  {activeDraft.errors.outcome && (
                    <div className="form-error">{activeDraft.errors.outcome}</div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Quality Score (1–10)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 8.5"
                    min="1"
                    max="10"
                    step="0.5"
                    value={activeDraft.qualityScore}
                    onChange={(e) => updateActiveDraft({ qualityScore: e.target.value })}
                  />
                  {activeDraft.errors.qualityScore && (
                    <div className="form-error">{activeDraft.errors.qualityScore}</div>
                  )}
                </div>
              </div>

              {/* Photos & Evidence */}
              <div className="form-group">
                <label className="form-label">Attached Photos / Micrographs</label>
                <div
                  className={`image-dropzone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files) handleImageFiles(e.dataTransfer.files);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files) handleImageFiles(e.target.files);
                    }}
                  />
                  <div className="image-dropzone-icon">📷</div>
                  <div className="image-dropzone-text">
                    <strong>Click to upload photos</strong>, drag & drop, or paste clipboard (Cmd+V)
                  </div>
                  <div className="image-dropzone-hint">
                    Photos are auto-compressed and saved isolated within this run
                  </div>
                </div>

                {activeDraft.imageUrls.length > 0 && (
                  <div className="image-preview-grid">
                    {activeDraft.imageUrls.map((url, imgIdx) => (
                      <div key={imgIdx} className="image-preview-card">
                        <img
                          src={url}
                          alt={`Run photo ${imgIdx + 1}`}
                          onClick={() => setPreviewLightbox(url)}
                          style={{ cursor: 'zoom-in' }}
                        />
                        <button
                          type="button"
                          className="image-preview-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateActiveDraft({
                              imageUrls: activeDraft.imageUrls.filter((_, i) => i !== imgIdx),
                            });
                          }}
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes & AI Extraction */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    Observations & Notes
                  </label>
                  <button
                    type="button"
                    className="btn btn-accent btn-sm"
                    onClick={handleExtractAI}
                    disabled={extractingAI || !activeDraft.notesRaw.trim()}
                  >
                    {extractingAI ? '🤖 Extracting...' : '🤖 Extract Parameters with AI'}
                  </button>
                </div>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="Paste or write lab observations — e.g. 'Nozzle 1.0mm, flow rate 28mm/s, layer height 0.5mm. Extrusion was smooth with no corner slump, quality 8/10...'"
                  value={activeDraft.notesRaw}
                  onChange={(e) => updateActiveDraft({ notesRaw: e.target.value })}
                />
                {activeDraft.errors.notesRaw && (
                  <div className="form-error">{activeDraft.errors.notesRaw}</div>
                )}
              </div>

              {activeDraft.structuredNotes && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'var(--color-bg)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    fontSize: 'var(--font-size-sm)',
                    marginBottom: '16px',
                  }}
                >
                  <strong style={{ color: 'var(--color-primary)' }}>AI Structured Notes Preview:</strong>
                  <p style={{ marginTop: '4px' }}>{activeDraft.structuredNotes.summary}</p>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={handleSaveCurrentRun}
                  disabled={savingRuns}
                >
                  {savingRuns ? 'Saving…' : `💾 Save Test Run into ${currentExp.title.split(' ')[0]}`}
                </button>
                {drafts.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-lg"
                    onClick={handleSaveAllRuns}
                    disabled={savingRuns}
                  >
                    💾 Save All ({drafts.length}) Runs
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 2: TEST RUNS LOG (Scoped to Experiment X)
         ══════════════════════════════════════════════════════ */}
      {activeTab === 'runs' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
                Test Runs Log for {currentExp.title}
              </h3>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
                {totalRuns} test runs stored exclusively in this experiment.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setActiveTab('feed')}
            >
              ✚ Feed New Test Run
            </button>
          </div>

          {totalRuns === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🧪</div>
              <h3>No test details fed yet</h3>
              <p>Start by feeding the first test run details for {currentExp.title}.</p>
              <button className="btn btn-primary" onClick={() => setActiveTab('feed')}>
                ✚ Feed Test Run Details
              </button>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Trial Title</th>
                    <th>Date</th>
                    <th>Parameters</th>
                    <th>Outcome</th>
                    <th>Quality</th>
                    <th>Photos</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentExp.runs.map((run, idx) => (
                    <tr
                      key={run.id}
                      className="experiment-row"
                      onClick={() => setSelectedRunDetail(run)}
                    >
                      <td style={{ fontWeight: 600, color: 'var(--color-text-muted)' }}>
                        #{totalRuns - idx}
                      </td>
                      <td>
                        <div className="exp-title">{run.title}</div>
                        {run.notesStructured?.summary && (
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                            {run.notesStructured.summary.slice(0, 75)}...
                          </div>
                        )}
                      </td>
                      <td className="exp-date">
                        {new Date(run.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="exp-params">
                        {run.parameters
                          .slice(0, 3)
                          .map((p) => `${p.name}: ${p.value}${p.unit}`)
                          .join(', ')}
                        {run.parameters.length > 3 && ` +${run.parameters.length - 3} more`}
                      </td>
                      <td>
                        <span className={`badge ${getOutcomeBadgeClass(run.outcome)}`}>
                          {run.outcome}
                        </span>
                      </td>
                      <td>
                        {run.qualityScore !== null ? (
                          <span className="quality-score" style={{ fontWeight: 700 }}>
                            {run.qualityScore}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {run.imageUrls && run.imageUrls.length > 0 ? (
                          <span className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                            📷 {run.imageUrls.length}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => cloneRunToFeed(run)}
                            title="Clone this run to feed form for another test"
                          >
                            📋 Clone
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--color-error)' }}
                            onClick={() => handleDeleteRun(run.id)}
                            title="Delete this test run"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 3: COMPARE RUNS (Scoped to Experiment X)
         ══════════════════════════════════════════════════════ */}
      {activeTab === 'compare' && (
        <div>
          {totalRuns < 2 ? (
            <div className="empty-state">
              <div className="empty-icon">⚖️</div>
              <h3>Need at least 2 test runs to compare</h3>
              <p>Feed at least two test runs into {currentExp.title} to analyze parameter deltas.</p>
              <button className="btn btn-primary" onClick={() => setActiveTab('feed')}>
                ✚ Feed Second Test Run
              </button>
            </div>
          ) : (
            <div>
              {/* Selector Bar */}
              <div className="card" style={{ marginBottom: '20px' }}>
                <div className="card-body" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '16px', alignItems: 'center' }}>
                    <div>
                      <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', display: 'block', marginBottom: '6px' }}>
                        TRIAL A (BASELINE)
                      </label>
                      <select
                        className="form-select"
                        value={compareAId}
                        onChange={(e) => setCompareAId(e.target.value)}
                      >
                        {currentExp.runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title} ({r.outcome})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ paddingTop: '20px' }}>
                      <button
                        className="btn btn-secondary btn-icon"
                        onClick={() => {
                          const temp = compareAId;
                          setCompareAId(compareBId);
                          setCompareBId(temp);
                        }}
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
                        value={compareBId}
                        onChange={(e) => setCompareBId(e.target.value)}
                      >
                        {currentExp.runs.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.title} ({r.outcome})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {comparisonResult ? (
                <>
                  {/* Photo comparison if attached */}
                  {((runA?.imageUrls && runA.imageUrls.length > 0) || (runB?.imageUrls && runB.imageUrls.length > 0)) && (
                    <div className="card" style={{ marginBottom: '20px' }}>
                      <div className="card-body">
                        <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, marginBottom: '14px' }}>
                          Micrograph & Visual Outcome Diff
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          <div>
                            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', display: 'block', marginBottom: '6px' }}>
                              TRIAL A ({runA?.title})
                            </span>
                            {runA?.imageUrls?.[0] ? (
                              <div className="gallery-thumbnail" style={{ height: '200px' }} onClick={() => setPreviewLightbox(runA.imageUrls[0])}>
                                <img src={runA.imageUrls[0]} alt="Trial A outcome" style={{ objectFit: 'contain' }} />
                              </div>
                            ) : (
                              <div style={{ height: '200px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                                No photo attached for Trial A
                              </div>
                            )}
                          </div>
                          <div>
                            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-accent)', display: 'block', marginBottom: '6px' }}>
                              TRIAL B ({runB?.title})
                            </span>
                            {runB?.imageUrls?.[0] ? (
                              <div className="gallery-thumbnail" style={{ height: '200px' }} onClick={() => setPreviewLightbox(runB.imageUrls[0])}>
                                <img src={runB.imageUrls[0]} alt="Trial B outcome" style={{ objectFit: 'contain' }} />
                              </div>
                            ) : (
                              <div style={{ height: '200px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>
                                No photo attached for Trial B
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Parameter Diff Table */}
                  <div className="card" style={{ marginBottom: '20px' }}>
                    <div className="card-body" style={{ paddingBottom: 0 }}>
                      <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, marginBottom: '12px' }}>
                        Parameter Differences
                      </h4>
                    </div>
                    <div className="table-container" style={{ border: 'none' }}>
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
                          {comparisonResult.parameterDiffs.map((diff) => (
                            <tr key={diff.name}>
                              <td style={{ fontWeight: 600 }}>{diff.name}</td>
                              <td>{diff.runA ? `${diff.runA.value} ${diff.runA.unit}` : '—'}</td>
                              <td>{diff.runB ? `${diff.runB.value} ${diff.runB.unit}` : '—'}</td>
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
                                <span className={`badge ${diff.status === 'changed' ? 'badge-warning' : diff.status === 'unchanged' ? 'badge-success' : 'badge-error'}`}>
                                  {diff.status === 'unchanged' ? '✓ Same' : diff.status === 'changed' ? '△ Changed' : '✕ Missing'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Outcome Diff */}
                  <div className="stats-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="stat-card">
                      <span className="stat-label">Outcome Shift</span>
                      <span className="stat-value" style={{ fontSize: 'var(--font-size-lg)' }}>
                        {comparisonResult.outcomeDiff.runA} → {comparisonResult.outcomeDiff.runB}
                      </span>
                    </div>
                    <div className="stat-card">
                      <span className="stat-label">Quality Score Change</span>
                      <span className="stat-value" style={{ fontSize: 'var(--font-size-lg)' }}>
                        {comparisonResult.qualityDiff.difference !== null
                          ? `${formatDiff(comparisonResult.qualityDiff.difference)} pts (${runA?.qualityScore ?? '—'} to ${runB?.qualityScore ?? '—'})`
                          : 'No score delta'}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <p>Please select two different runs above to compare.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 4: AI NEXT-STEP INSIGHTS (Scoped to Experiment X)
         ══════════════════════════════════════════════════════ */}
      {activeTab === 'insights' && (
        <div>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: '6px' }}>
              Gemini 2.5 Flash Formulation Copilot
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', maxWidth: '580px', margin: '0 auto' }}>
              Analyzing {totalRuns} test runs specifically for <strong>{currentExp.material}</strong> to synthesize the next evidence-backed trial.
            </p>
            <button
              className="btn btn-primary btn-lg"
              style={{ marginTop: '16px' }}
              onClick={handleGenerateAIHypothesis}
              disabled={aiLoading || totalRuns === 0}
            >
              {aiLoading ? 'Analyzing Runs with Gemini…' : '🧠 Generate Next Hypothesis'}
            </button>
          </div>

          {aiError && (
            <div className="card" style={{ borderColor: 'var(--color-error)', marginBottom: '16px' }}>
              <div className="card-body">
                <p style={{ color: 'var(--color-error)' }}>⚠ {aiError}</p>
              </div>
            </div>
          )}

          {aiHypothesis && (
            <div className="insight-card">
              <div className="insight-header">
                <span className="icon">🧠</span>
                <h3>Evidence-Backed Next Hypothesis</h3>
                <span className="badge badge-success">
                  {aiHypothesis.confidence} Confidence
                </span>
              </div>

              <div className="insight-section">
                <h4>💡 Hypothesis</h4>
                <p style={{ fontStyle: 'italic', fontSize: 'var(--font-size-base)' }}>
                  "{aiHypothesis.hypothesis}"
                </p>
              </div>

              {aiHypothesis.proposedChange && (
                <div className="insight-section">
                  <h4>🔧 Recommended Parameter Change</h4>
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
                      <div style={{ fontWeight: 700 }}>{aiHypothesis.proposedChange.parameterName}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Target Value</span>
                      <div style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                        {aiHypothesis.proposedChange.suggestedValue} {aiHypothesis.proposedChange.unit}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="insight-section">
                <h4>📝 Scientific Reasoning</h4>
                <p>{aiHypothesis.reasoning}</p>
              </div>

              <div className="insight-section">
                <h4>👁 Target Observation</h4>
                <p>{aiHypothesis.nextObservation}</p>
              </div>

              {aiHypothesis.caveats && (
                <div className="insight-section">
                  <h4>⚠ Caveats & Risks</h4>
                  <p style={{ color: 'var(--color-text-muted)' }}>{aiHypothesis.caveats}</p>
                </div>
              )}

              <div style={{ marginTop: '20px' }}>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => handleAdoptAIHypothesis(aiHypothesis)}
                >
                  ✚ Feed This Recommended Run →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Run Detail Modal / Lightbox ── */}
      {selectedRunDetail && (
        <div className="modal-overlay" onClick={() => setSelectedRunDetail(null)}>
          <div className="modal-box" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{selectedRunDetail.title}</h3>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Logged {new Date(selectedRunDetail.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedRunDetail(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <span className={`badge ${getOutcomeBadgeClass(selectedRunDetail.outcome)}`}>
                  Outcome: {selectedRunDetail.outcome}
                </span>
                {selectedRunDetail.qualityScore !== null && (
                  <span className="badge" style={{ background: '#f1f5f9', color: '#1e293b' }}>
                    Quality: {selectedRunDetail.qualityScore} / 10
                  </span>
                )}
              </div>

              <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, marginBottom: '8px' }}>
                Parameters
              </h4>
              <div className="table-container" style={{ marginBottom: '16px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Value</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRunDetail.parameters.map((p, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td>{p.value}</td>
                        <td style={{ color: 'var(--color-text-muted)' }}>{p.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedRunDetail.notesRaw && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, marginBottom: '4px' }}>
                    Observations
                  </h4>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {selectedRunDetail.notesRaw}
                  </p>
                </div>
              )}

              {selectedRunDetail.imageUrls && selectedRunDetail.imageUrls.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, marginBottom: '8px' }}>
                    Micrographs ({selectedRunDetail.imageUrls.length})
                  </h4>
                  <div className="experiment-gallery">
                    {selectedRunDetail.imageUrls.map((img, i) => (
                      <div key={i} className="gallery-thumbnail" onClick={() => setPreviewLightbox(img)}>
                        <img src={img} alt="Run micrograph" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  cloneRunToFeed(selectedRunDetail);
                  setSelectedRunDetail(null);
                }}
              >
                📋 Clone to Feed Form
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setSelectedRunDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {previewLightbox && (
        <div className="lightbox-modal" onClick={() => setPreviewLightbox(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lightbox-close"
              onClick={() => setPreviewLightbox(null)}
            >
              ✕
            </button>
            <img src={previewLightbox} alt="Micrograph preview" className="lightbox-img" />
          </div>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
