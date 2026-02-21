import pandas as pd

def clean_day_column(df: pd.DataFrame) -> pd.DataFrame:
    # Create a copy to avoid modifying the original dataframe directly
    df_cleaned = df.copy()

    # List of valid days in Hebrew
    valid_days = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ז'"]

    def parse_days(val):
        # Check for empty values (NaN) to prevent errors
        if pd.isna(val):
            return None 
            
        text = str(val).strip()
        
        # Find all valid days that are mentioned in the text
        found_days = [day for day in valid_days if day in text]
        
        # Return the list of found days, or None if nothing matched (garbage data)
        return found_days if found_days else None

    # Step 1: Extract days into lists (e.g., "ג',ד'" -> ["ג'", "ד'"])
    df_cleaned['Day'] = df_cleaned['Day'].apply(parse_days)

    # Step 2: Remove rows where no valid days were found (drop garbage/empty data)
    # Note: If you want to KEEP courses without specific days, remove this line!
    df_cleaned = df_cleaned.dropna(subset=['Day'])

    # Step 3: EXPLODE. 
    # Split the lists into separate rows and reset the index to keep numbering clean
    df_cleaned = df_cleaned.explode('Day').reset_index(drop=True)

    return df_cleaned