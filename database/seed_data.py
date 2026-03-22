import os
import time
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load database credentials from the .env file
load_dotenv()
DB_URL = os.getenv("DATABASE_URL") 

if not DB_URL:
    raise ValueError("❌ Error: DATABASE_URL not found in .env file")

# Establish connection to PostgreSQL
engine = create_engine(DB_URL)

def run_seed():
    start_time = time.time()
    print("Let's start migrating data to PostgreSQL...")
    
    # Define file paths (relative to the script location)
    base_path = os.path.dirname(os.path.abspath(__file__))
    csv_schedule = os.path.join(base_path, "../data/cleaned/classroom_schedule_cleaned.csv")
    csv_users = os.path.join(base_path, "../data/simulated/users_db.csv")
    sql_schema = os.path.join(base_path, "init_schema.sql")

    with engine.connect() as conn:
        # 1. Initialize table structures
        print("[1/4] Dropping and creating tables...")
        with open(sql_schema, "r", encoding="utf-8") as f:
            queries = f.read().split(";")
            for query in queries:
                if query.strip():
                    conn.execute(text(query))
        conn.commit()

        # 2. Load and process schedule data
        print(f"[2/4] Reading CSV schedule...")
        df = pd.read_csv(csv_schedule)
        
        print("   -> Inserting buildings...")
        unique_buildings = df[['Building_Name', 'Building_Number']].drop_duplicates()
        buildings_map = {}
        for _, row in unique_buildings.iterrows():
            result = conn.execute(text(
                "INSERT INTO buildings (name, code) VALUES (:name, :code) ON CONFLICT (name) DO UPDATE SET code=:code RETURNING id"
            ), {"name": row['Building_Name'], "code": str(row['Building_Number'])})
            buildings_map[row['Building_Name']] = result.fetchone()[0]
        conn.commit()

        # 3. Process rooms and corresponding events
        print("[3/4] Processing rooms and schedule events...")
        
        print("   -> Inserting rooms...")
        unique_rooms = df[['Building_Name', 'Room']].drop_duplicates()
        for _, row in unique_rooms.iterrows():
            conn.execute(text(
                "INSERT INTO rooms (building_id, room_number) VALUES (:bid, :rnum) ON CONFLICT DO NOTHING"
            ), {"bid": buildings_map[row['Building_Name']], "rnum": str(row['Room'])})
        conn.commit()
        
        print("   -> Fetching room IDs...")
        rooms_db = conn.execute(text("SELECT id, building_id, room_number FROM rooms")).fetchall()
        rooms_map = {(r[1], str(r[2])): r[0] for r in rooms_db}

        print("   -> Building events list in memory...")
        day_map = {"ב'": 1, "ג'": 2, "ד'": 3, "ה'": 4, "ו'": 5, "א'": 6}
        events_insert_data = []
        
        for _, row in df.iterrows():
            b_id = buildings_map[row['Building_Name']]
            r_id = rooms_map.get((b_id, str(row['Room'])))
            
            if r_id:
                events_insert_data.append({
                    "rid": r_id,
                    "course": str(row['Course']),
                    "sem": str(row['Semester']),
                    "day": day_map.get(row['Day'], 0),
                    "start": str(row['Time-start']),
                    "end": str(row['Time-end'])
                })
                
        print(f"   -> Starting massive explicit insert for {len(events_insert_data)} events...")
        chunk_size = 500
        total_events = len(events_insert_data)

        # "Bulletproof" chunking via explicit SQL string builder
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
            print(f"      ... загружено {min(i + chunk_size, total_events)} из {total_events} занятий")

        # 4. Load user data
        print("[4/4] Processing users...")
        if os.path.exists(csv_users):
            df_u = pd.read_csv(csv_users)
            role_mapper = {"Stu": "Student", "Lec": "Lecturer"}
            
            for _, row in df_u.iterrows():
                clean_role = role_mapper.get(row['type'], row['type'])
                conn.execute(text("""
                    INSERT INTO users (app_user_id, role, trust_score)
                    VALUES (:uid, :role, :trust)
                    ON CONFLICT (app_user_id) DO NOTHING
                """), {
                    "uid": str(row['id']), 
                    "role": clean_role,  
                    "trust": float(row['trust'])
                })
            conn.commit()
        
        elapsed = round(time.time() - start_time, 2)
        print(f"✅ All done! Database migrated in {elapsed} seconds.")

if __name__ == "__main__":
    run_seed()