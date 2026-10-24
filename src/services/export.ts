import type { Experiment } from '../types/experiment';

/**
 * Data Export Service — Export experiments & isolated test runs as JSON or CSV.
 */

export function exportExperimentAsJson(experiment: Experiment): void {
  const dataStr = JSON.stringify(experiment, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  downloadBlob(blob, `${slugify(experiment.title)}_${experiment.id.slice(0, 8)}.json`);
}

export function exportAllExperimentsAsJson(experiments: Experiment[]): void {
  const dataStr = JSON.stringify(experiments, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  downloadBlob(blob, `itera_experiments_all_${Date.now()}.json`);
}

export function exportExperimentRunsAsCsv(experiment: Experiment): void {
  const headers = [
    'Experiment ID',
    'Experiment Title',
    'Material',
    'Run ID',
    'Run Title',
    'Outcome',
    'Quality Score',
    'Created At',
    'Parameters',
    'Raw Notes',
    'AI Summary',
    'Defects Detected',
    'Photo Count',
  ];

  const rows = experiment.runs.map((r) => [
    sanitize(experiment.id),
    sanitize(experiment.title),
    sanitize(experiment.material || ''),
    sanitize(r.id),
    sanitize(r.title),
    sanitize(r.outcome),
    sanitize(r.qualityScore !== null ? String(r.qualityScore) : ''),
    sanitize(new Date(r.createdAt).toISOString()),
    sanitize(r.parameters.map((p) => `${p.name}: ${p.value}${p.unit}`).join('; ')),
    sanitize(r.notesRaw || ''),
    sanitize(r.notesStructured?.summary || ''),
    sanitize((r.notesStructured?.detectedDefects || []).join('; ')),
    sanitize(String(r.imageUrls ? r.imageUrls.length : 0)),
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${slugify(experiment.title)}_runs_${Date.now()}.csv`);
}

export function exportAllExperimentsAsCsv(experiments: Experiment[]): void {
  const headers = [
    'Experiment ID',
    'Experiment Title',
    'Material',
    'Run ID',
    'Run Title',
    'Outcome',
    'Quality Score',
    'Created At',
    'Parameters',
    'Raw Notes',
    'AI Summary',
    'Defects Detected',
    'Photo Count',
  ];

  const rows: string[][] = [];
  for (const exp of experiments) {
    for (const r of exp.runs) {
      rows.push([
        sanitize(exp.id),
        sanitize(exp.title),
        sanitize(exp.material || ''),
        sanitize(r.id),
        sanitize(r.title),
        sanitize(r.outcome),
        sanitize(r.qualityScore !== null ? String(r.qualityScore) : ''),
        sanitize(new Date(r.createdAt).toISOString()),
        sanitize(r.parameters.map((p) => `${p.name}: ${p.value}${p.unit}`).join('; ')),
        sanitize(r.notesRaw || ''),
        sanitize(r.notesStructured?.summary || ''),
        sanitize((r.notesStructured?.detectedDefects || []).join('; ')),
        sanitize(String(r.imageUrls ? r.imageUrls.length : 0)),
      ]);
    }
  }

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `itera_all_experiment_runs_${Date.now()}.csv`);
}

function sanitize(value: string): string {
  const str = value.replace(/"/g, '""');
  return `"${str}"`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
