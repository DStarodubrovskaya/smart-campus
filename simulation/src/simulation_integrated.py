import sys
import os

# Add the project's root folder (smart-campus) to the Python search path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

import time
import random
from colorama import Fore, Style, init

# Import our custom services
from backend.db_service import DatabaseService
from logic_engine import TrustLogicEngine

# Initialize colorama for colored console output
init(autoreset=True)

# Configuration
SIMULATION_SPEED_SEC = 1.5

def run_simulation():
    print(f"{Fore.CYAN}🚀 Initializing Matrix (Trust Score 2.0)...{Style.RESET_ALL}")
    
    # Initialize DB and Logic Engine
    db = DatabaseService()
    logic_engine = TrustLogicEngine(db)

    # Load initial data from DB
    users_dict = db.get_all_users()
    users = list(users_dict.values())
    locations = db.get_valid_locations()

    if not users or not locations:
        print("❌ Error: No users or locations found in the database. Please run seed_data.py first.")
        return

    print(f"✅ Users loaded: {len(users)}")
    print(f"✅ Locations loaded: {len(locations)}")
    print("-" * 60)
    print("Simulation started. Press Ctrl+C to stop.")

    try:
        while True:
            # 1. Select a random user and a random room
            user = random.choice(users)
            room = random.choice(locations)
            
            # Simulate checking the schedule to get the "actual" status 
            # (In a real app, this comes from check_schedule_status)
            actual_status = random.choice(["FREE", "BUSY"])
            
            # 2. Simulate user honesty based on their Trust Score
            is_honest = random.random() < user['trust']
            if is_honest:
                reported_status = actual_status
                action_color = Fore.GREEN
            else:
                # User lies or makes a mistake
                reported_status = "BUSY" if actual_status == "FREE" else "FREE"
                action_color = Fore.RED

            # Current official room status (defaulting to FREE for simulation context)
            current_room_status = "FREE" 

            # 3. SEND REPORT TO THE LOGIC ENGINE (The "Brain")
            result = logic_engine.process_report(
                user_db_id=user['db_id'], 
                user_trust=user['trust'],
                room_db_id=room['room_id'],
                reported_status=reported_status,
                current_room_status=current_room_status
            )

            # 4. PROCESS THE ENGINE'S DECISION
            
            # Если статус комнаты изменился — обновляем в БД
            if result["new_status"] != current_room_status:
                db.update_room_status(room['room_id'], result["new_status"])
                current_room_status = result["new_status"]

            # Раздаем штрафы/награды и собираем красивую строку для лога
            trust_log_parts = []
            for db_uid, trust_delta in result["trust_updates"].items():
                db.update_user_trust(db_uid, trust_delta)
                
                # Ищем строковый ID юзера для вывода на экран и обновляем его локальный рейтинг
                str_id = "Unknown"
                for u in users:
                    if u['db_id'] == db_uid:
                        u['trust'] = max(0.0, min(1.0, u['trust'] + trust_delta))
                        str_id = u['id']
                        break
                
                # Формируем цветную строчку изменения рейтинга
                if trust_delta > 0:
                    trust_log_parts.append(f"{str_id} ({Fore.GREEN}+{trust_delta}{Style.RESET_ALL})")
                else:
                    trust_log_parts.append(f"{str_id} ({Fore.RED}{trust_delta}{Style.RESET_ALL})")

            # 5. FORMATTED CONSOLE LOGGING
            user_str = f"User {user['id']:<5} (Tr: {user['trust']:.2f})"
            room_str = f"Room {room['b_code']}-{room['room']}"
            report_str = f"[{reported_status}]"
            
            # Красим статус репорта
            stat_color = Fore.MAGENTA if reported_status == "BUSY" else Fore.BLUE
            
            # Готовим сообщение от "Мозга"
            event_msg = result['event_msg']
            if trust_log_parts:
                # Если были изменения рейтинга, приклеиваем их к сообщению
                event_msg += f" | {Fore.CYAN}Trust updates:{Style.RESET_ALL} " + ", ".join(trust_log_parts)
            
            # Финальный принт
            print(f"{user_str} | {room_str:<12} | {action_color}Reports: {stat_color}{report_str:<6}{Style.RESET_ALL} | 🧠 {Fore.YELLOW}{event_msg}{Style.RESET_ALL}")

            # Пауза перед следующим событием
            time.sleep(SIMULATION_SPEED_SEC)

    except KeyboardInterrupt:
        print(f"\n{Fore.CYAN}🛑 Simulation stopped by user.{Style.RESET_ALL}")

if __name__ == "__main__":
    run_simulation()