# Machine Learning Forecasting

This directory contains the MLOps pipeline for predicting classroom availability. It handles everything from synthetic data generation to model training and artifact export for the backend API.

## Files & Assets

- **`generate_ml_dataset.py`**: Solves the "Cold Start" problem. Generates a synthetic historical dataset by layering probabilistic behavioral patterns (e.g., rush hours) over the static university schedule.
- **`campus_history_3m.csv`**: The generated dataset representing ~8 weeks of simulated campus activity.
- **`train_model.py`**: The training pipeline. Trains a Random Forest Classifier, evaluates its performance, generates metric visualizations, and packages the model.
- **`evaluate_baseline.py`**: Compares the saved Random Forest model with a simple schedule-based baseline on the same held-out test set, without retraining the model.
- **`room_predictor.pkl`**: The serialized model artifact. Includes the trained classifier and the `LabelEncoders` required by the FastAPI backend to process new predictions.
- **`*.png`**: Auto-generated visualizations for model evaluation (Confusion Matrix and Feature Importance).

## Usage Pipeline

To rebuild the machine learning model from scratch, execute the scripts in the following order:

1. Generate the training data:

   ```bash
   python generate_ml_dataset.py
   ```

2. Train and evaluate the Random Forest model:
   ```bash
   python train_model.py
   ```
3. Compare the saved model with the schedule-based baseline:
   ```bash
   python evaluate_baseline.py
   ```
   `evaluate_baseline.py` does not retrain the model. It loads room_predictor.pkl, recreates the same 20% held-out test split used during training (random_state=42), and compares the model with a simple baseline that predicts BUSY when an official class is scheduled and FREE otherwise.
