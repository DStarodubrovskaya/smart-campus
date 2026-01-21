import time
import random
import csv
import os
import pandas as pd
from datetime import datetime, timedelta

# --- CONFIGURATION & PATHS ---

# 1. Get an indicator of where THIS script is located
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

#2. Move up 2 levels to the root of the project
# simulation/src -> simulation -> smart-campus-space (ROOT)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))

# 3. Determine data folders
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
CLEANED_DIR = os.path.join(DATA_DIR, "cleaned")
SIMULATED_DIR = os.path.join(DATA_DIR, "simulated")

# 4. Check and create a folder for output files if it doesn't exist.
os.makedirs(SIMULATED_DIR, exist_ok=True)

# 5. File paths
SCHEDULE_FILE = os.path.join(CLEANED_DIR, "classroom_schedule_cleaned.csv")
USERS_FILE = os.path.join(SIMULATED_DIR, "users_db.csv")
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

# --- 1. LOADING SCHEDULE ---
print(f"{Colors.BOLD}Loading schedule...{Colors.RESET}")
try:
    if not os.path.exists(SCHEDULE_FILE):
         print(f"{Colors.YELLOW}Warning: {SCHEDULE_FILE} not found. Using empty data.{Colors.RESET}")
         valid_locations = [[101, "101"], [102, "Auditorium"]]
         schedule_df = pd.DataFrame(columns=['Building_Number', 'Room', 'Day', 'Semester', 'Time-start', 'Time-end'])
    else:
        schedule_df = pd.read_csv(SCHEDULE_FILE)
        valid_locations = schedule_df[['Building_Number', 'Room']].drop_duplicates().values.tolist()
        print(f"Loaded {len(valid_locations)} unique locations.")
except Exception as e:
    print(f"{Colors.RED}Error: {e}{Colors.RESET}")
    exit()

DAY_MAP = {0: "ב'", 1: "ג'", 2: "ד'", 3: "ה'", 4: "ו'", 5: "SAT", 6: "א'"}

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
        """Загружает пользователей из CSV или создает новых, если файла нет."""
        if os.path.exists(USERS_FILE):
            print(f"Loading users from {USERS_FILE}...")
            try:
                df = pd.read_csv(USERS_FILE)
                for _, row in df.iterrows():
                    self.users[str(row['id'])] = {
                        "id": str(row['id']),
                        "type": row['type'],
                        "trust": float(row['trust'])
                    }
                print(f"Loaded {len(self.users)} users.")
            except Exception as e:
                print(f"{Colors.RED}Error loading users: {e}{Colors.RESET}")
        else:
            print(f"Creating new user database ({size} users)...")
            for i in range(size):
                uid = f"U{random.randint(100, 999)}"
                while uid in self.users: # Uniqueness check
                     uid = f"U{random.randint(100, 999)}"
                     
                is_lecturer = random.random() < 0.2
                initial_trust = 0.95 if is_lecturer else round(random.uniform(0.5, 0.7), 2)
                
                self.users[uid] = {
                    "id": uid,
                    "type": "Lec" if is_lecturer else "Stu",
                    "trust": initial_trust
                }
            self.save_users() # Save immediately

    def save_users(self):
        """Перезаписывает CSV с актуальными данными."""
        try:
            # Convert dict to list of dicts
            data = list(self.users.values())
            df = pd.DataFrame(data)
            df.to_csv(USERS_FILE, index=False)
        except Exception as e:
            print(f"Error saving users: {e}")

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
        
        # Important: Save the database after each change
        self.save_users()
        
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
            # Limit the history size (store a little more than the threshold to remember recent ones)
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

        # Logic: Booking (FREE->BUSY) needs 1 person, Clearing (BUSY->FREE) needs 3
        if context_status == "FREE" and last_status == "BUSY":
            required_threshold = 1
        else:
            required_threshold = CONSENSUS_THRESHOLD

        if len(reports) < required_threshold:
            return None, []

        recent = reports[-required_threshold:]
        statuses = [r['status'] for r in recent]

        if all(s == statuses[0] for s in statuses):
            # Return unique IDs of consensus participants
            contributor_ids = list(set([r['uid'] for r in recent]))
            return statuses[0], contributor_ids
            
        return None, []

# --- 4. SCHEDULE CHECKER ---
def get_real_schedule_status(b_id, room, check_datetime):
    day_char = DAY_MAP.get(check_datetime.weekday())
    current_sem = get_semester_by_date(check_datetime)
    if day_char == "SAT": return "CLOSED"
    check_time = check_datetime.time()
    
    try:
        subset = schedule_df[
            (schedule_df['Building_Number'].astype(str) == str(b_id)) &
            (schedule_df['Room'] == room) &
            (schedule_df['Day'] == day_char) &
            (schedule_df['Semester'] == current_sem)
        ]
        for _, row in subset.iterrows():
            try:
                start = datetime.strptime(row['Time-start'].strip(), "%H:%M").time()
                end = datetime.strptime(row['Time-end'].strip(), "%H:%M").time()
                if start <= check_time < end: return "BUSY"
            except: continue
    except:
        return "FREE"
    return "FREE"

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
            b_id, room = random.choice(valid_locations)
            user = user_mgr.get_random_user()
            real_status = get_real_schedule_status(b_id, room, sim_time)

            # User decides to lie or tell truth
            if random.random() < user['trust']:
                reported_status = real_status 
            else:
                reported_status = "FREE" if real_status == "BUSY" else "BUSY"

            # 3. Process Report
            new_consensus, contributors, is_vip, prev_status = room_mgr.add_report(b_id, room, reported_status, user, sim_time)
            curr_status_str = new_consensus if new_consensus else "PEND"

            # 4. Messages & Rewards Logic
            event_msg = ""
            
            # Change Indicator
            if prev_status != curr_status_str and curr_status_str != "PEND":
                 change_indicator = f"{Colors.BOLD}CHANGE{Colors.RESET}"
            else:
                 change_indicator = ""

            if new_consensus:
                if is_vip:
                    # VIP Override (No trust change)
                    event_msg = f"{Colors.YELLOW}👑 VIP OVERRIDE (Forced {new_consensus}). No reward.{Colors.RESET}"
                
                elif reported_status == new_consensus:
                    # Agreement with Consensus
                    
                    # SCENARIO 1: FULL CONSENSUS (3+ people)
                    # Reward all participants (including those who were able to book early)
                    if len(contributors) >= CONSENSUS_THRESHOLD:
                        rewarded_users_str = []
                        for contrib_uid in contributors:
                            delta_str = user_mgr.update_trust(contrib_uid, TRUST_REWARD)
                            rewarded_users_str.append(f"{contrib_uid}({delta_str})")
                        
                        rewards_log = ", ".join(rewarded_users_str)
                        event_msg = f"{Colors.GREEN}✅ CROWD CONSENSUS! Rewards: {rewards_log}{Colors.RESET} {change_indicator}"
                    
                    # SCENARIO 2: QUICK BOOKING (1 person)
                    # Status changes, but NO reward
                    elif len(contributors) == 1 and new_consensus == "BUSY":
                        event_msg = f"{Colors.GREEN}📌 BOOKED. Status updated. No reward until verified.{Colors.RESET} {change_indicator}"
                    
                    # SCENARIO 3: INTERIM (2 people) or re-confirmation
                    else:
                        event_msg = f"{Colors.BLUE}ℹ️ Verified existing. Waiting for crowd reward.{Colors.RESET}"

                else:
                    # SCENARIO 4: CONFLICT / PUNISHMENT
                    # The user posted a status that contradicts the consensus   
                    trust_delta = user_mgr.update_trust(user['id'], -TRUST_PENALTY)
                    event_msg = f"{Colors.RED}⚠️ CONFLICT with crowd! Penalized ({trust_delta}){Colors.RESET}"
            else:
                # No consensus (PENDING)
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