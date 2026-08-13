import sys
import os
import time
import random
from colorama import Fore, Style, init

# Absolute path resolution for module imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from backend.db_service import DatabaseService
from logic_engine import TrustLogicEngine

# Initialize terminal colors for log readability
init(autoreset=True)

# Simulation throttle to allow visual monitoring
SIMULATION_SPEED_SEC = 1.5

def run_simulation():
    """
    Standalone CLI Simulation Runner.
    Executes a continuous loop of randomized synthetic user reports against the TrustLogicEngine.
    Used exclusively as an integration testing tool to validate consensus thresholds, 
    gamification mechanics, and database interactions directly in the terminal, bypassing the HTTP layer.
    """
    print(f"{Fore.CYAN}🚀 Initializing Matrix (Trust Score CLI Debugger)...{Style.RESET_ALL}")
    
    db = DatabaseService()
    logic_engine = TrustLogicEngine(db)

    users_dict = db.get_all_users()
    users = list(users_dict.values())
    locations = db.get_valid_locations()

    if not users or not locations:
        print("Error: No users or locations found in the database. Please run seed_data.py first.")
        return

    print(f"Users loaded: {len(users)}")
    print(f"Locations loaded: {len(locations)}")
    print("-" * 60)
    print("Simulation started. Press Ctrl+C to stop.")

    try:
        while True:
            # 1. Select random entities for the test iteration
            user = random.choice(users)
            room = random.choice(locations)
            
            # 2. Stochastic Honesty Model
            actual_status = random.choice(["FREE", "BUSY"])
            is_honest = random.random() < user['trust']

            if is_honest:
                reported_status = actual_status
                action_color = Fore.GREEN
            else:
                # Inject logical errors/malice based on trust probability
                reported_status = "BUSY" if actual_status == "FREE" else "FREE"
                action_color = Fore.RED

            # Baseline default for CLI test context
            current_room_status = "FREE" 

            # 3. Feed the report into the Consensus Pipeline
            result = logic_engine.process_report(
                user_db_id=user['db_id'], 
                user_trust=user['trust'],
                user_tier=user.get('tier', 'Resident'),
                room_db_id=room['room_id'],
                reported_status=reported_status,
                current_room_status=current_room_status
            )

            # 4. State Persistence and Gamification Updates
            if result["new_status"] != current_room_status:
                db.update_room_status(room['room_id'], result["new_status"])
                current_room_status = result["new_status"]

            trust_log_parts = []
            for db_uid, trust_delta in result["trust_updates"].items():
                db.update_user_trust(db_uid, trust_delta)
                
                # Update local in-memory state for subsequent loop iterations
                str_id = "Unknown"
                for u in users:
                    if u['db_id'] == db_uid:
                        u['trust'] = max(0.0, min(1.0, u['trust'] + trust_delta))
                        str_id = u['id']
                        break
                
                if trust_delta > 0:
                    trust_log_parts.append(f"{str_id} ({Fore.GREEN}+{trust_delta}{Style.RESET_ALL})")
                else:
                    trust_log_parts.append(f"{str_id} ({Fore.RED}{trust_delta}{Style.RESET_ALL})")

            # 5. CLI Dashboard Formatting
            tier_char = user.get('tier', 'R')[0]
            user_str = f"User {user['id']:<5} [{tier_char}] (Tr: {user['trust']:.2f})"
            room_str = f"Room {room['b_code']}-{room['room']}"
            report_str = f"[{reported_status}]"
            
            stat_color = Fore.MAGENTA if reported_status == "BUSY" else Fore.BLUE
            
            event_msg = result['event_msg']
            if trust_log_parts:
                event_msg += f" | {Fore.CYAN}Trust updates:{Style.RESET_ALL} " + ", ".join(trust_log_parts)
            
            print(f"{user_str} | {room_str:<12} | {action_color}Reports: {stat_color}{report_str:<6}{Style.RESET_ALL} | 🧠 {Fore.YELLOW}{event_msg}{Style.RESET_ALL}")

            time.sleep(SIMULATION_SPEED_SEC)

    except KeyboardInterrupt:
        print(f"\n{Fore.CYAN}🛑 Simulation stopped by user.{Style.RESET_ALL}")

if __name__ == "__main__":
    run_simulation()