import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import pandas as pd

class DatabaseService:
    """
    Data Access Layer (DAL)
    Abstracts direct PostgreSQL (Supabase) interactions via SQLAlchemy.
    Strictly isolates state persistence from consensus logic (TrustLogicEngine).
    """
    def __init__(self):
        load_dotenv()
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            raise ValueError("DATABASE_URL is missing in environment variables.")

        # Connection pooling is handled automatically by SQLAlchemy's create_engine
        self.engine = create_engine(db_url)
        # Session state: Cutoff ID for clearing terminal UI without dropping DB records
        self.last_cleared_id = 0  

    def get_valid_locations(self):
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT b.code, r.room_number, r.id 
                FROM rooms r 
                JOIN buildings b ON r.building_id = b.id
            """))
            return [{"b_code": row[0], "room": row[1], "room_id": row[2]} for row in res]

    def get_all_users(self):
        users = {}
        with self.engine.connect() as conn:
            res = conn.execute(text("SELECT id, app_user_id, role, trust_score, tier FROM users WHERE app_user_id LIKE 'U%'"))
            for row in res:
                users[row[1]] = {
                    "db_id": row[0],
                    "id": row[1],
                    "type": row[2],
                    "trust": float(row[3]),
                    "tier": row[4]
                }
        return users

    def update_user_trust(self, uid, trust_delta):
        """Applies trust delta with strict [0.0, 1.0] boundaries directly in SQL."""
        with self.engine.connect() as conn:
            conn.execute(text("""
                UPDATE users 
                SET trust_score = GREATEST(0.0, LEAST(1.0, trust_score + :delta))
                WHERE id = :uid
            """), {"delta": trust_delta, "uid": uid})
            conn.commit()

    def update_room_status(self, room_id, status):
            """Implements Upsert (Insert on Conflict Update) for room occupancy."""
            with self.engine.begin() as conn:
                conn.execute(text("""
                    INSERT INTO occupancy_status (room_id, status, last_updated) 
                    VALUES (:rid, :stat, CURRENT_TIMESTAMP)
                    ON CONFLICT (room_id) DO UPDATE 
                    SET status = :stat, last_updated = CURRENT_TIMESTAMP
                """), {"rid": room_id, "stat": status})

    def check_schedule_status(self, b_code, room, current_sem, db_day, check_time_str):
        """Cross-references real-time parameters with the static BIU schedule."""
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
        """Injects algorithmic consensus reasoning into the report log for UI Explainability."""
        with self.engine.begin() as conn:
            conn.execute(text("""
                UPDATE report_history 
                SET engine_message = :msg 
                WHERE id = :id
            """), {"msg": message, "id": report_id})

    def add_report_to_history(self, user_db_id, room_db_id, status, trust):
        with self.engine.begin() as conn:
            res = conn.execute(text("""
                INSERT INTO report_history (user_id, room_id, reported_status, trust_at_report)
                VALUES (:uid, :rid, :stat, :trust)
                RETURNING id
            """), {"uid": user_db_id, "rid": room_db_id, "stat": status, "trust": trust})
            return res.fetchone()[0]

   
    def get_pending_reports(self, room_db_id):
        """Fetches unresolved reports (TTL < 15 min) for the consensus engine."""
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
        """Soft-deletes reports by flag instead of dropping rows to preserve ML training data."""
        with self.engine.connect() as conn:
            conn.execute(text("""
                UPDATE report_history 
                SET is_active = FALSE 
                WHERE room_id = :rid
            """), {"rid": room_db_id})
            conn.commit()
    
    def reset_simulation_state(self, scenario_file):
        """
        Executes a bulk transactional reset. 
        Uses engine.begin() to ensure atomic execution (all or nothing) to avoid corrupted states.
        """
        df = pd.read_csv(scenario_file)
        users_to_insert = df.to_dict(orient='records')

        with self.engine.begin() as conn:
            conn.execute(text("""
                DELETE FROM users WHERE app_user_id LIKE 'U%';
                TRUNCATE TABLE occupancy_status CASCADE;
                ALTER SEQUENCE occupancy_status_id_seq RESTART WITH 1;
            """))

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
        """
        Hard reset: Completely clears report history and room statuses.
        Used by admins to wipe the database clean.
        """
        with self.engine.begin() as conn:
            conn.execute(text("""
                TRUNCATE TABLE report_history CASCADE;
                ALTER SEQUENCE report_history_id_seq RESTART WITH 1;
                TRUNCATE TABLE occupancy_status CASCADE;
                ALTER SEQUENCE occupancy_status_id_seq RESTART WITH 1;
            """))

    def clear_terminal_view(self):
        """Implements a non-destructive log clear by bumping the visibility cursor."""
        with self.engine.connect() as conn:
            res = conn.execute(text("SELECT COALESCE(MAX(id), 0) FROM report_history")).scalar()
            self.last_cleared_id = int(res)
        
    def get_current_rooms(self):
        """
        Generates the campus map state.
        Priority: Live crowdsourced data (TTL 60 min) > Static Schedule fallback.
        Note: Day/Time parameters are currently mocked for Demo purposes.
        """
        with self.engine.connect() as conn:
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
        min_id = getattr(self, "last_cleared_id", 0)

        with self.engine.connect() as conn:
            query = text("""
                SELECT 
                    rh.id,
                    u.app_user_id as agent_id,
                    rh.trust_at_report as trust,
                    b.code as building,
                    r.room_number as room,
                    rh.reported_status as status,
                    rh.engine_message as message,
                    TO_CHAR(rh.created_at + INTERVAL '3 hours', 'HH24:MI:SS') as time_str
                FROM report_history rh
                JOIN users u ON rh.user_id = u.id
                JOIN rooms r ON rh.room_id = r.id
                JOIN buildings b ON r.building_id = b.id
                WHERE rh.id > :min_id
                ORDER BY rh.id DESC
                LIMIT 30
            """)
            rows = conn.execute(query, {"min_id": min_id}).fetchall()
            
            logs = []
            for row in rows:
                status = str(row[5])
                log_type = "success" if status == "FREE" else ("warning" if status == "BUSY" else "info")
                logs.append({
                    "id": str(row[0]),
                    "agent_id": str(row[1]),       
                    "trust": float(row[2]) if row[2] is not None else 0.50, 
                    "building": str(row[3]),       
                    "room": str(row[4]),           
                    "status": status,             
                    "message": str(row[6]) if row[6] else "Pending...",     
                    "timestamp": str(row[7]),      
                    "type": log_type
                })
            return logs[::-1]
        
    def update_user_post_report(self, user_id, trust_delta):
        """Updates reputation metrics and handles automated Gamification tier progression."""
        with self.engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE users 
                    SET trust_score = GREATEST(0.0, LEAST(1.0, trust_score + :delta)),
                        total_reports = total_reports + 1
                    WHERE id = :uid
                """),
                {"delta": trust_delta, "uid": user_id}
            )

            if trust_delta >= 0:
                conn.execute(
                    text("UPDATE users SET successful_reports = successful_reports + 1 WHERE id = :uid"),
                    {"uid": user_id}
                )

                user = conn.execute(
                    text("SELECT role, tier, successful_reports, trust_score FROM users WHERE id = :uid"),
                    {"uid": user_id}
                ).fetchone()

                if user:
                    u_role, u_tier, u_succ, u_trust = user
                    new_tier = u_tier

                    if u_role == "Student":
                        if u_tier == "Newbie" and u_succ >= 5:
                            new_tier = "Resident"
                        elif u_tier == "Resident" and u_succ >= 50 and float(u_trust) >= 0.75:
                            new_tier = "VIP"

                    if new_tier != u_tier:
                        conn.execute(
                            text("UPDATE users SET tier = :new_tier WHERE id = :uid"),
                            {"new_tier": new_tier, "uid": user_id}
                        )

    def search_advanced_rooms(self, min_minutes: int, building_code: str):
        """
        Time-aware advanced search.
        Evaluates current room occupancy against the static schedule's next event delta.
        """
        with self.engine.connect() as conn:
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
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT 
                    b.code as building_number,
                    r.room_number,
                    rh.reported_status,
                    TO_CHAR(rh.created_at + INTERVAL '3 hours', 'DD/MM/YYYY HH24:MI') as formatted_date
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

    # --- ADMIN USER MANAGEMENT METHODS ---

    def get_all_users_list(self):
        """Admin dashboard aggregations. Joins user metrics with total report counts."""
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT 
                    u.app_user_id, 
                    u.role, 
                    u.trust_score, 
                    u.tier,
                    -- The actual number of user reports in the database
                    (SELECT COUNT(*) FROM report_history rh WHERE rh.user_id = u.id) as real_total_reports,
                    u.successful_reports,
                    TO_CHAR(u.created_at + INTERVAL '3 hours', 'DD/MM/YYYY HH24:MI') as formatted_date
                FROM users u
                ORDER BY u.created_at DESC
            """))
            
            return [{
                "app_user_id": row[0],
                "role": row[1],
                "trust_score": float(row[2]),
                "tier": row[3],
                "successful_reports": row[5],
                "total_reports": int(row[4]), 
                "created_at": str(row[6]) if row[6] else "N/A"
            } for row in res]

    def update_user_admin(self, app_user_id, trust_score, tier):
        with self.engine.begin() as conn:
            conn.execute(text("""
                UPDATE users
                SET trust_score = :trust, tier = :tier
                WHERE app_user_id = :uid
            """), {"trust": trust_score, "tier": tier, "uid": app_user_id})

    def delete_user(self, app_user_id):
        with self.engine.begin() as conn:
            conn.execute(text("DELETE FROM users WHERE app_user_id = :uid"), {"uid": app_user_id})