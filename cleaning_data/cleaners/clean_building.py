import pandas as pd
import re
import math

def clean_building_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Smart distribution of BUILDINGS and ROOMS.
    If a course runs for 2 days, and the cell contains 2 buildings and 2 rooms,
    the script fairly distributes them: 1st day = 1st building + 1st room, etc.
    """
    df_cleaned = df.copy()

    # --- STEP 1: BLACKLIST (Remove Zoom, Online, No Room, etc.) ---
    bad_phrases = ["טרם שובץ", "נלמד בזום", "חדר מחלקה", "חוץ קמפוס", "מקוון", "ללא חדר", "הוראה מרחוק"]
    def is_bad_location(val):
        text = str(val).strip()
        return any(phrase in text for phrase in bad_phrases)
    
    # Apply the mask and filter out bad locations
    mask_bad = df_cleaned['Building'].apply(is_bad_location)
    df_cleaned = df_cleaned[~mask_bad]

    # --- FUNCTION TO PARSE A SINGLE BUILDING STRING ---
    def parse_single_building_string(text):
        text = str(text).strip()
        b_num = None
        b_name = ""
        
        # If there's a hyphen, split into Name and Number
        if '-' in text:
            parts = text.split('-')
            p1 = parts[0].strip()
            p2 = parts[-1].strip()
            
            # Check which part contains the 3-digit building number
            if re.search(r'\d{3}', p1):
                match = re.search(r'[A-Za-z]?\d{3,4}', p1)
                b_num = match.group(0) if match else None
                b_name = p2
            elif re.search(r'\d{3}', p2):
                match = re.search(r'[A-Za-z]?\d{3,4}', p2)
                b_num = match.group(0) if match else None
                b_name = p1
        else:
            # If no hyphen, try to extract the number and assume the rest is the name
            match = re.search(r'[A-Za-z]?\d{3,4}', text)
            if match:
                b_num = match.group(0)
                b_name = text.replace(b_num, "").strip()

        # Clean the building name from junk words
        if b_name:
            for junk in ["בניין", "חדר", "המשך", "קומה"]:
                b_name = b_name.replace(junk, "").strip()
            if len(b_name) > 30: 
                b_name = b_name[:30]
                
        return b_num, b_name

    # --- STEP 2: SMART DISTRIBUTION (BUILDINGS + ROOMS) ---
    # Map Hebrew days to numbers for chronological sorting
    day_map = {"א'": 1, "ב'": 2, "ג'": 3, "ד'": 4, "ה'": 5, "ו'": 6, "ז'": 7}
    df_cleaned['Day_Num'] = df_cleaned['Day'].map(day_map).fillna(0)

    def smart_distribute(group):
        if group['Building'].isna().all():
            return group

        # 1. Extract raw text for buildings and rooms (take from the first row of the group)
        raw_bldg_text = str(group.iloc[0]['Building'])
        raw_room_text = str(group.iloc[0]['Room'])
        
        # --- Parse Buildings ---
        raw_matches = re.findall(r'[A-Za-z]?\d{3,4}(?:-[^0-9,]+)?|[^0-9,-]+-[A-Za-z]?\d{3,4}', raw_bldg_text)
        building_pairs = []
        if not raw_matches:
            codes = re.findall(r'[A-Za-z]?\d{3,4}', raw_bldg_text)
            seen = set()
            for c in codes:
                if c not in seen and len(c) >= 3:
                    building_pairs.append((c, ""))
                    seen.add(c)
        else:
            seen_nums = set()
            for match in raw_matches:
                num, name = parse_single_building_string(match)
                if num and num not in seen_nums:
                    building_pairs.append((num, name))
                    seen_nums.add(num)

        # --- Parse Rooms ---
        # Split rooms by newline (\n) or comma, so "1" and "212" become a list ['1', '212']
        rooms_list = [r.strip() for r in re.split(r'[\n,]+', raw_room_text) if r.strip() and r.strip() != 'nan']

        # 2. Sort the group chronologically by Day and Time-start
        group = group.sort_values(by=['Day_Num', 'Time-start'])
        
        num_rows = len(group)
        num_bldgs = len(building_pairs)
        num_rooms = len(rooms_list)
        
        if num_bldgs == 0:
            return group

        final_nums = []
        final_names = []
        final_rooms = []

        # 3. DISTRIBUTE BUILDINGS AND ROOMS
        for i in range(num_rows):
            # Distribute Buildings
            if num_rows == num_bldgs:
                b_idx = i
            elif num_rows > num_bldgs and num_bldgs > 1:
                chunk_size = math.ceil(num_rows / num_bldgs)
                b_idx = min(i // chunk_size, num_bldgs - 1)
            else:
                b_idx = 0
                
            final_nums.append(building_pairs[b_idx][0])
            final_names.append(building_pairs[b_idx][1])

            # Distribute Rooms (using the same logic)
            if num_rooms == 0:
                final_rooms.append("")
            elif num_rows == num_rooms:
                final_rooms.append(rooms_list[i])
            elif num_rows > num_rooms and num_rooms > 1:
                chunk_size = math.ceil(num_rows / num_rooms)
                r_idx = min(i // chunk_size, num_rooms - 1)
                final_rooms.append(rooms_list[r_idx])
            else:
                final_rooms.append(rooms_list[0])

        # 4. Assign results back to the group
        group['Building_Number'] = final_nums
        group['Building_Name'] = final_names
        group['Room'] = final_rooms
        
        return group

    # Apply smart distribution, grouping by Course and Semester
    df_cleaned = df_cleaned.groupby(['Course', 'Semester'], group_keys=False).apply(smart_distribute, include_groups=False)
    # --- STEP 3: FINAL CLEANUP ---
    # Drop rows that ended up without a building number
    df_cleaned = df_cleaned.dropna(subset=['Building_Number'])
    
    # Reconstruct the formatted 'Building' column
    df_cleaned['Building_Name'] = df_cleaned['Building_Name'].fillna("")
    df_cleaned['Building'] = df_cleaned['Building_Name'] + " " + df_cleaned['Building_Number']
    df_cleaned['Building'] = df_cleaned['Building'].str.strip()

    # Final cleanup of rooms from Hebrew (keep only alphanumeric chars, e.g., "102א" -> "102")
    def clean_final_room_string(val):
        match = re.search(r'[A-Za-z0-9]+', str(val))
        return match.group(0) if match else ""
        
    df_cleaned['Room'] = df_cleaned['Room'].apply(clean_final_room_string)

    # Drop the temporary Day_Num column
    df_cleaned = df_cleaned.drop(columns=['Day_Num'], errors='ignore')

    return df_cleaned