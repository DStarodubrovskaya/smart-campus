import csv
import os
import random

# BASE_DIR points to the folder where the script (backend) is located
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Go one level higher ("..") and into the data/scenarios folder
SCENARIOS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "data", "scenarios"))

# Create a folder if it doesn't exist
os.makedirs(SCENARIOS_DIR, exist_ok=True)

def generate_users(filename, size, distribution):
    filepath = os.path.join(SCENARIOS_DIR, filename)
    with open(filepath, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['app_user_id', 'role', 'trust_score', 'tier', 'successful_reports', 'total_reports'])
        
        for i in range(1, size + 1):
            uid = f"U{i:03d}"
            # Select a group based on probabilities
            group = random.choices(
                list(distribution.keys()), 
                weights=list(distribution.values())
            )[0]
            
            # Default values ​​(will be overridden below)
            tier = "Resident"
            successful_reports = 0
            total_reports = 0
            
            if group == 'vip':
                trust = round(random.uniform(0.9, 1.0), 2)
                role = 'Lecturer'
                tier = 'VIP'
                successful_reports = random.randint(50, 150)
                total_reports = successful_reports + random.randint(0, 10)
                
            elif group == 'good':
                role = 'Student'
                # 20% chance that a good student is a Newbie
                if random.random() < 0.20:
                    trust = 0.50
                    tier = 'Newbie'
                    successful_reports = random.randint(0, 4)
                    total_reports = successful_reports + random.randint(0, 3)
                else:
                    trust = round(random.uniform(0.6, 0.89), 2)
                    # If the rating is close to the top, he is a student VIP
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
                tier = 'Resident' # They are not newbies, they just lie a lot
                successful_reports = random.randint(5, 30)
                total_reports = successful_reports + random.randint(20, 50) 
                
            elif group == 'shadowbanned':
                trust = round(random.uniform(0.0, 0.19), 2)
                role = 'Student'
                tier = 'Resident'
                successful_reports = random.randint(5, 20)
                total_reports = successful_reports + random.randint(50, 100) # A huge percentage of lies
            
            # Write the updated array
            writer.writerow([uid, role, trust, tier, successful_reports, total_reports])
            
    print(f"✅ Created: {filename} ({size} users)")

if __name__ == "__main__":
    print("Generating datasets for 100 users...\n")
    
    #1. Basic Flow (Corresponds to Utopia/Ideal Day)
    generate_users("1_basic_flow.csv", 100, {'vip': 5, 'good': 95, 'troll': 0, 'shadowbanned': 0})
    
    #2. Conflict (A typical day with controversial situations, the balance between honest and trolls)
    generate_users("2_conflict.csv", 100, {'vip': 5, 'good': 65, 'troll': 20, 'shadowbanned': 10})
    
    #3. Spam Attack (Troll attack, most users want to break the system)
    generate_users("3_spam_attack.csv", 100, {'vip': 0, 'good': 20, 'troll': 40, 'shadowbanned': 40})
    
    #4. VIP Pass (Dictatorship of teachers, many VIP users)
    generate_users("4_vip_pass.csv", 100, {'vip': 40, 'good': 60, 'troll': 0, 'shadowbanned': 0})
    
    print(f"\nAll scenarios have been successfully saved in {SCENARIOS_DIR}!")