import csv
import os
import random

# BASE_DIR now points to the backend folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Go up one level ("..") and go to data/scenarios
SCENARIOS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data", "scenarios"))

# Create a folder if it doesn't exist
os.makedirs(SCENARIOS_DIR, exist_ok=True)

def generate_users(filename, size, distribution):
    filepath = os.path.join(SCENARIOS_DIR, filename)
    with open(filepath, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['app_user_id', 'role', 'trust_score'])
        
        for i in range(1, size + 1):
            uid = f"U{i:03d}"
            # Select a group based on probabilities
            group = random.choices(
                list(distribution.keys()), 
                weights=list(distribution.values())
            )[0]
            
            if group == 'vip':
                trust = round(random.uniform(0.9, 1.0), 2)
                role = 'Lecturer'
            elif group == 'good':
                trust = round(random.uniform(0.6, 0.89), 2)
                role = 'Student'
            elif group == 'troll':
                trust = round(random.uniform(0.2, 0.4), 2) # Spamming, but not banned
                role = 'Student'
            elif group == 'shadowbanned':
                trust = round(random.uniform(0.0, 0.19), 2) # Shadowban (buttons don't work)
                role = 'Student'
            
            writer.writerow([uid, role, trust])
    print(f"✅ Created: {filename} ({size} users)")

if __name__ == "__main__":
    print("🛠 Generating datasets for a demo presentation...\n")
    
    # 1. Utopia: Almost everyone is an excellent student. Consensus is reached very quickly and fairly.
    generate_users("1_utopia.csv", 30, {'vip': 10, 'good': 90, 'troll': 0, 'shadowbanned': 0})
    
    # 2. Troll Attack: 80% Are Malicious. We Show How the System Resists Chaos.
    generate_users("2_troll_attack.csv", 50, {'vip': 0, 'good': 20, 'troll': 40, 'shadowbanned': 40})
    
    # 3. VIP Dictatorship: Half of the users are moderators. Statuses change instantly without consensus.
    generate_users("3_vip_dictatorship.csv", 30, {'vip': 50, 'good': 50, 'troll': 0, 'shadowbanned': 0})
    
    # 4. A typical day: A balanced scenario (like in real life).
    generate_users("4_normal_day.csv", 40, {'vip': 5, 'good': 70, 'troll': 15, 'shadowbanned': 10})
    
    print(f"\n🎉 All script files have been successfully saved to {SCENARIOS_DIR}!")