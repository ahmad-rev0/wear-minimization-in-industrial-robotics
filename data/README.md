# ROBOFIX — Data

## Included datasets

### robot_sensor_data.csv (primary)
Real tri-axial magnetometer + IMU data from an industrial robotic arm.
Source: Kaggle — hkayan/industrial-robotic-arm-imu-data-casper-1-and-2

Column mapping used by the pipeline:
| Raw column | Pipeline name |
|------------|---------------|
| name       | joint_id      |
| time       | timestamp     |
| magX       | mx            |
| magY       | my            |
| magZ       | mz            |

15,118 rows of sensor readings at ~20 Hz.

### materials.csv
Curated material properties for wear-reduction recommendations.
Columns: material_name, hardness (HV), wear_coefficient (Archard), density (g/cm³), friction_coefficient.

## Additional Kaggle datasets available locally
Located at D:\DataScienceLearnings\kagglehub\datasets\

- hkayan_industrial-robotic-arm-anomaly-detection (1.7M rows, anomaly labels)
- ziya07_edge-ai-industrial-robot-motion-dataset (multi-joint, 500 rows)
- sethpointaverage_high-entropy-alloys-properties (1,545 alloy compositions)
- mujtabamatin_dataset-for-machine-failure-detection (machine failure labels)
