# Machine Learning Forecasting

This directory contains the MLOps pipeline for predicting classroom availability. It handles everything from synthetic data generation to model training and artifact export for the backend API.

## Files & Assets

- **`generate_ml_dataset.py`**: Solves the "Cold Start" problem. Generates a synthetic historical dataset by layering probabilistic behavioral patterns (e.g., rush hours) over the static university schedule.
- **`campus_history_3m.csv`**: The generated dataset representing ~8 weeks of simulated campus activity.
- **`train_model.py`**: The training pipeline. Trains a Random Forest Classifier, evaluates its performance, generates metric visualizations, and packages the model.
- **`room_predictor.pkl`**: The serialized model artifact. Includes the trained classifier and the `LabelEncoders` required by the FastAPI backend to process new predictions.
- **`*.png`**: Auto-generated visualizations for model evaluation (Confusion Matrix and Feature Importance).

## Usage Pipeline

To rebuild the machine learning model from scratch, execute the scripts in the following order:

1. Generate the training data:
   ```bash
   python generate_ml_dataset.py
   ```
