# ROBOFIX — Full Project Build Prompt

> Use this prompt with a capable coding LLM (Claude, GPT-4, etc.) to recreate the entire ROBOFIX project from scratch.

---

## Prompt

Build a full-stack web application called **ROBOFIX** — an AI-powered predictive maintenance and wear optimization dashboard for industrial robotic arms. The system ingests robot sensor data (accelerometer, gyroscope, magnetometer), runs an ML pipeline to detect anomalies and estimate joint wear, recommends alternative materials, simulates future degradation, and presents everything through an interactive dashboard with a 3D robot model.

The project has three layers: a **Python/FastAPI backend** with an ML pipeline, a **Next.js/React frontend** with Three.js 3D visualization, and **Docker/Vercel deployment** configs.

---

### 1. PROJECT STRUCTURE

```
robofix/
├── backend/
│   ├── main.py                      # FastAPI app entry point
│   ├── api/routes.py                # REST API endpoints
│   ├── models/schemas.py            # Pydantic request/response models
│   └── services/
│       ├── state.py                 # In-memory application state
│       ├── pipeline_service.py      # Orchestrates the ML pipeline
│       └── visualization_service.py # Builds 3D joint positions and wear colors
├── pipeline/
│   ├── feature_engineering.py       # Sensor data loading, normalization, feature extraction
│   ├── anomaly_detection.py         # Isolation Forest anomaly detection per joint
│   ├── wear_model.py               # Archard-inspired wear index computation
│   ├── material_recommender.py      # Material ranking by wear reduction
│   └── wear_simulation.py          # Non-linear wear trajectory simulation
├── utils/
│   └── windowing.py                # NumPy stride-based sliding window utility
├── data/
│   ├── robot_sensor_data.csv       # Bundled demo dataset (~15k rows, IMU data)
│   └── materials.csv               # 15 candidate materials with properties
├── deployment/
│   ├── Dockerfile                  # Backend Docker image
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with metadata and fonts
│   │   ├── page.tsx                # Home page — renders Dashboard
│   │   └── globals.css             # Tailwind 4, CSS variables, custom animations
│   ├── components/
│   │   ├── Dashboard.tsx           # Main layout: sidebar, header, view routing
│   │   ├── RobotViewer.tsx         # Three.js 3D robot arm visualization
│   │   ├── UploadPanel.tsx         # Drag-and-drop CSV upload + demo run
│   │   ├── WearStatsPanel.tsx      # Joint wear cards with selection
│   │   ├── MaterialPanel.tsx       # Ranked material recommendations
│   │   ├── SensorTimeline.tsx      # Magnetometer signal chart with anomalies
│   │   ├── SimulationChart.tsx     # Wear projection + material comparison charts
│   │   └── ExportPanel.tsx         # PDF report and CSV data export
│   ├── lib/
│   │   ├── api.ts                  # TypeScript API client + interfaces
│   │   └── utils.ts                # Tailwind cn() helper, status color mapping
│   ├── Dockerfile                  # Frontend Docker image (standalone)
│   ├── vercel.json                 # Vercel deployment config
│   ├── next.config.ts              # Next.js config with API rewrites
│   ├── tsconfig.json
│   └── package.json
├── docker-compose.yml              # Full-stack orchestration
├── .dockerignore
└── README.md
```

---

### 2. BACKEND (Python / FastAPI)

#### 2.1 `backend/main.py`
- FastAPI app titled "ROBOFIX API"
- CORS middleware allowing all origins
- `asynccontextmanager` lifespan that logs startup, creates upload directory at `data/uploads`, mounts the API router at `/api`
- Root `/health` endpoint returning `{"status": "healthy", "service": "robofix-backend"}`

#### 2.2 `backend/api/routes.py`
Define these endpoints on an `APIRouter`:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/upload_dataset` | Accept `UploadFile`, save to `data/uploads/`, return filename, row count, columns |
| `POST` | `/run_analysis?use_default=bool` | Run the ML pipeline (or use bundled demo data if `use_default=true`). Store results in `AppState`. |
| `GET` | `/results` | Return the latest `AnalysisResult` from state |
| `GET` | `/robot_model` | Return 3D joint data (`RobotModelData`) from visualization service |
| `GET` | `/health` | Health check with `pipeline_status` field |

#### 2.3 `backend/models/schemas.py`
Pydantic models (use `from __future__ import annotations` for Python 3.9 compat):
- `UploadResponse`: filename, rows, columns, message
- `JointWear`: joint_id, anomaly_rate, signal_energy, wear_index, wear_status ("healthy"|"moderate"|"severe")
- `MaterialRecommendation`: material_name, wear_coefficient, hardness, friction_coefficient, wear_reduction_pct
- `WearSimulationPoint`: time, projected_wear
- `JointSimulation`: joint_id, trajectory (list of WearSimulationPoint)
- `MaterialScenario`: joint_id, material_name, trajectory
- `AnalysisResult`: joints, recommendations, simulation, material_scenarios, timeline (timestamps, magnitude, anomaly arrays)
- `JointModel`: joint_id, x, y, z, wear_index, color, wear_status, anomaly_rate, signal_energy
- `RobotModelData`: joints (list of JointModel)

#### 2.4 `backend/services/state.py`
Simple in-memory `AppState` class holding: `sensor_csv_path`, `materials_csv_path`, `pipeline_status`, `error`, `results` (dict), `robot_model` (dict).

#### 2.5 `backend/services/pipeline_service.py`
Orchestrate the pipeline:
1. Load and normalize sensor data via `feature_engineering.load_and_normalise`
2. Extract features via `feature_engineering.extract_features` (window_size=50)
3. Detect anomalies via `anomaly_detection.detect_anomalies`
4. Compute wear indices via `wear_model.compute_wear_index`
5. Rank materials via `material_recommender.rank_materials`
6. Simulate future wear via `wear_simulation.simulate_future_wear`
7. Compare material scenarios via `wear_simulation.compare_material_scenarios`
8. Format all results into the `AnalysisResult` schema structure
9. Build visualization model via `visualization_service.build_robot_model`

#### 2.6 `backend/services/visualization_service.py`
- Define 6 joint positions arranged as a vertical articulated arm: base (0,0,0), shoulder (0,0.35,0.1), elbow (0,0.75,0.5), wrist_1 (0,1.2,0.45), wrist_2 (0,1.5,0.2), wrist_3 (0,1.75,0.3)
- Color-code joints: healthy→#10b981, moderate→#f59e0b, severe→#ef4444
- Enrich each joint with wear_status, anomaly_rate, signal_energy from pipeline results

---

### 3. ML PIPELINE

#### 3.1 Feature Engineering (`pipeline/feature_engineering.py`)
- `load_and_normalise(path)`: Read CSV, map columns (name→joint_id, time→timestamp, magX/Y/Z→mx/my/mz). If only a single joint exists, split into 6 synthetic joints by slicing the data evenly.
- `extract_features(df, window_size=50)`: Compute per-joint:
  - `mag` = √(mx² + my² + mz²)
  - `mag_mean`, `mag_std` (rolling window)
  - `rolling_std` (std of mag in window)
  - `jerk` = |diff(mag)/diff(time)|
  - `energy` = rolling sum of mag²
  - `spectral_energy`, `dominant_frequency` (windowed FFT using `np.fft.rfft`)
  - `entropy` (Shannon entropy via `scipy.stats.entropy`, 10 histogram bins)

#### 3.2 Sliding Window Utility (`utils/windowing.py`)
- Use `np.lib.stride_tricks.as_strided` for efficient O(1) memory windowed views

#### 3.3 Anomaly Detection (`pipeline/anomaly_detection.py`)
- Per joint: `StandardScaler` → `IsolationForest(contamination=0.05, n_estimators=100, random_state=42)`
- Features used: mag_mean, mag_std, jerk, energy, spectral_energy, entropy
- Output: `anomaly` column (-1 = anomalous, 1 = normal), `anomaly_score`

#### 3.4 Wear Model (`pipeline/wear_model.py`)
- Per joint: `anomaly_rate` = fraction of -1 labels, `signal_energy` = mean of energy feature
- `wear_rate = anomaly_rate × signal_energy`
- Normalize wear_rates to [0,1] → `wear_index`
- Status thresholds: healthy (<0.3), moderate (0.3–0.7), severe (≥0.7)

#### 3.5 Material Recommender (`pipeline/material_recommender.py`)
- Load `materials.csv` (15 materials with hardness, wear_coefficient, density, friction_coefficient)
- Baseline = highest wear_coefficient in the dataset
- For each material: `adjusted_wear = wear_rate × (material_coeff / baseline_coeff)`
- `wear_reduction_pct = (1 - adjusted_wear / baseline_wear) × 100`
- Return sorted by wear_reduction_pct descending

#### 3.6 Wear Simulation (`pipeline/wear_simulation.py`)
- `simulate_future_wear(joints, steps=50)`: Non-linear degradation model per joint:
  - `wear(t+dt) = wear(t) + rate × (1 + 1.5 × wear(t)) × dt`
  - Returns time series of projected_wear for each joint
- `compare_material_scenarios(joints, materials, top_n=3)`: For the top N materials plus "Current Material", simulate future wear trajectories per joint

---

### 4. FRONTEND (Next.js + React + TypeScript + Tailwind 4)

#### 4.1 Design System
**Theme**: Dark industrial aesthetic with lime-green accent system.

**Color variables** (in globals.css):
- Backgrounds: `#06060a` (page), `#0e0e14` (cards), `#16161e` (hover)
- Borders: `#1e1e28`
- Accent: `#84cc16` (primary lime), `#a3e635` (secondary lime), `#65a30d` (dark lime)
- Status: `#10b981` (healthy/emerald), `#f59e0b` (moderate/amber), `#ef4444` (severe/red)
- Text: `#f4f4f5` (primary), `#a1a1aa` (secondary), `#71717a` (muted)

**Fonts**: Inter (400–700) for UI, JetBrains Mono (400–500) for data/numbers.

**Custom CSS classes**:
- `.card` — dark card with subtle gradient `::before` overlay, rounded-2xl, border
- `.glass` — frosted glass effect with `backdrop-filter: blur(12px)`
- `.gradient-text` — lime gradient background-clip text
- `.status-dot` — small dot with pulsing ring animation
- `input[type="range"].chart-zoom` — custom slider with lime thumb and glow effect

**Animations** (keyframes):
- `pulse-glow` — box-shadow pulse for status indicators
- `fade-in` — opacity 0→1 with subtle translateY
- `shimmer` — horizontal gradient sweep for loading states
- `float` — gentle vertical bobbing

#### 4.2 `app/page.tsx`
"use client". Hold `results: AnalysisResult | null`, `robotModel: RobotModelData | null`, `loading: boolean` in state. Render `<Dashboard>` with these as props.

#### 4.3 `components/Dashboard.tsx`
Main layout component with:
- **Sidebar** (60px wide): Logo (wrench icon in lime gradient square), 5 navigation buttons (Activity→Dashboard, Bot→3D Viewer, BarChart3→Sensors, FlaskConical→Materials, Upload→Upload). Active button has lime glow. Disabled when no results (except Dashboard/Upload). Hover shows rich tooltip popup with title and description. Version label at bottom.
- **Header** (52px): "ROBO**FIX**" with gradient text, "Predictive Maintenance" subtitle, status badges ("Analysis Complete" or "Processing Pipeline..."), "New Analysis" button.
- **View heading bar**: Dynamic title and subtitle per view.
- **5 conditional views**:
  - **Dashboard**: Grid with 3D viewer (col-span-7, h-400px), side panels (col-span-5, h-400px with WearStatsPanel + MaterialPanel as 50-50 flex), bottom chart tabs (h-380px with Sensor Data / Wear Forecast switcher), ExportPanel at bottom
  - **Viewer**: Full-height 3D robot viewer
  - **Sensors**: SensorTimeline + SimulationChart stacked
  - **Materials**: WearStatsPanel + MaterialPanel side by side
  - **Upload**: Full upload panel
- **Dynamic import** RobotViewer with `ssr: false` (Three.js can't server-render)
- Joint selection state shared between viewer and wear stats panel

#### 4.4 `components/RobotViewer.tsx`
Three.js 3D scene using `@react-three/fiber` Canvas and `@react-three/drei`:
- **JointSphere**: Visible sphere (radius 0.09–0.12) with wear-based emissive color. Invisible larger hit zone (1.8× radius) for easier clicking. `useFrame` for hover scale animation and severe joint pulse glow. On click → show tooltip via `<Html>` with: joint name, status badge, wear index bar, anomaly rate, signal energy.
- **Link**: Cylinder between consecutive joints, color blended from both joint colors.
- **EndEffector**: Small gripper fingers at the last joint.
- **RobotArm**: Assembly of joints, links, end effector, base platform with lime accent ring.
- **Scene**: Dark background (#08080c), fog, ambient + directional + point lights (lime-tinted), `<Grid>`, `<OrbitControls>` with pan/orbit/damping, `<Environment preset="city">`.
- **Overlays**: Legend (Healthy/Moderate/Severe indicators), hint text ("Select joint to inspect · Drag to orbit · Right-click to pan").
- Canvas with `position: absolute; inset: 0` for reliable sizing.

#### 4.5 `components/UploadPanel.tsx`
- Hero section with floating wrench icon and descriptive text
- Drag-and-drop zone with dashed lime border, file picker trigger
- On file upload: call `uploadDataset()` API, then `runAnalysis()`, then `getResults()` + `getRobotModel()`
- Loading state: spinner with progress bar
- "Run Demo Analysis" button: lime gradient, shimmer animation, calls `runAnalysis(useDefault=true)`
- Error message display

#### 4.6 `components/WearStatsPanel.tsx`
- Header: "Joint Wear Analysis" with TrendingUp icon, critical count badge, average wear label
- Scrollable list of joint cards sorted by wear (highest first)
- Each card: status icon (Shield/AlertTriangle/XCircle), joint name, wear percentage, gradient progress bar colored by status
- Selected card expands to show anomaly rate and signal energy
- `flex-1 min-h-0` for 50-50 split with MaterialPanel

#### 4.7 `components/MaterialPanel.tsx`
- Header: "Material Recommendations" with Layers icon, candidate count
- Scrollable list of material cards
- Top recommendation highlighted with lime border and Award icon
- Each card: material name, wear reduction percentage, progress bar, properties (hardness, friction coefficient, wear coefficient)
- `flex-1 min-h-0` for 50-50 split with WearStatsPanel

#### 4.8 `components/SensorTimeline.tsx`
Recharts `ComposedChart`:
- Area + Line for magnetometer magnitude (lime colored, gradient fill)
- ReferenceDot markers for anomaly points (red)
- **X-axis zoom slider** (20–500%): Adjusts X domain centered on data midpoint. Lime-styled range input.
- **Y-axis zoom slider** (20–200%): Adjusts Y domain centered on data range.
- Both sliders use the `.chart-zoom` CSS class for lime thumb styling.

#### 4.9 `components/SimulationChart.tsx`
Recharts `LineChart` with two modes (tab switcher):
- **By Joint**: All joint wear trajectories, selected joint emphasized (thicker line), others dashed. Reference lines at 30% (green) and 70% (red) thresholds. Colors: base=#84cc16, shoulder=#a3e635, elbow=#65a30d, wrist_1=#bef264, wrist_2=#4d7c0f, wrist_3=#d9f99d.
- **Material Impact**: Material comparison lines for selected joint. Current Material in red dashed, alternatives in green/cyan/lime.
- **X-axis zoom slider** (20–500%): Domain clamped to ≥0.
- **Y-axis zoom slider** (10–100%): Controls Y max.

#### 4.10 `components/ExportPanel.tsx`
Two export buttons:
- **Export CSV**: Generates CSV with joint wear data, material recommendations, and full simulation trajectories.
- **Export PDF Report** (using `jspdf`): Print-friendly white background with:
  - Dark header bar with "ROBOFIX" branding and lime accent line
  - Summary cards (total joints, avg wear, critical count, materials evaluated)
  - Joint Wear Analysis table with green header, alternating rows, color-coded status
  - Material Recommendations table with green header, top recommendation highlighted
  - Three programmatically-drawn charts with axis labels, grid lines, tick values, and legends:
    1. Sensor Magnetometer Timeline (with anomaly dots)
    2. Wear Projection by Joint (all 6 joints)
    3. Material Wear Comparison
  - Page footer with branding and page numbers

#### 4.11 `lib/api.ts`
TypeScript interfaces mirroring all backend schemas. Four API functions:
- `uploadDataset(file: File)` → POST `/api/upload_dataset`
- `runAnalysis(useDefault = false)` → POST `/api/run_analysis`
- `getResults()` → GET `/api/results`
- `getRobotModel()` → GET `/api/robot_model`

#### 4.12 `lib/utils.ts`
- `cn(...inputs)` — Tailwind class merge using `clsx`
- `statusColor(status)` — Returns Tailwind text color class per status
- `statusBg(status)` — Returns Tailwind bg color class per status

---

### 5. DEPLOYMENT

#### 5.1 Backend Dockerfile (`deployment/Dockerfile`)
- Python 3.12-slim, non-root `robofix` user
- Install from `requirements.txt`
- Copy `backend/`, `pipeline/`, `utils/`, `data/`
- Run with gunicorn + uvicorn workers: `gunicorn backend.main:app -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --workers 2 --timeout 120`
- HEALTHCHECK on `/health`

#### 5.2 Frontend Dockerfile (`frontend/Dockerfile`)
- Node 22-alpine, multi-stage (deps → builder → runner)
- Next.js `standalone` output mode
- Non-root `nextjs` user
- HEALTHCHECK on port 3000
- `NEXT_PUBLIC_API_URL` env var for backend URL

#### 5.3 docker-compose.yml
- `backend` service: build from `deployment/Dockerfile`, port 8000, healthcheck
- `frontend` service: build from `frontend/Dockerfile`, port 3000, depends_on backend (service_healthy), `NEXT_PUBLIC_API_URL=http://backend:8000`
- Named volume `upload_data` for persistence

#### 5.4 vercel.json
- Rewrites `/api/:path*` to `${NEXT_PUBLIC_API_URL}/api/:path*`
- Security headers: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin

---

### 6. DATA FILES

#### 6.1 `data/robot_sensor_data.csv`
~15,120 rows of industrial robot IMU data with columns: `name`, `time`, `accX`, `accY`, `accZ`, `gyroX`, `gyroY`, `gyroZ`, `magX`, `magY`, `magZ`. Source: Kaggle robotic arm sensor dataset. The pipeline handles single-sensor data by splitting into 6 synthetic joints.

#### 6.2 `data/materials.csv`
15 engineering materials with columns: `material_name`, `hardness` (HV), `wear_coefficient`, `density` (g/cm³), `friction_coefficient`. Examples: Tungsten Carbide (1600 HV), Diamond-Like Carbon (3000 HV), UHMWPE (65 HV), Zirconia Ceramic (1200 HV), etc.

---

### 7. KEY REQUIREMENTS

1. The backend must work with Python 3.9+ (use `from __future__ import annotations` for union types).
2. The frontend must use Next.js App Router with `"use client"` directives on all interactive components.
3. The 3D viewer must be dynamically imported with `ssr: false` to avoid hydration mismatches.
4. Add `suppressHydrationWarning` on the `<body>` element.
5. All chart zoom sliders must use the same lime-green styled range inputs.
6. The WearStatsPanel and MaterialPanel must split their container 50-50 using `flex-1 min-h-0`.
7. The PDF export must use a print-friendly white background with dark text — NOT the dark UI theme.
8. Charts in the PDF must be drawn programmatically via jsPDF line drawing, not via html2canvas screenshot — this ensures all charts are included regardless of which UI tab is active.
9. The entire dashboard must be scrollable so all sections (viewer, stats, charts, export) are accessible.
10. The sidebar navigation must show hover tooltips and disable views that require analysis results when none are available.

---

### 8. DEPENDENCIES

**Backend** (`requirements.txt`):
```
fastapi>=0.100.0
uvicorn[standard]>=0.23.0
gunicorn>=21.2.0
pandas>=2.0.0
numpy>=1.24.0
scikit-learn>=1.3.0
scipy>=1.11.0
python-multipart>=0.0.6
```

**Frontend** (`package.json` dependencies):
```json
{
  "next": "^15.3.0",
  "react": "^19.1.0",
  "react-dom": "^19.1.0",
  "@react-three/fiber": "^9.1.0",
  "@react-three/drei": "^10.0.0",
  "three": "^0.175.0",
  "recharts": "^2.15.0",
  "lucide-react": "^0.500.0",
  "clsx": "^2.1.0",
  "jspdf": "latest",
  "html2canvas": "latest"
}
```

**Dev dependencies**: TypeScript 5.8+, @types/three, @types/react, Tailwind CSS 4 with @tailwindcss/postcss, eslint-config-next.

---

Build the entire project following this specification. Start with the backend and ML pipeline, then the frontend, then deployment configs. Ensure everything works end-to-end: upload CSV → run pipeline → view results on dashboard with 3D model → export PDF report.
