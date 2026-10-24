# Itera — AI-Powered Experiment Copilot for Physical R&D

> **Every experiment moves you forward.**  
> A lightweight, evidence-grounded copilot for researchers and engineers running repeated physical trials (e.g. 3D food printing).

---

## 🎯 The Core Product Loop

```
LOG RUN ──► COMPARE RUNS ──► AI INSIGHTS ──► TEST NEXT (DRAFT)
```

1. **Log Run**: Quick free-text observation capture, parameter tracking, outcome badges, and optional AI note structuring.
2. **Compare Runs**: Deterministic, side-by-side parameter difference tables without AI arithmetic errors or hallucinations.
3. **AI Insights**: Grounded, evidence-backed hypothesis proposing the next test parameter based on prior run history.
4. **Test Next**: One-click convert AI hypothesis into a prefilled draft experiment for human review.

---

## 🚀 Key Features

- **🔬 Experiment History Dashboard**: Track trials with outcome badges (`Success`, `Partial`, `Failed`, `Uncertain`), quality scores (1–10), and real-time search & filters.
- **📊 Outcome Breakdown Bar**: Visual summary of trial outcomes and success rates.
- **🤖 AI Note Extraction**: Turn messy, unstructured lab notes into structured parameters, defect terms, and unknowns using Google Gemini (with resilient offline heuristics fallback).
- **⚖️ Side-by-Side Comparison**: Pick any two runs with interactive dropdowns or instant swap; highlights numeric parameter differences and unit mismatches.
- **🧠 Next-Test Hypothesis**: Generates a cautious next-step hypothesis that cites specific evidence run IDs, states clear caveats, and declines to guess when data is sparse (`insufficientEvidence`).
- **📥 CSV & JSON Export**: One-click download of individual experiment records or full dataset for offline analysis.
- **🛡️ Rock-Solid Resilience**: Works seamlessly in both live cloud mode (Firebase + Gemini) and zero-config offline mode with pre-seeded illustrative sample data.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19 + TypeScript + Vite |
| **Styling** | Custom Plain CSS Design System (no heavy runtime framework) |
| **Database** | Google Cloud Firestore (UID-scoped user collections) |
| **Authentication** | Firebase Authentication (Anonymous sign-in for frictionless demo) |
| **AI / LLM** | Google Gemini 2.0 Flash (`gemini-2.0-flash` API / Firebase AI Logic) |
| **Data Export** | Native CSV & JSON generation |

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js (v18+)
- npm

### 2. Install Dependencies
```bash
cd Itera
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Open **[http://localhost:5173/](http://localhost:5173/)** in your browser.

### 4. Build for Production
```bash
npm run build
```

---

## 🔑 Environment Configuration (Optional)

Itera operates **fully offline out-of-the-box** using built-in domain heuristics and pre-seeded sample data. To connect real Firebase and live Gemini 2.0 Flash:

Create a `.env.local` file inside `Itera/`:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abcdef1234567890

# Google Gemini API Key (Enables live Gemini 2.0 Flash)
VITE_GEMINI_API_KEY=your-gemini-api-key
```

---

## 🎬 90-Second Demo Walkthrough for Judges

1. **Dashboard & History**:
   - Open [http://localhost:5173/](http://localhost:5173/). Note the clean metrics cards, outcome breakdown bar, and sample experiments.
2. **Log Run with AI Extraction**:
   - Click **✚ New Experiment**.
   - Type in the notes box:  
     `"Test on carrot puree v3. Flow rate 28 mm/s, nozzle 1.0mm, temp 25C. Slight corner distortion observed, layer adhesion was decent."`
   - Click **🤖 Extract with AI**. Notice how parameters, title, defects, and observations populate as an editable draft.
   - Set outcome to **Partial**, quality score to **6.5**, and click **💾 Save Experiment**.
3. **Compare Two Runs**:
   - On the Experiments page, check the checkboxes for two runs (e.g. #1 and #2) and click **⚖️ Compare Selected (2)**.
   - Observe the side-by-side comparison table with automated diff indicators (`+5 mm/s`, `✓ Same`, `△ Changed`).
   - Use the dropdown selectors or the `⇄` button to swap or change runs on the fly.
4. **Generate Next-Test Hypothesis**:
   - Click **🧠 AI Insights**.
   - Click **Suggest Next Experiment**.
   - Review the cautious hypothesis citing previous run IDs, proposed parameter adjustment, reasoning, and caveats.
   - Click **✚ Draft This Experiment →** to directly prefill a new run with the hypothesis goals.
5. **Data Export**:
   - Click **📥 Export CSV** on the dashboard to show seamless portability.

---

## 📜 Hackathon Project Info

- **Event**: Road to Devfest: Opensource Edition
- **Project Name**: Itera
- **Domain**: Physical R&D / 3D Food Printing Experimentation
