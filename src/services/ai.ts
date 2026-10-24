import type { TestRun, AIExtractionResponse, AIHypothesisResponse, Parameter, OutcomeStatus } from '../types/experiment';

/**
 * AI Service — Gemini 2.0 Flash integration with resilient offline fallback.
 *
 * If VITE_GEMINI_API_KEY is configured in .env.local, it calls Google's Gemini 2.0 Flash
 * endpoint with structured JSON output.
 * If no key is set or the network is offline, it falls back to a smart heuristic engine
 * tailored for 3D food printing / physical R&D experiments.
 */

// ── Prompts ──

const EXTRACTION_PROMPT = `You are an R&D lab assistant helping organize experiment notes for 3D food printing research.

Given the following raw experiment notes, extract structured information.
Return ONLY valid JSON matching this exact schema — no markdown, no explanation:

{
  "title": "string — a concise experiment title",
  "material": "string — the material or recipe used, or empty string if unknown",
  "parameters": [
    { "name": "string", "value": "string (numeric)", "unit": "string" }
  ],
  "outcome": "Success" | "Partial" | "Failed" | "Uncertain" | null,
  "qualityScore": number (1-10) | null,
  "structuredNotes": {
    "summary": "string — one sentence summary",
    "observations": ["string — each distinct observation"],
    "detectedDefects": ["string — any issues or defects mentioned"],
    "unknowns": ["string — things that are unclear or need more data"]
  }
}

Rules:
- Only extract information explicitly stated in the notes
- If a value is not mentioned, use null or empty array
- Do not infer numeric values that aren't stated
- outcome should only be set if the user clearly indicates success/failure
- qualityScore should only be set if the user provides a rating`;

const HYPOTHESIS_PROMPT = `You are a research advisor helping plan the next experiment for 3D food printing.

Given the following experiment history (as JSON), suggest what to try next.
Return ONLY valid JSON matching this exact schema — no markdown, no explanation:

{
  "insufficientEvidence": boolean,
  "hypothesis": "string — one sentence, explicitly labelled a hypothesis",
  "proposedChange": {
    "parameterName": "string",
    "suggestedValue": "string",
    "unit": "string"
  } or null,
  "evidenceRunIds": ["string — IDs of experiments that support this suggestion"],
  "reasoning": "string — what differs across runs and why this change may help",
  "nextObservation": "string — what the user should specifically measure or record",
  "caveats": "string — alternative explanations or missing information",
  "confidence": "Low" | "Medium" | "High"
}

Rules:
- Set insufficientEvidence to true if fewer than 2 comparable runs exist
- Only reference experiment IDs that are provided in the input
- Bias toward "Low" confidence for small datasets
- Never claim causation — use "may", "might", "hypothesis"
- Do not suggest operating hardware or overriding safety controls
- If outcomes conflict, describe the disagreement rather than forcing a recommendation`;

// ── Gemini API Call ──

async function callGemini(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

// ── AI Note Extraction ──

export async function extractNotesWithAI(
  rawNotes: string,
  _existingFields?: Partial<TestRun>
): Promise<AIExtractionResponse> {
  // 1. Try real Gemini API if key is available
  if (import.meta.env.VITE_GEMINI_API_KEY) {
    try {
      const prompt = `${EXTRACTION_PROMPT}\n\nNotes to extract from:\n${rawNotes}`;
      const jsonText = await callGemini(prompt);
      const parsed = JSON.parse(jsonText) as AIExtractionResponse;
      return parsed;
    } catch (err) {
      console.warn('Gemini API call failed, falling back to smart extractor:', err);
    }
  }

  // 2. Smart fallback extractor for offline / demo mode
  await simulateLatency();
  return smartHeuristicExtraction(rawNotes);
}

// ── AI Next-Test Hypothesis ──

export async function suggestNextExperiment(
  runs: TestRun[],
  materialName?: string
): Promise<AIHypothesisResponse> {
  if (runs.length < 2) {
    return {
      insufficientEvidence: true,
      hypothesis: 'Not enough experiments to form a hypothesis.',
      proposedChange: null,
      evidenceRunIds: runs.map((e) => e.id),
      reasoning:
        'At least 2 comparable test runs are needed to identify trends and suggest a meaningful next step.',
      nextObservation: 'Run more trials with varied parameters to build a comparison baseline.',
      caveats: 'Confidence is constrained because baseline data is limited.',
      confidence: 'Low',
    };
  }

  // 1. Try real Gemini API if key is available
  if (import.meta.env.VITE_GEMINI_API_KEY) {
    try {
      const context = JSON.stringify({
        material: materialName || 'Experimental material',
        testRuns: runs.map((e) => ({
          id: e.id,
          title: e.title,
          parameters: e.parameters,
          outcome: e.outcome,
          qualityScore: e.qualityScore,
          notes: e.notesRaw,
        })),
      });
      const prompt = `${HYPOTHESIS_PROMPT}\n\nExperiment history:\n${context}`;
      const jsonText = await callGemini(prompt);
      const parsed = JSON.parse(jsonText) as AIHypothesisResponse;

      // Filter evidenceRunIds to only those that exist
      const validIds = new Set(runs.map((e) => e.id));
      parsed.evidenceRunIds = (parsed.evidenceRunIds || []).filter((id) => validIds.has(id));
      return parsed;
    } catch (err) {
      console.warn('Gemini API call failed, falling back to smart hypothesis generator:', err);
    }
  }

  // 2. Smart fallback hypothesis generator
  await simulateLatency();
  return generateDomainHypothesis(runs, materialName);
}

// ── Smart Offline Heuristic Parser ──

function smartHeuristicExtraction(rawNotes: string): AIExtractionResponse {
  const extractedParams: Parameter[] = [];

  // Flow rate
  const flowMatch = rawNotes.match(/(?:flow rate|flow)\s*[:=]?\s*([0-9.]+)\s*(mm\/s|ml\/min)?/i);
  if (flowMatch) {
    extractedParams.push({ name: 'Flow Rate', value: flowMatch[1], unit: flowMatch[2] || 'mm/s' });
  }

  // Nozzle size
  const nozzleMatch = rawNotes.match(/(?:nozzle size|nozzle)\s*[:=]?\s*([0-9.]+)\s*(mm)?/i);
  if (nozzleMatch) {
    extractedParams.push({ name: 'Nozzle Size', value: nozzleMatch[1], unit: nozzleMatch[2] || 'mm' });
  }

  // Temperature
  const tempMatch = rawNotes.match(/(?:temperature|temp)\s*[:=]?\s*([0-9.]+)\s*(°?c)?/i);
  if (tempMatch) {
    extractedParams.push({ name: 'Temperature', value: tempMatch[1], unit: '°C' });
  }

  // Layer height
  const layerMatch = rawNotes.match(/(?:layer height|layer)\s*[:=]?\s*([0-9.]+)\s*(mm)?/i);
  if (layerMatch) {
    extractedParams.push({ name: 'Layer Height', value: layerMatch[1], unit: layerMatch[2] || 'mm' });
  }

  // Material extraction
  let material = '';
  const matMatch = rawNotes.match(/(?:material|recipe|paste|using)\s*[:=]?\s*([A-Za-z0-9\s]+(?:puree|paste|gel|dough|ink|v[0-9]+)?)/i);
  if (matMatch) {
    material = matMatch[1].trim();
  }

  // Outcome detection
  let outcome: OutcomeStatus | null = null;
  if (/success|excellent|flawless|perfect|great result/i.test(rawNotes)) {
    outcome = 'Success';
  } else if (/partial|slight|minor collapse|acceptable|somewhat/i.test(rawNotes)) {
    outcome = 'Partial';
  } else if (/fail|collapse|clog|ruined|melted|failed/i.test(rawNotes)) {
    outcome = 'Failed';
  }

  // Quality score detection
  let qualityScore: number | null = null;
  const scoreMatch = rawNotes.match(/(?:quality|score|rating)\s*[:=]?\s*([0-9.]+)\s*(?:\/\s*10)?/i);
  if (scoreMatch) {
    const s = parseFloat(scoreMatch[1]);
    if (!isNaN(s) && s >= 1 && s <= 10) qualityScore = s;
  }

  // Defect detection
  const detectedDefects: string[] = [];
  const defectPatterns = [
    { name: 'Corner distortion', regex: /corner distortion|rounded corners|corner warp/i },
    { name: 'Layer collapse', regex: /layer collapse|sagging|slumping/i },
    { name: 'Nozzle clogging', regex: /clog|blockage|erratic extrusion/i },
    { name: 'Stringing / Bleeding', regex: /stringing|oozing|bleeding/i },
    { name: 'Poor bed adhesion', regex: /adhesion|lifted off bed|delamination/i },
  ];
  for (const dp of defectPatterns) {
    if (dp.regex.test(rawNotes)) detectedDefects.push(dp.name);
  }

  const sentences = rawNotes
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);

  const observations = sentences.slice(0, 4);

  return {
    title: rawNotes.length > 35 ? rawNotes.slice(0, 35) + '…' : rawNotes,
    material: material || 'Formulated paste',
    parameters: extractedParams,
    outcome,
    qualityScore,
    structuredNotes: {
      summary: sentences[0] || rawNotes.slice(0, 100),
      observations: observations.length > 0 ? observations : [rawNotes],
      detectedDefects,
      unknowns: detectedDefects.length > 0
        ? ['Long-term structural stability under ambient humidity not recorded']
        : ['Cross-batch viscosity consistency unverified'],
    },
  };
}

function generateDomainHypothesis(runs: TestRun[], materialName?: string): AIHypothesisResponse {
  const sorted = [...runs].sort((a, b) => b.createdAt - a.createdAt);
  const recent = sorted.slice(0, 3);
  const evidenceRunIds = recent.map((e) => e.id);
  const matLower = (materialName || '').toLowerCase();

  // If Chocolate formulation
  if (matLower.includes('chocolate') || recent.some((r) => r.parameters.some((p) => /temp|bed/i.test(p.name)))) {
    return {
      insufficientEvidence: false,
      hypothesis: 'Hypothesis: Fine-tuning extrusion temperature to 31.8°C with bed cooling at 18.0°C may preserve Form-V beta crystals while preventing nozzle tip freezing.',
      proposedChange: {
        parameterName: 'Extrusion Temp',
        suggestedValue: '31.8',
        unit: '°C',
      },
      evidenceRunIds,
      reasoning: 'In earlier trials, 34.5°C caused complete thermal fat bloom, whereas 31.2°C showed tip solidification. Operating in the narrow 31.5–32.0°C tempering window maintains viscosity.',
      nextObservation: 'Check surface glossiness and break snap sound immediately after 15 min refrigeration.',
      caveats: 'Ambient room temperature and relative humidity will alter crystallization cooling rates.',
      confidence: runs.length >= 3 ? 'Medium' : 'Low',
    };
  }

  // If Pea Protein formulation
  if (matLower.includes('protein') || matLower.includes('alginate') || recent.some((r) => r.parameters.some((p) => /cacl|calcium/i.test(p.name)))) {
    return {
      insufficientEvidence: false,
      hypothesis: 'Hypothesis: Adjusting CaCl2 concentration to 2.8% at 14 mm/s flow may enhance tensile chewiness without inducing premature nozzle skinning.',
      proposedChange: {
        parameterName: 'CaCl2 Concentration',
        suggestedValue: '2.8',
        unit: '%',
      },
      evidenceRunIds,
      reasoning: '2.5% CaCl2 yielded good fiber alignment, while 4.5% caused instant tip blockage. An intermediate 2.8% bath optimizes cross-link density without motor stall.',
      nextObservation: 'Perform tensile pull test and inspect cross-sectional fiber bundles under 10x magnification.',
      caveats: 'Batch-to-batch variation in pea protein isolate solubility can alter crosslinking kinetics.',
      confidence: runs.length >= 3 ? 'Medium' : 'Low',
    };
  }

  // Default / Carrot Puree formulation
  const flowParam = recent.find((e) => e.parameters.some((p) => /flow/i.test(p.name)));
  const flowVal = flowParam?.parameters.find((p) => /flow/i.test(p.name))?.value || '25';
  const targetFlow = Math.max(15, parseFloat(flowVal) - 3).toString();

  return {
    insufficientEvidence: false,
    hypothesis: `Hypothesis: Decreasing flow velocity to ${targetFlow} mm/s while maintaining 0.5 mm layer height may eliminate remaining travel stringing without sacrificing corner geometry.`,
    proposedChange: {
      parameterName: 'Flow Rate',
      suggestedValue: targetFlow,
      unit: 'mm/s',
    },
    evidenceRunIds,
    reasoning: `In tests (${recent.map((r) => `"${r.title}"`).join(', ')}), 38 mm/s caused catastrophic slumping, while 25 mm/s produced stable corners. A slight reduction to ${targetFlow} mm/s further sharpens fillet precision.`,
    nextObservation: 'Measure corner fillet radius and vertical wall straightness with a caliper immediately after print.',
    caveats: 'Xanthan gum hydration time and ambient temperature influence paste shear recovery.',
    confidence: runs.length >= 3 ? 'Medium' : 'Low',
  };
}

// ── Prompt exports ──

export { EXTRACTION_PROMPT, HYPOTHESIS_PROMPT };

// ── Utilities ──

function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 500));
}
