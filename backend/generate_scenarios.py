import csv
import os
import random

# Establish absolute paths to ensure the script runs reliably from any execution context
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCENARIOS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data", "scenarios"))

os.makedirs(SCENARIOS_DIR, exist_ok=True)

def generate_users(filename, size, distribution):
    """
    Generates synthetic user datasets with predefined behavioral profiles.
    Used to seed the database for specific simulation stress-tests (e.g., Spam attacks, VIP overrides).
    """
    filepath = os.path.join(SCENARIOS_DIR, filename)
    with open(filepath, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        # Schema aligns with the 'users' table in Supabase
        writer.writerow(['app_user_id', 'role', 'trust_score', 'tier', 'successful_reports', 'total_reports'])
        
        for i in range(1, size + 1):
            uid = f"U{i:03d}"

            # Determine user behavioral group based on the requested scenario distribution
            group = random.choices(
                list(distribution.keys()), 
                weights=list(distribution.values())
            )[0]
            
            # Baseline defaults
            tier = "Resident"
            successful_reports = 0
            total_reports = 0

            # --- Profile generation logic ---
            # We inject historical report counts (successful/total) to ensure 
            # the Gamification engine and Admin Dashboard display realistic, pre-warmed metrics.

            if group == 'vip':
                trust = round(random.uniform(0.9, 1.0), 2)
                role = 'Lecturer'
                tier = 'VIP'
                successful_reports = random.randint(50, 150)
                total_reports = successful_reports + random.randint(0, 10)
                
            elif group == 'good':
                role = 'Student'
                # 20% chance to simulate new users subject to the Pioneer Rule limitations
                if random.random() < 0.20:
                    trust = 0.50
                    tier = 'Newbie'
                    successful_reports = random.randint(0, 4)
                    total_reports = successful_reports + random.randint(0, 3)
                else:
                    trust = round(random.uniform(0.6, 0.89), 2)
                    # Auto-leveling simulation for highly accurate students
                    if trust >= 0.75:
                        tier = 'VIP'
                        successful_reports = random.randint(50, 100)
                    else:
                        tier = 'Resident'
                        successful_reports = random.randint(5, 49)
                    total_reports = successful_reports + random.randint(5, 20)
                    
            elif group == 'troll':
                trust = round(random.uniform(0.2, 0.4), 2)
                role = 'Student'
                tier = 'Resident'
                successful_reports = random.randint(5, 30)
                total_reports = successful_reports + random.randint(20, 50) 
                
            elif group == 'shadowbanned':
                trust = round(random.uniform(0.0, 0.19), 2)
                role = 'Student'
                tier = 'Resident'
                successful_reports = random.randint(5, 20)
                total_reports = successful_reports + random.randint(50, 100) # A huge percentage of lies
            
            writer.writerow([uid, role, trust, tier, successful_reports, total_reports])
            
    print(f"Created: {filename} ({size} users)")

if __name__ == "__main__":
    print("Generating datasets for 100 users...\n")
    
    # Scenario 1: Control group for normal operational baseline
    generate_users("1_basic_flow.csv", 100, {'vip': 5, 'good': 95, 'troll': 0, 'shadowbanned': 0})
    
    # Scenario 2: Real-world noise to test consensus thresholds
    generate_users("2_conflict.csv", 100, {'vip': 5, 'good': 65, 'troll': 20, 'shadowbanned': 10})
    
    # Scenario 3: Stress-testing the Shadowban and penalty mechanisms
    generate_users("3_spam_attack.csv", 100, {'vip': 0, 'good': 20, 'troll': 40, 'shadowbanned': 40})
    
    # Scenario 4: Testing rapid resolution via VIP Override logic
    generate_users("4_vip_pass.csv", 100, {'vip': 40, 'good': 60, 'troll': 0, 'shadowbanned': 0})
    
    print(f"\nAll scenarios have been successfully saved in {SCENARIOS_DIR}!")