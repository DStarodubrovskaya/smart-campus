import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

class DatabaseService:
    """
    Data Access Layer (DAL)
    Responsible exclusively for the connection with the PostgreSQL database (Supabase).
    Contains no simulation business logic.
    """
    def __init__(self):
        # Load environment variables and connect to the database
        load_dotenv()
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            raise ValueError("❌ Error: DATABASE_URL not found in .env file")
        
        self.engine = create_engine(db_url)

    def get_valid_locations(self):
        """Retrieves a list of all available rooms from the database."""
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT b.code, r.room_number, r.id 
                FROM rooms r 
                JOIN buildings b ON r.building_id = b.id
            """))
            return [{"b_code": row[0], "room": row[1], "room_id": row[2]} for row in res]

    def get_all_users(self):
        """Loads all users and their corresponding Trust Scores."""
        users = {}
        with self.engine.connect() as conn:
            res = conn.execute(text("SELECT id, app_user_id, role, trust_score FROM users"))
            for row in res:
                users[row[1]] = {
                    "db_id": row[0],  # Internal database ID (number)
                    "id": row[1],     # String ID (e.g. 'U751')
                    "type": row[2],
                    "trust": float(row[3])
                }
        return users

    def update_user_trust(self, uid, trust_delta):
        """Updates the trust score by applying a delta, limited between 0.0 and 1.0."""
        with self.engine.connect() as conn:
            conn.execute(text("""
                UPDATE users 
                SET trust_score = GREATEST(0.0, LEAST(1.0, trust_score + :delta))
                WHERE id = :uid
            """), {"delta": trust_delta, "uid": uid})
            conn.commit()

    def update_room_status(self, room_id, status):
        """Records the new room status (State Machine logic)."""
        with self.engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO occupancy_status (room_id, status) 
                VALUES (:rid, :stat)
                ON CONFLICT (room_id) DO UPDATE 
                SET status = :stat, last_updated = CURRENT_TIMESTAMP
            """), {"rid": room_id, "stat": status})
            conn.commit()

    def check_schedule_status(self, b_code, room, current_sem, db_day, check_time_str):
        """Checks the official schedule to verify if a class is currently taking place."""
        query = text("""
            SELECT 1 FROM schedule_events se
            JOIN rooms r ON se.room_id = r.id
            JOIN buildings b ON r.building_id = b.id
            WHERE b.code = :bcode AND r.room_number = :rnum
            AND se.semester LIKE :sem AND se.day_of_week = :day
            AND :ctime BETWEEN se.start_time AND se.end_time
            LIMIT 1
        """)
        
        with self.engine.connect() as conn:
            res = conn.execute(query, {
                "bcode": str(b_code), 
                "rnum": str(room),
                "sem": f"%{current_sem}%", 
                "day": db_day, 
                "ctime": check_time_str
            }).fetchone()
            
            return "BUSY" if res else "FREE"
        
    # New methods for report history

    def add_report_to_history(self, user_db_id, room_db_id, status, trust):
        """Saves raw report to the database."""
        with self.engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO report_history (user_id, room_id, reported_status, trust_at_report)
                VALUES (:uid, :rid, :stat, :trust)
            """), {"uid": user_db_id, "rid": room_db_id, "stat": status, "trust": trust})
            conn.commit()

   
    def get_pending_reports(self, room_db_id):
        """
        Takes all accumulated reports from the room, 
        ignoring those older than 15 minutes (Time-To-Live).
        """
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT user_id, reported_status, trust_at_report 
                FROM report_history 
                WHERE room_id = :rid 
                AND created_at >= NOW() - INTERVAL '15 minutes'
                ORDER BY created_at ASC
            """), {"rid": room_db_id})
            return [{"user_id": r[0], "status": r[1], "trust": r[2]} for r in res]

    def clear_room_history(self, room_db_id):
        """Cleans up history after consensus is reached or deprecation occurs."""
        with self.engine.connect() as conn:
            conn.execute(text("DELETE FROM report_history WHERE room_id = :rid"), {"rid": room_db_id})
            conn.commit()
    
    def reset_simulation_state(self, scenario_csv_path):
        """
        Clears dynamic data and loads users from the selected scenario.
        Does not affect buildings, rooms, or schedules.
        """
        import csv
        
        with self.engine.begin() as conn: # Using .begin() for the transaction
            # 1. Delete all old reports and current room statuses
            conn.execute(text("TRUNCATE TABLE report_history CASCADE"))
            conn.execute(text("TRUNCATE TABLE occupancy_status CASCADE"))
            
            # 2. Removing old users
            conn.execute(text("TRUNCATE TABLE users CASCADE"))
            
            # 3. Loading new users from the selected CSV
            try:
                with open(scenario_csv_path, mode='r', encoding='utf-8') as file:
                    reader = csv.DictReader(file)
                    for row in reader:
                        conn.execute(text("""
                            INSERT INTO users (app_user_id, role, trust_score) 
                            VALUES (:app_user_id, :role, :trust_score)
                        """), {
                            "app_user_id": row['app_user_id'],
                            "role": row['role'],
                            "trust_score": float(row['trust_score'])
                        })
            except Exception as e:
                print(f"❌ Error loading script {scenario_csv_path}: {e}")
                raise e