# ROBOTWIN

**AI-powered predictive maintenance and wear optimization for industrial robots.**

Analyzes robot sensor datasets, detects anomalous joints, estimates wear,
recommends improved materials, and visualizes results on a 3D robot model.

---

## Architecture

```
Backend   →  FastAPI (Python)
ML Pipeline →  pandas · numpy · scikit-learn · scipy
Frontend  →  Next.js · TailwindCSS · shadcn/ui · Three.js
```

## Project Structure

```
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── api/routes.py            # REST endpoints
│   ├── services/
│   │   ├── pipeline_service.py  # orchestrates ML pipeline
│   │   └── visualization_service.py
│   └── models/schemas.py        # Pydantic models
│
├── pipeline/
│   ├── feature_engineering.py   # magnetometer feature extraction
│   ├── anomaly_detection.py     # Isolation Forest
│   ├── wear_model.py            # Archard-inspired wear index
│   ├── material_recommender.py  # rank materials by wear reduction
│   └── wear_simulation.py       # future wear projection
│
├── frontend/                    # Next.js dashboard (Step 8)
│
├── data/
│   ├── robot_sensor_data.csv    # real IMU magnetometer data (15 K rows)
│   └── materials.csv            # 15 industrial materials
│
├── utils/
│   └── windowing.py             # sliding window helpers
│
└── deployment/
    ├── Dockerfile
    └── requirements.txt
```

## Quick Start

### Backend

```bash
pip install -r deployment/requirements.txt
uvicorn backend.main:app --reload
```

### Frontend (after Step 8)

```bash
cd frontend
npm install
npm run dev
```

## API Endpoints

| Method | Path               | Description                        |
|--------|--------------------|------------------------------------|
| POST   | /api/upload_dataset | Upload robot sensor CSV            |
| POST   | /api/run_analysis   | Trigger full ML pipeline           |
| GET    | /api/results        | Retrieve latest analysis results   |
| GET    | /api/robot_model    | Joint positions + wear for viewer  |
| GET    | /health             | Health check                       |

## ML Pipeline

1. **Feature extraction** — magnitude, jerk, rolling std, FFT energy, entropy
2. **Anomaly detection** — Isolation Forest flags degraded readings
3. **Wear model** — `wear_rate ≈ anomaly_rate × signal_energy` (Archard-inspired)
4. **Material ranking** — `adjusted_wear = wear_rate × material_coefficient`
5. **Simulation** — `future_wear = current_wear + wear_rate × Δt`

## Data Sources

- **Sensor data**: Kaggle — hkayan/industrial-robotic-arm-imu-data (real magnetometer)
- **Materials**: curated industrial material properties (hardness, wear coeff, friction)

## Development Order

1. ✅ Project structure
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
