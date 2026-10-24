import type {
  TestRun,
  ParameterDiff,
  ComparisonResult,
  DiffStatus,
} from '../types/experiment';

/**
 * Deterministic comparison between two Test Runs — no AI involved.
 * All arithmetic is done in TypeScript; the model is only used for summaries.
 */
export function compareTestRuns(
  runA: TestRun,
  runB: TestRun
): ComparisonResult {
  // Collect all parameter names from both runs
  const allParamNames = new Set<string>();
  runA.parameters.forEach((p) => allParamNames.add(p.name));
  runB.parameters.forEach((p) => allParamNames.add(p.name));

  const parameterDiffs: ParameterDiff[] = [];

  for (const name of allParamNames) {
    const paramA = runA.parameters.find((p) => p.name === name) ?? null;
    const paramB = runB.parameters.find((p) => p.name === name) ?? null;

    let status: DiffStatus;
    let numericDifference: number | null = null;

    if (!paramA || !paramB) {
      status = 'missing';
    } else if (paramA.unit !== paramB.unit) {
      status = 'unit-mismatch';
    } else if (paramA.value === paramB.value) {
      status = 'unchanged';
    } else {
      status = 'changed';
      const numA = parseFloat(paramA.value);
      const numB = parseFloat(paramB.value);
      if (!isNaN(numA) && !isNaN(numB)) {
        // Round to 4 decimal places to eliminate IEEE-754 floating point precision errors
        const diff = Math.round((numB - numA) * 10000) / 10000;
        numericDifference = diff;
        if (diff === 0) {
          status = 'unchanged';
        }
      }
    }

    parameterDiffs.push({
      name,
      status,
      runA: paramA ? { value: paramA.value, unit: paramA.unit } : null,
      runB: paramB ? { value: paramB.value, unit: paramB.unit } : null,
      numericDifference,
    });
  }

  // Sort: changed first, then unit-mismatch, missing, then unchanged
  const sortOrder: Record<DiffStatus, number> = {
    changed: 0,
    'unit-mismatch': 1,
    missing: 2,
    unchanged: 3,
  };
  parameterDiffs.sort((a, b) => sortOrder[a.status] - sortOrder[b.status]);

  const rawQualityDiff =
    runA.qualityScore !== null && runB.qualityScore !== null
      ? runB.qualityScore - runA.qualityScore
      : null;

  return {
    runA,
    runB,
    parameterDiffs,
    outcomeDiff: {
      runA: runA.outcome,
      runB: runB.outcome,
      changed: runA.outcome !== runB.outcome,
    },
    qualityDiff: {
      runA: runA.qualityScore,
      runB: runB.qualityScore,
      difference:
        rawQualityDiff !== null
          ? Math.round(rawQualityDiff * 100) / 100
          : null,
    },
  };
}

export function formatDiff(val: number): string {
  // Round to max 4 decimal places and remove trailing zeros
  const rounded = Math.round(val * 10000) / 10000;
  if (rounded > 0) return `+${rounded}`;
  if (rounded === 0) return '0';
  return `${rounded}`;
}
