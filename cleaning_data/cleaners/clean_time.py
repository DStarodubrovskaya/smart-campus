import pandas as pd
import re

def clean_time_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Cleans and formats the Time column.
    1. Finds all time intervals using regex.
    2. Explodes the row if multiple times are found in a single cell.
    3. Adds colons to the time format (0800 -> 08:00).
    4. Creates separate columns for Time-start and Time-end.
    """
    df_cleaned = df.copy()

    def extract_time_ranges(val):
        # Prevent errors on empty/NaN values
        if pd.isna(val):
            return None
            
        text = str(val).strip()
        
        # Regex with capture groups. 
        # Returns a list of tuples: [('0800', '1000'), ('1200', '1400')]
        ranges = re.findall(r'(\d{4})\s?-\s?(\d{4})', text)
        
        # If no time is found, return None so the row can be dropped later
        return ranges if ranges else None

    # Step 1: Extract time ranges as lists of tuples into a temporary column
    df_cleaned['Time_Tuples'] = df_cleaned['Time'].apply(extract_time_ranges)

    # Step 2: Drop rows where no valid time was found
    df_cleaned = df_cleaned.dropna(subset=['Time_Tuples'])

    # Step 3: Explode the list (e.g., if there were two times, it becomes two rows)
    # reset_index(drop=True) is crucial here to keep row numbering clean!
    df_cleaned = df_cleaned.explode('Time_Tuples').reset_index(drop=True)

    # Step 4: Unpack the tuple ('0800', '1000') and format it
    def format_tuple(tup):
        start_raw, end_raw = tup
        
        # Insert colons
        start_fmt = f"{start_raw[:2]}:{start_raw[2:]}"
        end_fmt = f"{end_raw[:2]}:{end_raw[2:]}"
        full_fmt = f"{start_fmt} - {end_fmt}"
        
        # Return as a Series so it can be assigned to multiple columns at once
        return pd.Series([full_fmt, start_fmt, end_fmt])

    # Assign the results to the 3 final columns
    df_cleaned[['Time', 'Time-start', 'Time-end']] = df_cleaned['Time_Tuples'].apply(format_tuple)

    # Drop the temporary column
    df_cleaned = df_cleaned.drop(columns=['Time_Tuples'])

    return df_cleaned