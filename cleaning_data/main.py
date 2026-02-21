import pandas as pd
import time

# Import all our smart modules
from cleaners.clean_faculty import clean_faculty_column
from cleaners.clean_semester import clean_semester_column
from cleaners.clean_day import clean_day_column
from cleaners.clean_time import clean_time_column
from cleaners.clean_building import clean_building_column
from cleaners.clean_duplicate import clean_duplicates

def main():
    print("Starting the course catalog processing pipeline")
    print("==================================================")
    
    start_time = time.time()

    # --- 1. DATA LOADING ---
    input_file = 'course-catalog-before.csv'
    #output_file = 'course_catalog_after.csv'
    output_file = 'course_catalog_CLEAN_Final.xlsx'
    duplicates_file = 'duplicates_report.xlsx'
    
    print(f"\n[1/8] Loading data from {input_file}...")
    try:
        # Read as string to avoid losing leading zeros in course numbers or time (e.g., 0800)
        df = pd.read_csv(input_file, dtype=str)
        print(f"Successfully loaded rows: {len(df)}")
    except FileNotFoundError:
        print(f"❌ Error: File {input_file} not found!")
        return

    # --- 2. BASIC CLEANING (COURSES AND FACULTIES) ---
    print("[2/8] Cleaning faculties and course numbers...")
    df = clean_faculty_column(df)
    
    # Clean the Course column right here (remove trailing/leading spaces)
    if 'Course' in df.columns:
        df['Course'] = df['Course'].astype(str).str.strip()

    # --- 3. SEMESTERS (EXPLODE) ---
    print("[3/8] Splitting yearly courses into semesters...")
    df = clean_semester_column(df)

    # --- 4. DAYS OF THE WEEK (EXPLODE) ---
    print("[4/8] Splitting classes by days of the week...")
    df = clean_day_column(df)

    # --- 5. TIME (EXPLODE & PARSE) ---
    print("[5/8] Formatting time (creating Time-start and Time-end)...")
    # Important: Execute BEFORE buildings, as the building script relies on sorted times
    df = clean_time_column(df)

    # --- 6. BUILDINGS AND ROOMS (SMART DISTRIBUTE) ---
    print("[6/8] Smart distribution of buildings and rooms...")
    df = clean_building_column(df)

    # --- 7. REMOVE DUPLICATES ---
    print("[7/8] Checking and removing duplicates...")
    # Use the duplicate script and save the audit report
    df = clean_duplicates(df, save_dupes_path=duplicates_file)

    # --- 8. FINALIZATION AND SAVING ---
    print("[8/8] Final column sorting and saving...")
    
    # Set strict column order, matching the target database structure
    target_columns = [
        'Faculty', 'Course', 'Semester', 'Day', 'Time', 
        'Time-start', 'Time-end', 'Building', 'Room', 
        'Building_Name', 'Building_Number'
    ]
    
    # Keep only columns that actually exist to prevent KeyError
    final_cols = [col for col in target_columns if col in df.columns]
    df = df[final_cols]

    # Save to CSV with utf-8-sig encoding (perfect for displaying Hebrew in Excel)
    #df.to_csv(output_file, index=False, encoding='utf-8-sig')
    # Save to Excel):
    df.to_excel(output_file, index=False)
    
    execution_time = round(time.time() - start_time, 2)
    print("\n==================================================")
    print(f"✅ Done! Transformation completed in {execution_time} sec.")
    print(f"📁 Result saved to: {output_file}")
    print(f"📊 Final row count: {len(df)}")
if __name__ == "__main__":
    main()