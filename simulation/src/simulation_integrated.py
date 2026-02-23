import time
import random
import csv
import os
import sys
from datetime import datetime, timedelta

# --- CONFIGURATION & PATHS ---

# 1. Get an indicator of where THIS script is located
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

# 2. Move up 2 levels to the root of the project
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))

# Добавляем корень в sys.path, чтобы Python нашел папку backend
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

from backend.db_service import DatabaseService

# 3. Determine data folders
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
SIMULATED_DIR = os.path.join(DATA_DIR, "simulated")

# 4. Check and create a folder for output files if it doesn't exist.
os.makedirs(SIMULATED_DIR, exist_ok=True)

# 5. File paths
TRUST_LOG_FILE = os.path.join(SIMULATED_DIR, "trust_history.csv")

# ------------------------------------------------------------------

# Logic settings
CONSENSUS_THRESHOLD = 3
TRUST_REWARD = 0.02
TRUST_PENALTY = 0.05
SEMESTER_SWITCH_MONTH = 3
SEMESTER_SWITCH_DAY = 12

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

# --- 1. CONNECTING TO DATABASE ---
print(f"{Colors.BOLD}Connecting to DB via Data Access Layer...{Colors.RESET}")
try:
    db = DatabaseService()
    valid_locations = db.get_valid_locations()
    print(f"Loaded {len(valid_locations)} unique locations from DB.")
except Exception as e:
    print(f"{Colors.RED}Error connecting to DB: {e}{Colors.RESET}")
    exit()

DAY_MAP = {0: "ב'", 1: "ג'", 2: "ד'", 3: "ה'", 4: "ו'", 5: "SAT", 6: "א'"}
PYTHON_TO_DB_DAY = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 6: 6}

# --- 2. TIME & MODE FUNCTIONS ---
def get_sim_mode():
    print("\n" + "="*50)
    print(" SELECT SIMULATION MODE")
    print("="*50)
    print("1. REAL TIME (Current System Time)")
    print("2. RANDOM (Test: Random Workdays)")
    choice = input("\nEnter 1 or 2: ").strip()
    return "REAL" if choice == "1" else "RANDOM"

def generate_random_time():
    start_date = datetime(2026, 1, 1)
    random_days = random.randint(0, 150)
    base_date = start_date + timedelta(days=random_days)
    if base_date.weekday() == 5: base_date += timedelta(days=2)
    hour = random.randint(8, 19)
    minute = random.choice([0, 15, 30, 45])
    return base_date.replace(hour=hour, minute=minute, second=0)

def get_semester_by_date(date_obj):
    if (date_obj.month > SEMESTER_SWITCH_MONTH) or \
       (date_obj.month == SEMESTER_SWITCH_MONTH and date_obj.day >= SEMESTER_SWITCH_DAY):
        return "ב'"
    return "א'"

# --- 3. MANAGERS ---
class UserManager:
    def __init__(self, size=30):
        self.users = {}
        self.load_users(size)
        self._init_log_file()

    def load_users(self, size):
        # Теперь грузим пользователей напрямую из БД, а не из CSV
        self.users = db.get_all_users()
        print(f"Loaded {len(self.users)} users from Database.")

    def _init_log_file(self):
        if not os.path.isfile(TRUST_LOG_FILE):
            try:
                with open(TRUST_LOG_FILE, mode='w', newline='', encoding='utf-8') as f:
                    writer = csv.writer(f)
                    writer.writerow(['Timestamp', 'User_ID', 'Action', 'Delta', 'New_Trust_Level'])
            except IOError as e:
                print(f"Log Init Error: {e}")

    def log_trust_change(self, uid, action, delta, new_trust):
        try:
            with open(TRUST_LOG_FILE, mode='a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                writer.writerow([timestamp, uid, action, delta, new_trust])
        except Exception as e:
            print(f"Logging Error: {e}")

    def get_random_user(self):
        uid = random.choice(list(self.users.keys()))
        return self.users[uid]

    def update_trust(self, uid, delta):
        if uid not in self.users: return 0.0
        
        old = self.users[uid]['trust']
        new = max(0.0, min(1.0, old + delta))
        self.users[uid]['trust'] = round(new, 3)
        
        action_type = "REWARD" if delta > 0 else "PENALTY"
        self.log_trust_change(uid, action_type, delta, new)
        
        # Обновляем траст пользователя прямо в облачной БД
        db.update_user_trust(uid, new)
        
        return f"{old:.2f}->{new:.2f}"

class RoomManager:
    def __init__(self):
        self.active_reports = {}

    def add_report(self, b_id, room, status, user, sim_time):
        key = (b_id, room)
        
        # 1. Previous status (Consensus or Schedule)
        existing_consensus, _ = self.check_consensus(key, context_status=None) 
        if existing_consensus:
            prev_status = existing_consensus
        else:
            prev_status = get_real_schedule_status(b_id, room, sim_time)

        vip_override = False

        # 2. Add Report
        if user['trust'] > 0.9:
            # VIP Logic
            self.active_reports[key] = [{"status": status, "uid": user['id']}] * CONSENSUS_THRESHOLD
            vip_override = True
        else:
            # Standard Logic
            if key not in self.active_reports:
                self.active_reports[key] = []
            
            # Add a new report
            self.active_reports[key].append({"status": status, "uid": user['id']})
            # Limit the history size
            self.active_reports[key] = self.active_reports[key][-5:] 

        # 3. Check Consensus
        new_consensus, contributors = self.check_consensus(key, prev_status)

        return new_consensus, contributors, vip_override, prev_status

    def check_consensus(self, key, context_status=None):
        if key not in self.active_reports:
            return None, []
        
        reports = self.active_reports[key]
        if not reports: return None, []

        last_report = reports[-1]
        last_status = last_report['status']

        if context_status == "FREE" and last_status == "BUSY":
            required_threshold = 1
        else:
            required_threshold = CONSENSUS_THRESHOLD

        if len(reports) < required_threshold:
            return None, []

        recent = reports[-required_threshold:]
        statuses = [r['status'] for r in recent]

        if all(s == statuses[0] for s in statuses):
            contributor_ids = list(set([r['uid'] for r in recent]))
            return statuses[0], contributor_ids
            
        return None, []

# --- 4. SCHEDULE CHECKER ---
def get_real_schedule_status(b_id, room, check_datetime):
    if check_datetime.weekday() == 5: return "CLOSED"
    
    db_day = PYTHON_TO_DB_DAY.get(check_datetime.weekday())
    current_sem = get_semester_by_date(check_datetime)
    check_time_str = check_datetime.strftime("%H:%M:%S")
    
    # Теперь мы не фильтруем Pandas, а отправляем прямой запрос в БД
    return db.check_schedule_status(b_id, room, current_sem, db_day, check_time_str)

# --- 5. RUN SIMULATION ---
def run_simulation():
    user_mgr = UserManager()
    room_mgr = RoomManager()
    sim_mode = get_sim_mode()

    header = (
        f"{'DATE':<6} {'TIME':<6} {'DAY':<3} | "
        f"{'UID':<5} {'TYPE':<4} {'TRUST':<5} | "
        f"{'BLD-ROOM':<12} | "
        f"{'RPT':<5} | "
        f"{'PREV':<5} -> {'CURR':<5} | "
        f"{'EVENT DESCRIPTION'}"
    )
    print("-" * 155)
    print(header)
    print("-" * 155)

    try:
        while True:
            # 1. Time Logic
            if sim_mode == "REAL":
                sim_time = datetime.now()
                if sim_time.weekday() == 5: 
                    print(f"\r{Colors.CYAN} >>> SHABBAT: University Closed. Waiting... <<<{Colors.RESET}", end="")
                    time.sleep(5)
                    continue
                time.sleep(1.0)
            else:
                sim_time = generate_random_time()
                time.sleep(0.2) 

            date_str = sim_time.strftime("%d/%m")
            time_str = sim_time.strftime("%H:%M")
            day_str = DAY_MAP.get(sim_time.weekday(), "?")

            # 2. User Action
            loc_data = random.choice(valid_locations)
            b_id = loc_data["b_code"]
            room = loc_data["room"]
            room_id = loc_data["room_id"]
            
            user = user_mgr.get_random_user()
            real_status = get_real_schedule_status(b_id, room, sim_time)

            if random.random() < user['trust']:
                reported_status = real_status 
            else:
                reported_status = "FREE" if real_status == "BUSY" else "BUSY"

            # 3. Process Report
            new_consensus, contributors, is_vip, prev_status = room_mgr.add_report(b_id, room, reported_status, user, sim_time)
            curr_status_str = new_consensus if new_consensus else "PEND"

            # 4. Messages & Rewards Logic
            event_msg = ""
            
            # STATE MACHINE DB UPDATE: Пишем в БД только если статус реально изменился
            if prev_status != curr_status_str and curr_status_str != "PEND":
                 db.update_room_status(room_id, curr_status_str)
                 change_indicator = f"{Colors.BOLD}CHANGE (Saved to DB){Colors.RESET}"
            else:
                 change_indicator = ""

            if new_consensus:
                if is_vip:
                    event_msg = f"{Colors.YELLOW}👑 VIP OVERRIDE (Forced {new_consensus}). No reward.{Colors.RESET} {change_indicator}"
                elif reported_status == new_consensus:
                    if len(contributors) >= CONSENSUS_THRESHOLD:
                        rewarded_users_str = []
                        for contrib_uid in contributors:
                            delta_str = user_mgr.update_trust(contrib_uid, TRUST_REWARD)
                            rewarded_users_str.append(f"{contrib_uid}({delta_str})")
                        rewards_log = ", ".join(rewarded_users_str)
                        event_msg = f"{Colors.GREEN}✅ CROWD CONSENSUS! Rewards: {rewards_log}{Colors.RESET} {change_indicator}"
                    elif len(contributors) == 1 and new_consensus == "BUSY":
                        event_msg = f"{Colors.GREEN}📌 BOOKED. Status updated. No reward until verified.{Colors.RESET} {change_indicator}"
                    else:
                        event_msg = f"{Colors.BLUE}ℹ️ Verified existing. Waiting for crowd reward.{Colors.RESET}"
                else:
                    trust_delta = user_mgr.update_trust(user['id'], -TRUST_PENALTY)
                    event_msg = f"{Colors.RED}⚠️ CONFLICT with crowd! Penalized ({trust_delta}){Colors.RESET}"
            else:
                event_msg = "Waiting for consensus..."

            # 5. Formatting & Print
            def color_stat(s):
                if s == "BUSY": return f"{Colors.RED}{s:<5}{Colors.RESET}"
                if s == "FREE": return f"{Colors.GREEN}{s:<5}{Colors.RESET}"
                if s == "UNK":  return f"{Colors.CYAN}{s:<5}{Colors.RESET}"
                return f"{s:<5}" 

            row_str = (
                f"{date_str:<6} {time_str:<6} {day_str:<3} | "
                f"{user['id']:<5} {user['type']:<4} {user['trust']:<5.2f} | "
                f"{str(b_id)+'-'+str(room):<12} | "
                f"{color_stat(reported_status)} | "
                f"{color_stat(prev_status)} -> {color_stat(curr_status_str)} | "
                f"{event_msg}"
            )
            print(row_str)

    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Simulation stopped.{Colors.RESET}")

if __name__ == "__main__":
    run_simulation()