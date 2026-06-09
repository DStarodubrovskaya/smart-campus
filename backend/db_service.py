import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import pandas as pd

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
            res = conn.execute(text("SELECT id, app_user_id, role, trust_score, tier FROM users"))
            for row in res:
                users[row[1]] = {
                    "db_id": row[0],  # Internal database ID (number)
                    "id": row[1],     # String ID (e.g. 'U751')
                    "type": row[2],
                    "trust": float(row[3]),
                    "tier": row[4]
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
        """Only takes ACTIVE reports to calculate consensus."""
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT user_id, reported_status, trust_at_report 
                FROM report_history 
                WHERE room_id = :rid 
                AND is_active = TRUE 
                AND created_at >= NOW() - INTERVAL '15 minutes'
                ORDER BY created_at ASC
            """), {"rid": room_db_id})
            return [{"user_id": r[0], "status": r[1], "trust": r[2]} for r in res]

    def clear_room_history(self, room_db_id):
        """Now we don't delete logs, we just turn them off for math."""
        with self.engine.connect() as conn:
            conn.execute(text("""
                UPDATE report_history 
                SET is_active = FALSE 
                WHERE room_id = :rid
            """), {"rid": room_db_id})
            conn.commit()
    
    def reset_simulation_state(self, scenario_file):
        """Complete reset of the simulation state (DB) and loading a new scenario."""
        
        #1: Read CSV and prepare dictionaries in advance
        df = pd.read_csv(scenario_file)
        users_to_insert = df.to_dict(orient='records')

        # Use begin() for an automatic transaction (everything will be done at once)
        with self.engine.begin() as conn:
            
            #2. ONE mega-request to clear the database (save 5 network hops!)
            conn.execute(text("""
                TRUNCATE TABLE report_history CASCADE;
                TRUNCATE TABLE occupancy_status CASCADE;
                TRUNCATE TABLE users CASCADE;
                ALTER SEQUENCE users_id_seq RESTART WITH 1;
                ALTER SEQUENCE report_history_id_seq RESTART WITH 1;
                ALTER SEQUENCE occupancy_status_id_seq RESTART WITH 1;
            """))

            #3. ONE request to load the entire crowd (Bulk Insert)
            conn.execute(
                text("""
                    INSERT INTO users (app_user_id, role, trust_score, tier, successful_reports, total_reports) 
                    VALUES (:app_user_id, :role, :trust_score, :tier, :successful_reports, :total_reports)
                    ON CONFLICT (app_user_id) DO UPDATE 
                    SET 
                        trust_score = EXCLUDED.trust_score,
                        tier = EXCLUDED.tier,
                        successful_reports = EXCLUDED.successful_reports,
                        total_reports = EXCLUDED.total_reports
                """),
                users_to_insert 
            )
        
    def get_current_rooms(self):
        """Gets current room statuses for the frontend with a fallback to the schedule."""
        with self.engine.connect() as conn:
            # For the simulation, we're hard-coding Monday 10:00, Semester A (as in main.py).
            # In production, the server's actual current time (CURRENT_TIMESTAMP) will be used here.
            res = conn.execute(text("""
                SELECT 
                    r.room_number, 
                    b.code, 
                    COALESCE(
                        os.status, 
                        (SELECT CASE WHEN EXISTS (
                            SELECT 1 FROM schedule_events se 
                            WHERE se.room_id = r.id 
                            AND se.semester LIKE '%א%' 
                            AND se.day_of_week = 1 
                            AND '10:00:00'::TIME BETWEEN se.start_time AND se.end_time
                        ) THEN 'BUSY' ELSE 'FREE' END)
                    ) as status
                FROM rooms r
                JOIN buildings b ON r.building_id = b.id
                LEFT JOIN occupancy_status os ON r.id = os.room_id
            """))
            return [
                {
                    "room_id": str(row[0]), 
                    "building_number": str(row[1]), 
                    "occupancy_status": row[2]
                } 
                for row in res
            ]

    def get_recent_logs(self):
        """Gets the latest logs for the terminal."""
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT rh.id, 
                       TO_CHAR(rh.created_at, 'HH24:MI:SS') as time_str, 
                       u.app_user_id, 
                       r.room_number, 
                       rh.reported_status
                FROM report_history rh
                JOIN users u ON rh.user_id = u.id
                JOIN rooms r ON rh.room_id = r.id
                ORDER BY rh.created_at DESC
                LIMIT 50
            """))
            
            logs = []
            for row in res:
                status = row[4]
                log_type = "success" if status == "FREE" else ("warning" if status == "BUSY" else "info")
                logs.append({
                    "id": str(row[0]),
                    "timestamp": row[1],
                    "agent_id": row[2],
                    "room_id": str(row[3]),
                    "action": f"reported {status}",
                    "type": log_type
                })
            return logs[::-1]
        
    def update_user_post_report(self, user_id, trust_delta):
        """Updates the user's rating after a report, increases counters, and automatically increases the user's tier if the conditions are met."""
        with self.engine.begin() as conn:
            # 1. We are updating the rating and overall report counter
            conn.execute(
                text("""
                    UPDATE users 
                    SET trust_score = GREATEST(0.0, LEAST(1.0, trust_score + :delta)),
                        total_reports = total_reports + 1
                    WHERE id = :uid
                """),
                {"delta": trust_delta, "uid": user_id}
            )

            # 2. If the report was correct (delta > 0)
            if trust_delta > 0:
                # Increase the success counter
                conn.execute(
                    text("UPDATE users SET successful_reports = successful_reports + 1 WHERE id = :uid"),
                    {"uid": user_id}
                )

                # Checking if it's time to level up
                user = conn.execute(
                    text("SELECT role, tier, successful_reports, trust_score FROM users WHERE id = :uid"),
                    {"uid": user_id}
                ).fetchone()

                if user:
                    u_role, u_tier, u_succ, u_trust = user
                    new_tier = u_tier

                    # Gamification logic
                    if u_role == "Student":
                        if u_tier == "Newbie" and u_succ >= 5:
                            new_tier = "Resident"
                        elif u_tier == "Resident" and u_succ >= 50 and float(u_trust) >= 0.75:
                            new_tier = "VIP"

                    # Save the new level if it has changed
                    if new_tier != u_tier:
                        conn.execute(
                            text("UPDATE users SET tier = :new_tier WHERE id = :uid"),
                            {"new_tier": new_tier, "uid": user_id}
                        )