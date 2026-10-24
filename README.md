# Itera — Open-Source Experiment Copilot for 3D Food Printing Research

> **Every experiment moves research forward.**  
> A specialized, evidence-grounded experiment tracking and comparison platform designed for food scientists, material researchers, and engineers working on 3D food printing and additive formulation development.

---

## 🎯 Purpose & Motivation

Extrusion-based 3D food printing requires balancing intricate rheological behaviors (yield stress, shear-thinning indices, thixotropic recovery) with printing kinematics (nozzle diameter, printing velocity, layer height, and thermal deposition). 

Researchers routinely run dozens of trial variations across formulations (e.g., starch-enriched purees, hydrocolloid gels, chocolate crystals, alternative proteins). Tracking these trials in fragmented spreadsheets often leads to lost parameters, inaccurate arithmetic comparisons, and disconnected formulation records.

**Itera** is a dedicated open-source research copilot built to solve this problem:
1. **Isolate Material Experiments**: Keep separate formulation containers (e.g., Potato Starch vs. Carrot Puree vs. Dark Chocolate) to prevent cross-material data contamination.
2. **Track Complete Formulations**: Document exact recipes, ingredient percentages, preparation methods, and material sources in structured tabular records.
3. **Multi-Trial Parameter Feeding**: Feed successive test runs with rapid cloning and parallel draft entry.
4. **Deterministic Run Comparison**: Perform floating-point safe parameter diffing side-by-side to pinpoint exactly what changed between success and failure.
5. **AI Hypothesis Generation**: Utilize LLM-powered insights (Google Gemini) to synthesize past run evidence and propose grounded parameter adjustments for subsequent trials.

---

## 🔄 The Research Workflow Loop

```
FORMULATION RECIPE ──► LOG TEST TRIALS ──► COMPARE RUNS ──► AI INSIGHTS & HYPOTHESIS
```

1. **Formulation Recipe**: Define material project, target objective, and ingredient breakdown (quantities, supplier/milling details, preparation notes).
2. **Log Test Trials**: Record printing parameters (nozzle diameter, speed, layer height, extrusion temp), quality scores (1–10), micrograph artifacts, and raw notes with optional AI extraction.
3. **Compare Runs**: Select any two trials for side-by-side comparison tables highlighting exact parameter diffs without arithmetic hallucinations.
4. **AI Insights**: Synthesize multi-run outcomes to generate a cautious next-step hypothesis citing specific run evidence and proposing parameter refinements.

---

## 🚀 Key Capabilities

- **🧪 Isolated Experiment Containers**: Group multiple test trials under dedicated material studies, each with its own success rate and formulation specs.
- **🥗 Formulation & Ingredient Breakdowns**: Dynamic 3-column ingredient table capturing name, quantity (w/w% or grams), and source/preparation methods.
- **⚖️ Side-by-Side Trial Diffing**: Deterministic comparison engine featuring IEEE-754 precision rounding, visual micrograph diffing, and neutral zero-diff badges.
- **🤖 AI Lab Note Structuring**: Automatically extracts structured parameters, observed physical defects (e.g., *slumping, stringing, nozzle clogging*), and unknowns from raw text using Google Gemini with offline heuristic fallbacks.
- **🧠 Evidence-Grounded Hypotheses**: Generates actionable next-test suggestions with confidence ratings, explicit caveats, and one-click draft adoption.
- **📥 Open Data Portability**: Export experiments and run logs to CSV and JSON at any time.
- **🛡️ Clean & Resilient**: Operates completely local-first with offline fallback, or seamlessly syncs via Firebase Firestore and Google Gemini.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript, Vite |
| **Styling** | Custom Vanilla CSS Design System with sleek scrolling & responsive modals |
| **Storage & Sync** | Google Cloud Firestore (user-scoped collections) with LocalStorage fallback |
| **Authentication** | Firebase Authentication (Google OAuth & Anonymous lab user sessions) |
| **AI Engine** | Google Gemini (`gemini-2.0-flash` API) with intelligent local domain heuristic engine |
| **Data Export** | Native CSV and JSON parsers |

---

## ⚡ Getting Started

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm**

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/kaushik-G-2306/Itera.git
cd Itera
npm install
```

### 3. Run Locally
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

Itera is fully functional offline out-of-the-box using browser local storage and domain heuristic intelligence.

To enable cloud persistence and live Gemini AI models:
1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Add your Firebase and Google Gemini API credentials:
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

## 🔬 Example Use Case: Mashed Potato & Hydrocolloid Formulation

A representative trial dataset based on published research (*Journal of Food Engineering*, Liu et al., 2018) investigating the printability of starch-enriched purees:

1. **Recipe**: Russet Potato Puree (200 g) + Potato Starch (4.0 g / 2% w/w) + DI Water (30 mL) + Salt (1.0 g).
2. **Trial Variations**:
   - *Baseline*: 1.2 mm nozzle, 30 mm/s speed, 1.0 mm layer height → **Success (Score: 9/10)**.
   - *High Speed Under-Extrusion*: 1.2 mm nozzle, 50 mm/s speed → **Failed (Score: 4/10)** — filament tearing and voids.
   - *Micro-Nozzle Constriction*: 0.8 mm nozzle, 20 mm/s speed → **Partial (Score: 6.5/10)** — high back-pressure and motor stutter.
   - *Over-Extrusion & Slump*: 1.2 mm nozzle, 15 mm/s speed → **Partial (Score: 5/10)** — material accumulation and corner rounding.
   - *High-Throughput Wide Nozzle*: 1.5 mm nozzle, 35 mm/s speed → **Success (Score: 8/10)** — stable mass flow and high structural rigidity.

---

## 🤝 Contributing

Contributions from food scientists, rheologists, and software developers are warmly welcome! Whether adding new food rheology calculation tools, file format exports, or UI enhancements, feel free to open an issue or submit a pull request.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
