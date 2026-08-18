import pickle
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score


from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

DATASET_FILE = BASE_DIR / "campus_history_3m.csv"
MODEL_FILE = BASE_DIR / "room_predictor.pkl"


def evaluate_baseline():
    """
    Compare the previously trained Random Forest model
    with a simple schedule-based baseline on the same test set.
    """

    # Load the synthetic historical dataset
    df = pd.read_csv(DATASET_FILE)

    # Load the previously trained model and encoders
    with open(MODEL_FILE, "rb") as f:
        artifact = pickle.load(f)

    model = artifact["model"]
    le_bnum = artifact["le_bnum"]
    le_bname = artifact["le_bname"]
    features = artifact["features"]

    # Apply the same feature encoding used during model training
    df["building_num_code"] = le_bnum.transform(
        df["building_number"].astype(str)
    )

    # Keep NaN values unchanged because they were included
    # in the original fitted LabelEncoder
    df["building_name_code"] = le_bname.transform(
        df["building_name"]
    )

    # Define model features and target
    X = df[features]
    y = (df["actual_status"] == "FREE").astype(int)

    # Recreate exactly the same 20% test set used during training
    _, X_test, _, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42
    )

    # Generate predictions using the existing trained model
    rf_predictions = model.predict(X_test)

    # Baseline rule:
    # scheduled class -> BUSY (0)
    # no scheduled class -> FREE (1)
    baseline_predictions = 1 - X_test["has_schedule_class"]

    # Calculate accuracy for both approaches
    rf_accuracy = accuracy_score(y_test, rf_predictions)
    baseline_accuracy = accuracy_score(y_test, baseline_predictions)

    difference = rf_accuracy - baseline_accuracy

    print("===== Baseline Comparison =====")
    print(f"Test set size: {len(y_test)}")
    print(f"Schedule Baseline Accuracy: {baseline_accuracy * 100:.2f}%")
    print(f"Random Forest Accuracy:     {rf_accuracy * 100:.2f}%")
    print(f"Difference:                 {difference * 100:.2f} percentage points")


if __name__ == "__main__":
    evaluate_baseline()