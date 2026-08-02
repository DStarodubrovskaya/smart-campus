import os
import csv
import random
import pandas as pd
import numpy as np

SCHEDULE_PATH = os.path.join("..", "data", "cleaned", "classroom_schedule_cleaned.csv")
OUTPUT_FILE = "campus_history_3m.csv"

def parse_hour(time_str):
    try:
        return int(str(time_str).split(':')[0])
    except:
        return np.nan

def generate_dataset():
    if not os.path.exists(SCHEDULE_PATH):
        raise FileNotFoundError(f"Schedule file not found at path: {SCHEDULE_PATH}\n"
                                f"Make sure you are running the script from the folder ml_forecasting!")
        
    print(f"Loading the actual schedule from: {SCHEDULE_PATH}")
    df = pd.read_csv(SCHEDULE_PATH)

    # Mapping days of the week Hebrew -> Number (0 = Sun ... 4 = Thu)
    day_map = {"א'": 0, "ב'": 1, "ג'": 2, "ד'": 3, "ה'": 4, "ו'": 5}
    df['day_num'] = df['Day'].map(day_map)
    df['start_hour'] = df['Time-start'].apply(parse_hour)
    df['end_hour'] = df['Time-end'].apply(parse_hour)

    # We get all real rooms of Bar-Ilan
    rooms_df = df[['Building_Number', 'Room', 'Building_Name']].drop_duplicates().reset_index(drop=True)
    print(f"Unique audiences found: {len(rooms_df)}")

    # Create a quick lookup set of the official schedule: (building_number, room, day_num, hour) -> True/False
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

    print(f"The schedule database contains information of {len(schedule_slots)} occupied slots.")
    print("We generate synthetic history in 40 academic days (~8 weeks)...")

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

    for day_idx in range(40):  # 40 weekdays
        day_of_week = day_idx % 5  # 0..4 (Sun..Thu)

        for _, room_row in rooms_df.iterrows():
            b_num = str(room_row['Building_Number'])
            room = str(room_row['Room'])
            b_name = str(room_row['Building_Name'])

            # We select 2 random hours (from 8 to 19) for each room on this day
            for hour in random.sample(range(8, 20), 2):
                has_schedule = 1 if (b_num, room, day_of_week, hour) in schedule_slots else 0

                # --- PROBABILITY LOGIC (GROUND TRUTH + PATTERNS) ---
                if has_schedule == 1:
                    # There is a lesson on schedule -> usually BUSY, but 15% chance of cancellation (FREE)
                    prob_free = 0.15
                    if day_of_week == 4 and hour >= 16:
                        prob_free = 0.35  # On Thursday evenings, lessons cancel more often
                else:
                    # No scheduled class -> usually FREE
                    # Depends on the building type (faculty)!
                    if b_name in ['הנדסה', 'סטודנטים', 'טבע']:
                        prob_free = 0.65 # Students often sit in the engineering/student center
                    elif b_name in ['חברה', 'מ.ישראל']:
                        prob_free = 0.75
                    else:
                        prob_free = 0.88  # At the law/humanities faculty, empty classrooms are free
                    # Rush hour (12:00-14:00): students looking for seats -> usually occupied
                    if 12 <= hour <= 14:
                        prob_free -= 0.15

                    # Thursday after 4:00 PM: The campus is empty
                    if day_of_week == 4 and hour >= 16:
                        prob_free = min(0.98, prob_free + 0.20)

                is_free = random.random() < prob_free
                actual_status = "FREE" if is_free else "BUSY"

                rows.append([
                    b_num, room, b_name, day_of_week, hour, has_schedule, actual_status
                ])

    with open(OUTPUT_FILE, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)

    print(f"Done! The '{OUTPUT_FILE}' dataset with {len(rows)} rows has been created.")

if __name__ == "__main__":
    generate_dataset()