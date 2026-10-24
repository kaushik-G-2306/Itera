// ── Experiment & Test Run Domain Types ──

export interface Parameter {
  name: string;
  value: string;
  unit: string;
}

export type OutcomeStatus = 'Success' | 'Partial' | 'Failed' | 'Uncertain';

export interface StructuredNotes {
  summary: string;
  observations: string[];
  detectedDefects: string[];
  unknowns: string[];
}

/**
 * An individual test trial conducted within a main Experiment
 */
export interface TestRun {
  id: string;
  experimentId: string;
  title: string;
  parameters: Parameter[];
  outcome: OutcomeStatus;
  qualityScore: number | null; // 1–10, user self-assessed
  notesRaw: string; // always preserved
  notesStructured: StructuredNotes | null; // AI-extracted, editable
  imageUrls: string[];
  createdAt: number; // epoch ms
  updatedAt: number;
}

export interface Ingredient {
  name: string;
  quantity: string;
  notes: string; // material source, preparation method, etc.
}

/**
 * A Main Material / Experiment Project container (e.g. Experiment "X" or "Y")
 * Holds isolated test runs, formulation details, and objectives.
 */
export interface Experiment {
  id: string;
  title: string; // e.g. "Carrot Puree 3D Printing"
  material: string; // e.g. "Carrot puree v2"
  ingredients?: Ingredient[];
  description: string; // Objective / target goal of this experiment
  runs: TestRun[]; // Test details feed for this specific experiment
  createdAt: number;
  updatedAt: number;
  isSampleData?: boolean;
}

// ── AI Response Schemas ──

export interface AIExtractionResponse {
  title: string;
  material: string;
  parameters: Parameter[];
  outcome: OutcomeStatus | null;
  qualityScore: number | null;
  structuredNotes: StructuredNotes;
}

export interface AIHypothesisResponse {
  insufficientEvidence: boolean;
  hypothesis: string;
  proposedChange: {
    parameterName: string;
    suggestedValue: string;
    unit: string;
  } | null;
  evidenceRunIds: string[];
  reasoning: string;
  nextObservation: string;
  caveats: string;
  confidence: 'Low' | 'Medium' | 'High';
}

// ── Comparison Types ──

export type DiffStatus = 'changed' | 'unchanged' | 'missing' | 'unit-mismatch';

export interface ParameterDiff {
  name: string;
  status: DiffStatus;
  runA: { value: string; unit: string } | null;
  runB: { value: string; unit: string } | null;
  numericDifference: number | null;
}

export interface ComparisonResult {
  runA: TestRun;
  runB: TestRun;
  parameterDiffs: ParameterDiff[];
  outcomeDiff: {
    runA: OutcomeStatus;
    runB: OutcomeStatus;
    changed: boolean;
  };
  qualityDiff: {
    runA: number | null;
    runB: number | null;
    difference: number | null;
  };
}
