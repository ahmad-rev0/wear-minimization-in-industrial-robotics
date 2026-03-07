"""Test uploading the problematic dataset directly to the backend."""
import requests
import time

csv_path = r"D:\DataScienceLearnings\kagglehub\datasets\zoya77_industrial-robot-sensor-and-vision-fusion-dataset\Industrial Robot Sensor and Vision Fusion Dataset.csv"
BASE = "http://localhost:8000/api"

# Test upload
print("Uploading dataset...")
t0 = time.time()
try:
    with open(csv_path, "rb") as f:
        resp = requests.post(
            f"{BASE}/upload_dataset",
            files={"file": ("Industrial Robot Sensor and Vision Fusion Dataset.csv", f, "text/csv")},
            timeout=120,
        )
    print(f"Upload: {resp.status_code} in {time.time()-t0:.1f}s")
    if resp.status_code != 200:
        print(f"Error: {resp.text[:500]}")
    else:
        data = resp.json()
        print(f"Filename: {data.get('filename')}")
        print(f"Rows: {data.get('rows')}")
        print(f"Columns: {len(data.get('columns', []))}")
except Exception as e:
    print(f"Upload FAILED: {type(e).__name__}: {e}")
    import traceback; traceback.print_exc()
    exit(1)

# Test run_analysis
print("\nStarting analysis...")
try:
    resp = requests.post(f"{BASE}/run_analysis", timeout=10)
    print(f"run_analysis: {resp.status_code} -> {resp.json()}")
except Exception as e:
    print(f"run_analysis FAILED: {e}")
    exit(1)

# Poll status
print("\nPolling status...")
for i in range(60):
    time.sleep(2)
    resp = requests.get(f"{BASE}/status")
    status = resp.json()
    print(f"  [{i*2}s] {status['status']}: {status.get('message', '')}")
    if status["status"] in ("done", "error"):
        break

if status["status"] == "done":
    print("\nFetching results...")
    resp = requests.get(f"{BASE}/results")
    print(f"Results: {resp.status_code}, size={len(resp.content)} bytes")
    if resp.status_code == 200:
        data = resp.json()
        print(f"Joints: {len(data.get('joints', []))}")
        print(f"Recs: {len(data.get('recommendations', []))}")
    else:
        print(f"Error: {resp.text[:500]}")
