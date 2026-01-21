import os
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load passwords from the .env file
load_dotenv()
DB_URL = os.getenv("DATABASE_URL") 

if not DB_URL:
    raise ValueError("❌ Error: DATABASE_URL not found in .env file")

# Connecting to PostgresSQL
engine = create_engine(DB_URL)

def run_seed():
    print("Let's start migrating data to PostgreSQL...")
    
    # File paths (relative to the script)
    base_path = os.path.dirname(os.path.abspath(__file__))
    csv_schedule = os.path.join(base_path, "../data/cleaned/classroom_schedule_cleaned.csv")
    csv_users = os.path.join(base_path, "../data/simulated/users_db.csv")
    sql_schema = os.path.join(base_path, "init_schema.sql")

    with engine.connect() as conn:
        # 1. Rolling out the table structure (SQL)
        print("Creating tables...")
        with open(sql_schema, "r", encoding="utf-8") as f:
            # We split it into commands, since sqlalchemy doesn't like to execute several commands at once.
            queries = f.read().split(";")
            for query in queries:
                if query.strip():
                    conn.execute(text(query))
        conn.commit()

        # 2. Loading Schedule
        print("Loading the schedule...")
        df = pd.read_csv(csv_schedule)
        
        # Caching dictionaries (to avoid making a million queries)
        buildings_map = {} # name -> id
        
        # Unique buildings
        unique_buildings = df[['Building_Name', 'Building_Number']].drop_duplicates()
        for _, row in unique_buildings.iterrows():
            # Insert and return ID
            result = conn.execute(text(
                "INSERT INTO buildings (name, code) VALUES (:name, :code) ON CONFLICT (name) DO UPDATE SET code=:code RETURNING id"
            ), {"name": row['Building_Name'], "code": row['Building_Number']})
            buildings_map[row['Building_Name']] = result.fetchone()[0]
            
        # Rooms and Events
        # (Simplified logic: we load everything at once)
        day_map = {"ב'": 1, "ג'": 2, "ד'": 3, "ה'": 4, "ו'": 5, "א'": 6}
        
        for _, row in df.iterrows():
            b_id = buildings_map[row['Building_Name']]
            
            # Create/find a room
            res_room = conn.execute(text(
                "INSERT INTO rooms (building_id, room_number) VALUES (:bid, :rnum) ON CONFLICT (building_id, room_number) DO UPDATE SET room_number=:rnum RETURNING id"
            ), {"bid": b_id, "rnum": str(row['Room'])})
            r_id = res_room.fetchone()[0]
            
            # Insert a lesson
            conn.execute(text("""
                INSERT INTO schedule_events (room_id, course_name, semester, day_of_week, start_time, end_time)
                VALUES (:rid, :course, :sem, :day, :start, :end)
            """), {
                "rid": r_id,
                "course": row['Course'],
                "sem": row['Semester'],
                "day": day_map.get(row['Day'], 0),
                "start": row['Time-start'],
                "end": row['Time-end']
            })
            
        # 3. Loading Users
        print("Loading Users...")
        if os.path.exists(csv_users):
            df_u = pd.read_csv(csv_users)
            
            role_mapper = {
                "Stu": "Student",
                "Lec": "Lecturer"
            }

            for _, row in df_u.iterrows():
                # Translate 'Stu' -> 'Student'
                clean_role = role_mapper.get(row['type'], row['type']) 
                
                conn.execute(text("""
                    INSERT INTO users (app_user_id, role, trust_score)
                    VALUES (:uid, :role, :trust)
                    ON CONFLICT (app_user_id) DO NOTHING
                """), {
                    "uid": row['id'], 
                    "role": clean_role,  
                    "trust": row['trust']
                })
        
        conn.commit()
        print("✅ All done! Data in the cloud.")

if __name__ == "__main__":
    run_seed()