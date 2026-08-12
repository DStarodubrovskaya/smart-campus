import os
import csv
import random
import pandas as pd
import numpy as np

SCHEDULE_PATH = os.path.join("..", "data", "cleaned", "classroom_schedule_cleaned.csv")
OUTPUT_FILE = "campus_history_3m.csv"

def parse_hour(time_str):
    """Extracts the starting hour as an integer for time-series feature engineering."""
    try:
        return int(str(time_str).split(':')[0])
    except:
        return np.nan

def generate_dataset():
    """
    Synthetic Data Generator for ML Pipeline.
    Simulates ~8 weeks of historical occupancy data by combining the official BIU schedule 
    with probabilistic behavioral patterns (e.g., rush hours, faculty-specific demand).
    This dataset serves as the Ground Truth for training the Random Forest Classifier.
    """
    if not os.path.exists(SCHEDULE_PATH):
        raise FileNotFoundError(f"Schedule file not found at: {SCHEDULE_PATH}")
        
    print(f"Loading Ground Truth schedule from: {SCHEDULE_PATH}")
    df = pd.read_csv(SCHEDULE_PATH)

    # Feature Engineering: Map categorical Hebrew days to numerical representations
    day_map = {"א'": 0, "ב'": 1, "ג'": 2, "ד'": 3, "ה'": 4, "ו'": 5}
    df['day_num'] = df['Day'].map(day_map)
    df['start_hour'] = df['Time-start'].apply(parse_hour)
    df['end_hour'] = df['Time-end'].apply(parse_hour)

    # Extract unique geospatial entities (Rooms)
    rooms_df = df[['Building_Number', 'Room', 'Building_Name']].drop_duplicates().reset_index(drop=True)
    print(f"Unique audiences found: {len(rooms_df)}")

    # Create an optimized O(1) lookup structure for scheduled classes
    schedule_slots = set()
    for _, row in df.iterrows():
        b_num = str(row['Building_Number'])
        room = str(row['Room'])
        day_num = row['day_num']
        s_hr = row['start_hour']
        e_hr = row['end_hour']

        if pd.notna(s_hr) and pd.notna(e_hr):
            for hr in range(int(s_hr), int(e_hr)):
                schedule_slots.add((b_num, room, day_num, hr))

    print(f"Indexed {len(schedule_slots)} official schedule slots.")
    print("Simulating behavioral history across 40 academic days (~8 weeks)...")

    rows = []
    headers = [
        "building_number",
        "room",
        "building_name",
        "day_of_week",
        "hour",
        "has_schedule_class",
        "actual_status"
    ]

    # Generate synthetic observations
    for day_idx in range(40): 
        day_of_week = day_idx % 5  # Map to Sun(0) - Thu(4)

        for _, room_row in rooms_df.iterrows():
            b_num = str(room_row['Building_Number'])
            room = str(room_row['Room'])
            b_name = str(room_row['Building_Name'])

            # Randomly sample 2 temporal snapshots per room, per day
            for hour in random.sample(range(8, 20), 2):
                has_schedule = 1 if (b_num, room, day_of_week, hour) in schedule_slots else 0

                # --- PROBABILISTIC NOISE INJECTION ---
                # We inject variance so the ML model learns underlying patterns rather than just memorizing the schedule

                if has_schedule == 1:
                    # Baseline: Scheduled classes are usually BUSY
                    prob_free = 0.15 # 15% cancellation rate
                    if day_of_week == 4 and hour >= 16:
                        prob_free = 0.35  # Higher cancellation variance on Thursday evenings
                else:
                    # Baseline: No scheduled class -> Usually FREE, modified by faculty-specific demand
                    if b_name in ['הנדסה', 'סטודנטים', 'טבע']:
                        prob_free = 0.65 # High demand areas (Engineering/Student centers)
                    elif b_name in ['חברה', 'מ.ישראל']:
                        prob_free = 0.75 # Medium demand areas
                    else:
                        prob_free = 0.88 # Low demand areas (Humanities/Law)

                    # Temporal Feature: Campus rush hour penalty
                    if 12 <= hour <= 14:
                        prob_free -= 0.15

                    # Temporal Feature: End-of-week campus exodus
                    if day_of_week == 4 and hour >= 16:
                        prob_free = min(0.98, prob_free + 0.20)

                # Resolve stochastic state
                is_free = random.random() < prob_free
                actual_status = "FREE" if is_free else "BUSY"

                rows.append([
                    b_num, room, b_name, day_of_week, hour, has_schedule, actual_status
                ])

    # Persist the training dataset
    with open(OUTPUT_FILE, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)

    print(f"Success! Training dataset '{OUTPUT_FILE}' generated with {len(rows)} observations.")

if __name__ == "__main__":
    generate_dataset()