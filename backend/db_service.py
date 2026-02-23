import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

class DatabaseService:
    """
    Data Access Layer (DAL)
    Отвечает исключительно за связь с базой данных PostgreSQL (Supabase).
    Никакой бизнес-логики симуляции здесь нет.
    """
    def __init__(self):
        # Загружаем переменные окружения и подключаемся к БД
        load_dotenv()
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            raise ValueError("❌ Error: DATABASE_URL not found in .env file")
        
        self.engine = create_engine(db_url)

    def get_valid_locations(self):
        """Забирает список всех доступных комнат из базы"""
        with self.engine.connect() as conn:
            res = conn.execute(text("""
                SELECT b.code, r.room_number, r.id 
                FROM rooms r 
                JOIN buildings b ON r.building_id = b.id
            """))
            return [{"b_code": row[0], "room": row[1], "room_id": row[2]} for row in res]

    def get_all_users(self):
        """Загружает всех пользователей и их Trust Score"""
        users = {}
        with self.engine.connect() as conn:
            res = conn.execute(text("SELECT app_user_id, role, trust_score FROM users"))
            for row in res:
                users[row[0]] = {
                    "id": row[0],
                    "type": row[1],
                    "trust": float(row[2])
                }
        return users

    def update_user_trust(self, uid, new_trust):
        """Обновляет рейтинг доверия конкретного пользователя"""
        with self.engine.connect() as conn:
            conn.execute(text("""
                UPDATE users SET trust_score = :new_trust WHERE app_user_id = :uid
            """), {"new_trust": new_trust, "uid": uid})
            conn.commit()

    def update_room_status(self, room_id, status):
        """Записывает новый статус комнаты (State Machine)"""
        with self.engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO occupancy_status (room_id, status) 
                VALUES (:rid, :stat)
                ON CONFLICT (room_id) DO UPDATE 
                SET status = :stat, last_updated = CURRENT_TIMESTAMP
            """), {"rid": room_id, "stat": status})
            conn.commit()

    def check_schedule_status(self, b_code, room, current_sem, db_day, check_time_str):
        """Проверяет по официальному расписанию, идет ли сейчас пара"""
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