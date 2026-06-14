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
            res = conn.execute(text("SELECT id, app_user_id, role, trust_score, tier FROM users WHERE app_user_id LIKE 'U%'"))
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
        
    def update_report_message(self, report_id, message):
        """Saves the logic engine's thought process directly into the report."""
        with self.engine.begin() as conn:
            conn.execute(text("""
                UPDATE report_history 
                SET engine_message = :msg 
                WHERE id = :id
            """), {"msg": message, "id": report_id})

    def add_report_to_history(self, user_db_id, room_db_id, status, trust):
        """Saves raw report to the database and returns its ID."""
        with self.engine.begin() as conn:
            res = conn.execute(text("""
                INSERT INTO report_history (user_id, room_id, reported_status, trust_at_report)
                VALUES (:uid, :rid, :stat, :trust)
                RETURNING id
            """), {"uid": user_db_id, "rid": room_db_id, "stat": status, "trust": trust})
            return res.fetchone()[0]

   
    def get_pending_reports(self, room_db_id):
        """Only takes ACTIVE reports to calculate consensus."""
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT rh.user_id, u.app_user_id, rh.reported_status, rh.trust_at_report 
                FROM report_history rh
                JOIN users u ON rh.user_id = u.id
                WHERE rh.room_id = :rid 
                AND rh.is_active = TRUE 
                AND rh.created_at >= NOW() - INTERVAL '15 minutes'
                ORDER BY rh.created_at ASC
            """), {"rid": room_db_id})
            return [{"user_id": r[0], "app_user_id": r[1], "status": r[2], "trust": r[3]} for r in res]

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
            
            #2. ONE request to clear the database (not real users' history)
            conn.execute(text("""
                DELETE FROM users WHERE app_user_id LIKE 'U%';
                TRUNCATE TABLE occupancy_status CASCADE;
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
        
    def clear_all_history(self):
        """Completely clears the report history and room statuses (clear button for admins)."""
        with self.engine.begin() as conn:
            conn.execute(text("""
                TRUNCATE TABLE report_history CASCADE;
                ALTER SEQUENCE report_history_id_seq RESTART WITH 1;
                TRUNCATE TABLE occupancy_status CASCADE;
                ALTER SEQUENCE occupancy_status_id_seq RESTART WITH 1;
            """))
        
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
                    ) as status,
                    r.id
                FROM rooms r
                JOIN buildings b ON r.building_id = b.id
                LEFT JOIN occupancy_status os ON r.id = os.room_id AND os.last_updated >= NOW() - INTERVAL '60 minutes'
            """))
            return [
                {
                    "id": row[3],
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
                       b.code as building,
                       r.room_number, 
                       rh.reported_status,
                       rh.trust_at_report,
                       rh.engine_message
                FROM report_history rh
                JOIN users u ON rh.user_id = u.id
                JOIN rooms r ON rh.room_id = r.id
                JOIN buildings b ON r.building_id = b.id
                ORDER BY rh.created_at DESC
                LIMIT 50
            """))
            
            logs = []
            for row in res:
                status = row[5]
                log_type = "success" if status == "FREE" else ("warning" if status == "BUSY" else "info")
                logs.append({
                    "id": str(row[0]),
                    "timestamp": row[1],
                    "agent_id": row[2],
                    "building": str(row[3]),
                    "room": str(row[4]),
                    "status": status,
                    "trust": float(row[6]) if row[6] is not None else 0.50,
                    "message": str(row[7]) if row[7] else "Pending...", 
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

    def search_advanced_rooms(self, min_minutes: int, building_code: str):
        """
        Searches for available rooms based on building filters and the minimum time until the next class.
        """
        with self.engine.connect() as conn:
            # ================================================
            # ⚠️ ATTENTION: DEMO MODE
            # ================================================
            # Currently, the SQL query uses a hardcoded time ('10:00:00')
            # and day of the week (1 = Monday, semester 'א').
            #
            # To switch to PRODUCTION (real time), replace the following in the query:
            # 1. '10:00:00'::TIME -> :current_time
            # 2. day_of_week = 1 -> day_of_week = :current_day
            # And pass these values ​​to conn.execute() using datetime.now()
            # =============================================
            
            query = text("""
                WITH CurrentStatus AS (
                    -- 1. Find out which rooms are available RIGHT NOW (at 10:00)
                    SELECT r.id as room_id, r.room_number, b.code as building_number,
                    COALESCE(os.status, 
                        (SELECT CASE WHEN EXISTS (
                            SELECT 1 FROM schedule_events se 
                            WHERE se.room_id = r.id AND se.semester LIKE '%א%' AND se.day_of_week = 1 
                            AND '10:00:00'::TIME BETWEEN se.start_time AND se.end_time
                        ) THEN 'BUSY' ELSE 'FREE' END)
                    ) as current_status
                    FROM rooms r
                    JOIN buildings b ON r.building_id = b.id
                    LEFT JOIN occupancy_status os ON r.id = os.room_id AND os.last_updated >= NOW() - INTERVAL '60 minutes'
                ),
                NextClass AS (
                    -- 2. We are looking for the START TIME of the next pair for each room today
                    SELECT room_id, MIN(start_time) as next_start
                    FROM schedule_events
                    WHERE semester LIKE '%א%' AND day_of_week = 1 AND start_time > '10:00:00'::TIME
                    GROUP BY room_id
                )
                -- 3. Put it all together and calculate the difference in minutes
                SELECT cs.room_id, cs.building_number, cs.room_number, 
                       nc.next_start,
                       -- If there is no next pair, we consider the room free until the end of the day (22:00)
                       EXTRACT(EPOCH FROM (COALESCE(nc.next_start, '22:00:00'::TIME) - '10:00:00'::TIME))/60 as free_minutes_left
                FROM CurrentStatus cs
                LEFT JOIN NextClass nc ON cs.room_id = nc.room_id
                WHERE cs.current_status = 'FREE' 
                -- Filter 1: By time
                AND EXTRACT(EPOCH FROM (COALESCE(nc.next_start, '22:00:00'::TIME) - '10:00:00'::TIME))/60 >= :min_minutes
                -- Filter 2: By building (if 'הכל' is passed, we show all)
                AND (:building = 'הכל' OR cs.building_number = :building)
                ORDER BY free_minutes_left DESC
            """)
            
            res = conn.execute(query, {
                "min_minutes": min_minutes,
                "building": building_code
            })
            
            return [
                {
                    "room_id": str(row[0]),
                    "building_number": str(row[1]),
                    "room_number": str(row[2]),
                    "next_class_at": str(row[3]) if row[3] else "No more classes today",
                    "free_for_minutes": int(row[4])
                }
                for row in res
            ]
        
    def get_user_report_history(self, app_user_id: str):
        """Gets the report history of a specific user for display in the profile."""
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT 
                    b.code as building_number,
                    r.room_number,
                    rh.reported_status,
                    TO_CHAR(rh.created_at, 'DD/MM/YYYY HH24:MI') as formatted_date
                FROM report_history rh
                JOIN users u ON rh.user_id = u.id
                JOIN rooms r ON rh.room_id = r.id
                JOIN buildings b ON r.building_id = b.id
                WHERE u.app_user_id = :uid
                ORDER BY rh.created_at DESC
                LIMIT 50
            """), {"uid": app_user_id})
            
            return [
                {
                    "building_number": str(row[0]),
                    "room_number": str(row[1]),
                    "status": row[2],
                    "timestamp": row[3]
                }
                for row in res
            ]