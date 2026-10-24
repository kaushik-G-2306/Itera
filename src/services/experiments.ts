import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import type { Experiment, TestRun } from '../types/experiment';
import { sampleExperiments } from '../data/sampleExperiments';

const LOCAL_CACHE_KEY = 'itera_experiments_v3_fresh';

// ── Normalization for robust backward-compatibility ──

export function normalizeExperiment(raw: unknown, index = 0): Experiment {
  if (!raw || typeof raw !== 'object') {
    return {
      id: `exp-${index}`,
      title: 'Untitled Experiment',
      material: 'Standard Formulation',
      description: '',
      runs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  const rObj = raw as Record<string, unknown>;
  const expId = typeof rObj.id === 'string' && rObj.id ? rObj.id : `exp-${index}`;
  const title = typeof rObj.title === 'string' && rObj.title ? rObj.title : 'Untitled Experiment';
  const material = typeof rObj.material === 'string' && rObj.material ? rObj.material : 'Standard Formulation';
  const description = typeof rObj.description === 'string' ? rObj.description : '';
  const createdAt = typeof rObj.createdAt === 'number' ? rObj.createdAt : Date.now();
  const updatedAt = typeof rObj.updatedAt === 'number' ? rObj.updatedAt : Date.now();

  let runs: TestRun[] = [];

  if (Array.isArray(rObj.runs)) {
    runs = rObj.runs.map((r: unknown, rIdx: number): TestRun => {
      const runObj = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      return {
        id: typeof runObj.id === 'string' && runObj.id ? runObj.id : `run-${expId}-${rIdx}`,
        experimentId: typeof runObj.experimentId === 'string' && runObj.experimentId ? runObj.experimentId : expId,
        title: typeof runObj.title === 'string' && runObj.title ? runObj.title : `Trial #${rIdx + 1}`,
        parameters: Array.isArray(runObj.parameters) ? (runObj.parameters as TestRun['parameters']) : [],
        outcome: (['Success', 'Partial', 'Failed', 'Uncertain'].includes(runObj.outcome as string)
          ? runObj.outcome
          : 'Success') as TestRun['outcome'],
        qualityScore: typeof runObj.qualityScore === 'number' ? runObj.qualityScore : null,
        notesRaw: typeof runObj.notesRaw === 'string' ? runObj.notesRaw : '',
        notesStructured: runObj.notesStructured && typeof runObj.notesStructured === 'object'
          ? (runObj.notesStructured as TestRun['notesStructured'])
          : null,
        imageUrls: Array.isArray(runObj.imageUrls) ? (runObj.imageUrls as string[]) : [],
        createdAt: typeof runObj.createdAt === 'number' ? runObj.createdAt : createdAt,
        updatedAt: typeof runObj.updatedAt === 'number' ? runObj.updatedAt : updatedAt,
      };
    });
  } else if (Array.isArray(rObj.parameters)) {
    // Upgraded legacy flat experiment
    runs = [
      {
        id: `run-${expId}-1`,
        experimentId: expId,
        title: `${title} — Initial Run`,
        parameters: rObj.parameters as TestRun['parameters'],
        outcome: (['Success', 'Partial', 'Failed', 'Uncertain'].includes(rObj.outcome as string)
          ? rObj.outcome
          : 'Success') as TestRun['outcome'],
        qualityScore: typeof rObj.qualityScore === 'number' ? rObj.qualityScore : null,
        notesRaw: typeof rObj.notesRaw === 'string' ? rObj.notesRaw : '',
        notesStructured: rObj.notesStructured && typeof rObj.notesStructured === 'object'
          ? (rObj.notesStructured as TestRun['notesStructured'])
          : null,
        imageUrls: Array.isArray(rObj.imageUrls) ? (rObj.imageUrls as string[]) : [],
        createdAt,
        updatedAt,
      },
    ];
  }

  let ingredients: Experiment['ingredients'] = [];
  if (Array.isArray(rObj.ingredients)) {
    ingredients = rObj.ingredients
      .filter((ing): ing is Record<string, unknown> => Boolean(ing && typeof ing === 'object'))
      .map((ing) => ({
        name: typeof ing.name === 'string' ? ing.name : '',
        quantity: typeof ing.quantity === 'string' ? ing.quantity : '',
        notes: typeof ing.notes === 'string' ? ing.notes : '',
      }))
      .filter((ing) => ing.name.trim() || ing.quantity.trim() || ing.notes.trim());
  }

  return {
    id: expId,
    title,
    material,
    ingredients,
    description,
    runs,
    createdAt,
    updatedAt,
    isSampleData: Boolean(rObj.isSampleData),
  };
}

// ── LocalStorage Fallback Cache ──

function getLocalCache(): Experiment[] {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx) => normalizeExperiment(item, idx));
      }
    }
  } catch (err) {
    console.warn('Error reading local cache:', err);
  }
  return [];
}

function saveLocalCache(experiments: Experiment[]): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(experiments));
  } catch (err) {
    console.warn('Error saving local cache:', err);
  }
}

// ── Helpers ──

function getUserExperimentsRef() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('User not authenticated');
  return collection(db, 'users', uid, 'experiments');
}

function generateId(prefix = 'id'): string {
  const rand = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${rand}`;
}

// ── Top-Level Experiment Container Operations ──

export async function fetchExperiments(): Promise<Experiment[]> {
  try {
    const ref = getUserExperimentsRef();
    const q = query(ref, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const firestoreExps = snapshot.docs.map((d, idx) =>
        normalizeExperiment({ id: d.id, ...d.data() }, idx)
      );
      saveLocalCache(firestoreExps);
      return firestoreExps;
    }
  } catch (err) {
    console.warn('Firestore fetch unavailable, reading local storage:', err);
  }
  return getLocalCache();
}

export async function getExperimentById(id: string): Promise<Experiment | undefined> {
  const list = await fetchExperiments();
  return list.find((e) => e.id === id);
}

export async function createExperiment(data: {
  title: string;
  material: string;
  ingredients?: Experiment['ingredients'];
  description?: string;
  runs?: TestRun[];
}): Promise<Experiment> {
  const now = Date.now();
  const newId = generateId('exp');
  const newExperiment: Experiment = {
    id: newId,
    title: data.title.trim(),
    material: data.material.trim(),
    ingredients: (data.ingredients || []).filter(
      (ing) => ing.name.trim() || ing.quantity.trim() || ing.notes.trim()
    ),
    description: data.description?.trim() || '',
    runs: data.runs || [],
    createdAt: now,
    updatedAt: now,
  };

  const localList = getLocalCache();
  const updatedList = [newExperiment, ...localList.filter((e) => e.id !== newId)];
  saveLocalCache(updatedList);

  try {
    const ref = getUserExperimentsRef();
    const docRef = doc(ref, newId);
    await setDoc(docRef, {
      ...newExperiment,
      _serverCreatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Firestore sync failed, preserved in local cache:', err);
  }

  return newExperiment;
}

export async function updateExperiment(
  id: string,
  data: Partial<Experiment>
): Promise<void> {
  const localList = getLocalCache();
  const updated = localList.map((e) => (e.id === id ? { ...e, ...data, updatedAt: Date.now() } : e));
  saveLocalCache(updated);

  try {
    const ref = getUserExperimentsRef();
    const docRef = doc(ref, id);
    await updateDoc(docRef, { ...data, updatedAt: Date.now() });
  } catch (err) {
    console.warn('Firestore update failed, preserved locally:', err);
  }
}

export async function deleteExperiment(id: string): Promise<void> {
  const localList = getLocalCache();
  const updated = localList.filter((e) => e.id !== id);
  saveLocalCache(updated);

  try {
    const ref = getUserExperimentsRef();
    const docRef = doc(ref, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore delete failed, removed locally:', err);
  }
}

// ── Isolated Test Run Operations within an Experiment Container ──

export async function addTestRun(
  experimentId: string,
  runData: Omit<TestRun, 'id' | 'experimentId' | 'createdAt' | 'updatedAt'>
): Promise<TestRun> {
  const now = Date.now();
  const newRun: TestRun = {
    ...runData,
    id: generateId('run'),
    experimentId,
    createdAt: now,
    updatedAt: now,
  };

  const localList = getLocalCache();
  const updatedList = localList.map((exp) => {
    if (exp.id === experimentId) {
      return {
        ...exp,
        runs: [newRun, ...(exp.runs || [])],
        updatedAt: now,
      };
    }
    return exp;
  });
  saveLocalCache(updatedList);

  try {
    const targetExp = updatedList.find((e) => e.id === experimentId);
    if (targetExp) {
      const ref = getUserExperimentsRef();
      const docRef = doc(ref, experimentId);
      await updateDoc(docRef, {
        runs: targetExp.runs,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Firestore run sync failed, stored locally:', err);
  }

  return newRun;
}

export async function addMultipleTestRuns(
  experimentId: string,
  runsData: Array<Omit<TestRun, 'id' | 'experimentId' | 'createdAt' | 'updatedAt'>>
): Promise<TestRun[]> {
  const now = Date.now();
  const newRuns: TestRun[] = runsData.map((data, index) => ({
    ...data,
    id: `${generateId('run')}-${index}`,
    experimentId,
    createdAt: now + index,
    updatedAt: now + index,
  }));

  const localList = getLocalCache();
  const updatedList = localList.map((exp) => {
    if (exp.id === experimentId) {
      return {
        ...exp,
        runs: [...newRuns, ...(exp.runs || [])],
        updatedAt: now,
      };
    }
    return exp;
  });
  saveLocalCache(updatedList);

  try {
    const targetExp = updatedList.find((e) => e.id === experimentId);
    if (targetExp) {
      const ref = getUserExperimentsRef();
      const docRef = doc(ref, experimentId);
      await updateDoc(docRef, {
        runs: targetExp.runs,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Firestore multi-run sync failed, stored locally:', err);
  }

  return newRuns;
}

export async function updateTestRun(
  experimentId: string,
  runId: string,
  updates: Partial<TestRun>
): Promise<void> {
  const now = Date.now();
  const localList = getLocalCache();
  const updatedList = localList.map((exp) => {
    if (exp.id === experimentId) {
      const updatedRuns = (exp.runs || []).map((r) =>
        r.id === runId ? { ...r, ...updates, updatedAt: now } : r
      );
      return { ...exp, runs: updatedRuns, updatedAt: now };
    }
    return exp;
  });
  saveLocalCache(updatedList);

  try {
    const targetExp = updatedList.find((e) => e.id === experimentId);
    if (targetExp) {
      const ref = getUserExperimentsRef();
      const docRef = doc(ref, experimentId);
      await updateDoc(docRef, {
        runs: targetExp.runs,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Firestore update run failed:', err);
  }
}

export async function deleteTestRun(experimentId: string, runId: string): Promise<void> {
  const now = Date.now();
  const localList = getLocalCache();
  const updatedList = localList.map((exp) => {
    if (exp.id === experimentId) {
      return {
        ...exp,
        runs: (exp.runs || []).filter((r) => r.id !== runId),
        updatedAt: now,
      };
    }
    return exp;
  });
  saveLocalCache(updatedList);

  try {
    const targetExp = updatedList.find((e) => e.id === experimentId);
    if (targetExp) {
      const ref = getUserExperimentsRef();
      const docRef = doc(ref, experimentId);
      await updateDoc(docRef, {
        runs: targetExp.runs,
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('Firestore delete run failed:', err);
  }
}

// ── Sample Data Management ──

export function getSampleExperiments(): Experiment[] {
  return sampleExperiments.map((exp, idx) =>
    normalizeExperiment(
      {
        ...exp,
        runs: exp.runs ? exp.runs.map((r) => ({ ...r })) : [],
      },
      idx
    )
  );
}

export function clearAllExperiments(): void {
  saveLocalCache([]);
}

export function resetToSampleExperiments(): Experiment[] {
  const freshSamples = getSampleExperiments();
  saveLocalCache(freshSamples);
  return freshSamples;
}
