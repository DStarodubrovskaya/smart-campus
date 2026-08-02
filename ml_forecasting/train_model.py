import os
import pickle
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

DATASET_FILE = "campus_history_3m.csv"
MODEL_FILE = "room_predictor.pkl"
IMG_IMPORTANCE = "feature_importance.png"
IMG_CONFUSION = "confusion_matrix.png"

def train():
    # 1. Verify that the dataset file exists
    if not os.path.exists(DATASET_FILE):
        raise FileNotFoundError(f"Could not find '{DATASET_FILE}'. Please run generate_ml_dataset.py first.")

    print(f"Loading dataset from '{DATASET_FILE}'...")
    df = pd.read_csv(DATASET_FILE)

    # 2. Encode categorical string variables into numerical labels
    le_bnum = LabelEncoder()
    df['building_num_code'] = le_bnum.fit_transform(df['building_number'].astype(str))

    le_bname = LabelEncoder()
    df['building_name_code'] = le_bname.fit_transform(df['building_name'].astype(str))

    # 3. Define model features and target label
    features = ['day_of_week', 'hour', 'has_schedule_class', 'building_num_code', 'building_name_code']
    X = df[features]
    y = (df['actual_status'] == 'FREE').astype(int)  # 1 = FREE, 0 = BUSY

    # 4. Split data into training (80%) and testing/evaluation (20%) sets
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    print("Training Random Forest Classifier...")
    clf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
    clf.fit(X_train, y_train)

    # 5. Evaluate accuracy on the unseen test set
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nModel Accuracy (Test Set): {acc * 100:.2f}%")

    print("\nFeature Importances:")
    importances = pd.Series(clf.feature_importances_, index=features).sort_values(ascending=False)
    for feat, imp in importances.items():
        print(f"  - {feat}: {imp * 100:.2f}%")

    # 6. Plot 1: Feature importance bar chart
    plt.figure(figsize=(8, 5))
    sns.set_style("whitegrid")
    
    ax = sns.barplot(x=importances.values * 100, y=importances.index, palette="viridis")
    plt.title("Random Forest: Feature Importance (%)", fontsize=14, fontweight="bold", pad=15)
    plt.xlabel("Importance Weight (%)", fontsize=12)
    plt.ylabel("Model Features", fontsize=12)

    # Display percentage values next to each horizontal bar
    for p in ax.patches:
        width = p.get_width()
        ax.text(width + 1.5, p.get_y() + p.get_height() / 2.,
                f"{width:.1f}%",
                ha="left", va="center", fontsize=10, fontweight="bold")

    plt.xlim(0, 100)
    plt.tight_layout()
    plt.savefig(IMG_IMPORTANCE, dpi=300)
    plt.close()
    print(f"Feature importance chart saved as '{IMG_IMPORTANCE}'")

    # 7. Plot 2: Confusion matrix heatmap
    cm = confusion_matrix(y_test, y_pred)
    plt.figure(figsize=(6, 5))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", cbar=False,
                xticklabels=["BUSY (0)", "FREE (1)"],
                yticklabels=["BUSY (0)", "FREE (1)"],
                annot_kws={"size": 14, "weight": "bold"})
    
    plt.title("Confusion Matrix (Test Set: 20%)", fontsize=14, fontweight="bold", pad=15)
    plt.xlabel("Predicted Status", fontsize=12)
    plt.ylabel("Actual Status (Ground Truth)", fontsize=12)
    plt.tight_layout()
    plt.savefig(IMG_CONFUSION, dpi=300)
    plt.close()
    print(f"Confusion matrix chart saved as '{IMG_CONFUSION}'")

    # 8. Save model artifact (.pkl)
    model_artifact = {
        "model": clf,
        "le_bnum": le_bnum,
        "le_bname": le_bname,
        "features": features
    }
    with open(MODEL_FILE, "wb") as f:
        pickle.dump(model_artifact, f)

    print(f"\nModel artifact successfully saved as '{MODEL_FILE}'!")

if __name__ == "__main__":
    train()