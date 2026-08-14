import os
import time
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Initialize environment and database connection
load_dotenv()
DB_URL = os.getenv("DATABASE_URL") 

if not DB_URL:
    raise ValueError("DATABASE_URL is missing in environment variables.")

# Create SQLAlchemy engine with connection pooling
engine = create_engine(DB_URL)

def run_seed():
    """
    ETL (Extract, Transform, Load) Pipeline.
    Bootstraps the PostgreSQL database by parsing static CSV files 
    (scraped BIU schedule and initial user states) and populating relational tables.
    Designed to be idempotent (safe to run multiple times).
    """
    start_time = time.time()
    print("Starting database migration and seeding process...")
    
    # Resolve absolute paths to prevent execution context errors
    base_path = os.path.dirname(os.path.abspath(__file__))
    csv_schedule = os.path.join(base_path, "../data/cleaned/classroom_schedule_cleaned.csv")
    csv_users = os.path.join(base_path, "../data/simulated/users_db.csv")
    sql_schema = os.path.join(base_path, "init_schema.sql")

    with engine.connect() as conn:
        # --- STEP 1: SCHEMA INITIALIZATION ---
        print("[1/4] Executing init_schema.sql (Dropping and recreating tables)...")
        with open(sql_schema, "r", encoding="utf-8") as f:
            queries = f.read().split(";")
            for query in queries:
                if query.strip():
                    conn.execute(text(query))
        conn.commit()

        # --- STEP 2: BUILDINGS MIGRATION ---
        print(f"[2/4] Processing buildings from schedule CSV...")
        df = pd.read_csv(csv_schedule)
        
        unique_buildings = df[['Building_Name', 'Building_Number']].drop_duplicates()
        buildings_map = {}
        for _, row in unique_buildings.iterrows():
            # Fallback for missing building names to maintain data integrity
            b_name = "Неизвестно" if pd.isna(row['Building_Name']) else row['Building_Name']
            b_code = str(row['Building_Number'])

            # UPSERT logic: Insert new building or update existing name, return the primary key
            result = conn.execute(text(
                "INSERT INTO buildings (name, code) VALUES (:name, :code) ON CONFLICT (code) DO UPDATE SET name=:name RETURNING id"
            ), {"name": b_name, "code": b_code})

            # Map building code (e.g., "507") to internal DB integer ID
            buildings_map[b_code] = result.fetchone()[0]
        conn.commit()

        # --- STEP 3: ROOMS & SCHEDULE EVENTS MIGRATION ---
        print("[3/4] Processing rooms and schedule events...")

        # 3.a Populate Rooms
        unique_rooms = df[['Building_Number', 'Room']].drop_duplicates()
        for _, row in unique_rooms.iterrows():
            b_code = str(row['Building_Number'])
            conn.execute(text(
                "INSERT INTO rooms (building_id, room_number) VALUES (:bid, :rnum) ON CONFLICT DO NOTHING"
            ), {"bid": buildings_map[b_code], "rnum": str(row['Room'])})
        conn.commit()
        
        # Build an in-memory map of (building_id, room_number) -> room_id for fast event linking
        rooms_db = conn.execute(text("SELECT id, building_id, room_number FROM rooms")).fetchall()
        rooms_map = {(r[1], str(r[2])): r[0] for r in rooms_db}

        # 3.b Prepare Schedule Events
        # Mapping Hebrew day characters to integer representations for SQL indexing
        day_map = {"ב'": 1, "ג'": 2, "ד'": 3, "ה'": 4, "ו'": 5, "א'": 6}
        events_insert_data = []
        
        for _, row in df.iterrows():
            b_code = str(row['Building_Number'])
            r_id = rooms_map.get((buildings_map[b_code], str(row['Room'])))
            
            if r_id:
                events_insert_data.append({
                    "rid": r_id,
                    "course": str(row['Course']),
                    "sem": str(row['Semester']),
                    "day": day_map.get(row['Day'], 0),
                    "start": str(row['Time-start']),
                    "end": str(row['Time-end'])
                })

        # 3.c Bulk Insert Events (Chunked to prevent memory overload)       
        chunk_size = 500
        total_events = len(events_insert_data)

        for i in range(0, total_events, chunk_size):
            chunk = events_insert_data[i:i + chunk_size]
            values_list = []
            params = {}
            for j, event in enumerate(chunk):
                values_list.append(f"(:rid_{j}, :course_{j}, :sem_{j}, :day_{j}, :start_{j}, :end_{j})")
                params[f"rid_{j}"] = event["rid"]
                params[f"course_{j}"] = event["course"]
                params[f"sem_{j}"] = event["sem"]
                params[f"day_{j}"] = event["day"]
                params[f"start_{j}"] = event["start"]
                params[f"end_{j}"] = event["end"]

            query = f"""
                INSERT INTO schedule_events (room_id, course_name, semester, day_of_week, start_time, end_time)
                VALUES {','.join(values_list)}
            """
            conn.execute(text(query), params)
            conn.commit()
            print(f"      ... uploaded {min(i + chunk_size, total_events)} from {total_events} events")

        # --- STEP 4: USERS MIGRATION ---
        print("[4/4] Processing user accounts...")
        if os.path.exists(csv_users):
            df_u = pd.read_csv(csv_users)
            role_mapper = {"Stu": "Student", "Lec": "Lecturer"}
            
            for _, row in df_u.iterrows():
                clean_role = role_mapper.get(row['type'], row['type'])
                conn.execute(text("""
                    INSERT INTO users (app_user_id, role, trust_score, tier, successful_reports, total_reports)
                    VALUES (:uid, :role, :trust, :tier, :succ, :tot)
                    ON CONFLICT (app_user_id) DO NOTHING
                """), {
                    "uid": str(row['id']), 
                    "role": clean_role,  
                    "trust": float(row['trust']),
                    "tier": row.get('tier', 'Newbie'),
                    "succ": int(row.get('successful_reports', 0)),
                    "tot": int(row.get('total_reports', 0))
                })
            conn.commit()
        
        elapsed = round(time.time() - start_time, 2)
        print(f"Seeding Complete! Database migrated in {elapsed} seconds.")

if __name__ == "__main__":
    run_seed()