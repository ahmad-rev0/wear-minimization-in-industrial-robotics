# ROBOTWIN

**AI-powered predictive maintenance and wear optimization for industrial robots.**

Analyzes robot sensor datasets, detects anomalous joints, estimates wear,
recommends improved materials, and visualizes results on an interactive 3D model.

---

## Architecture

```
Backend    FastAPI + Gunicorn (Python 3.12)
ML Stack   pandas, numpy, scikit-learn, scipy
Frontend   Next.js 15, Tailwind CSS 4, Three.js, Recharts
Deploy     Docker / docker-compose / Vercel
```

## Project Structure

```
├── backend/
│   ├── main.py                   FastAPI entry point
│   ├── api/routes.py             REST endpoints
│   ├── models/schemas.py         Pydantic request / response models
│   └── services/
│       ├── pipeline_service.py   ML pipeline orchestrator
│       ├── visualization_service.py  3D model data builder
│       └── state.py              In-memory application state
│
├── pipeline/
│   ├── feature_engineering.py    Magnetometer feature extraction
│   ├── anomaly_detection.py      Isolation Forest per joint
│   ├── wear_model.py             Archard-inspired wear index
│   ├── material_recommender.py   Rank materials by wear reduction
│   └── wear_simulation.py        Non-linear wear projection
│
├── frontend/
│   ├── app/                      Next.js App Router pages
│   ├── components/               React + Three.js + Recharts
│   ├── lib/                      API client, utilities
│   ├── Dockerfile                Multi-stage production build
│   └── vercel.json               Vercel deployment config
│
├── data/
│   ├── robot_sensor_data.csv     Real IMU magnetometer data (15 K rows)
│   └── materials.csv             15 curated industrial materials
│
├── utils/
│   └── windowing.py              NumPy sliding window helpers
│
├── deployment/
│   ├── Dockerfile                Backend production image
│   └── requirements.txt          Python dependencies
│
├── docker-compose.yml            Full-stack one-command launch
└── .dockerignore
```

## Quick Start (Local Development)

### Prerequisites

- Python 3.10+
- Node.js 20+

### Backend

```bash
pip install -r deployment/requirements.txt
uvicorn backend.main:app --reload
```

Backend runs at **http://localhost:8000**. Interactive docs at `/docs`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000** and proxies `/api/*` to the backend.

## Docker Deployment

### Full Stack (recommended)

```bash
docker compose up --build
```

This builds both images and starts:
- Backend on **http://localhost:8000**
- Frontend on **http://localhost:3000**

The frontend container waits for the backend health check to pass before starting.

### Backend Only

```bash
docker build -f deployment/Dockerfile -t robotwin-backend .
docker run -p 8000:8000 robotwin-backend
```

### Frontend Only

```bash
cd frontend
docker build -t robotwin-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://your-backend:8000 robotwin-frontend
```

## Vercel Deployment (Frontend)

1. Push the `frontend/` directory to a Git repository.
2. Import the project in [Vercel](https://vercel.com).
3. Set the **Root Directory** to `frontend`.
4. Set environment variable `NEXT_PUBLIC_API_URL` to your deployed backend URL.
5. Edit `frontend/vercel.json` — replace the placeholder URL with your backend.
6. Deploy.

## API Endpoints

| Method | Path                | Description                          |
|--------|---------------------|--------------------------------------|
| POST   | `/api/upload_dataset` | Upload a robot sensor CSV           |
| POST   | `/api/run_analysis`   | Trigger the full ML pipeline        |
| GET    | `/api/results`        | Retrieve latest analysis results    |
| GET    | `/api/robot_model`    | Joint positions + wear for 3D view  |
| GET    | `/api/health`         | Health check with pipeline status   |
| GET    | `/health`             | Simple health check                 |

## ML Pipeline

1. **Feature extraction** — magnitude, jerk, rolling std, FFT energy, spectral entropy
2. **Anomaly detection** — Isolation Forest flags degraded readings per joint
3. **Wear model** — `wear_rate = anomaly_rate x signal_energy` (Archard-inspired), normalized to [0, 1]
4. **Material ranking** — `adjusted_wear = wear_rate x material_coefficient`, ranked by reduction %
5. **Simulation** — non-linear degradation: `wear(t+dt) = wear(t) + rate x (1 + 1.5 x wear(t)) x dt`

## Data Sources

- **Sensor data**: [Kaggle — hkayan/industrial-robotic-arm-imu-data](https://www.kaggle.com/datasets/hkayan/industrial-robotic-arm-imu-data) (real tri-axial magnetometer)
- **Materials**: curated industrial material properties (hardness, wear coefficient, density, friction)

## Environment Variables

| Variable             | Default                    | Description                     |
|----------------------|----------------------------|---------------------------------|
| `NEXT_PUBLIC_API_URL`| `http://localhost:8000`    | Backend URL for frontend proxy  |
| `LOG_LEVEL`          | `info`                     | Backend log verbosity           |

## Development Checklist

1. Project structure
2. Backend API skeleton
3. Feature extraction
4. Anomaly detection
5. Wear model
6. Material recommender
7. Wear simulation
8. Frontend viewer
9. Visualization integration
10. Deployment setup

## License

MIT
