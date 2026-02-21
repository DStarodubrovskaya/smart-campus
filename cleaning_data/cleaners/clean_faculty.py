import pandas as pd
import re

def clean_faculty_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Cleans and normalizes the Faculty column.
    Fixes:
    1. Extracts the real faculty name from messy multi-line scraped data.
    2. Removes duplicated "מחלקה מחלקה" words.
    """
    # Create a copy to avoid modifying the original dataframe directly
    df_cleaned = df.copy()

    def parse_faculty(val):
        # Prevent errors on empty/NaN values
        if pd.isna(val):
            return val
            
        text = str(val).strip()
        
        # --- FIX 2: Handle bad scrape (multi-line text block) ---
        # If there are newlines in the text, it means we grabbed a huge block
        if '\n' in text:
            lines = text.split('\n')
            for line in lines:
                line = line.strip()
                # We are looking for the exact line that STARTS with "מחלקה"
                # This perfectly ignores "פרטי קורס : שעות מחלקה" or "מרצה מחלקה מרצי"
                if line.startswith("מחלקה"):
                    text = line  # Overwrite the giant block with just this correct line
                    break
        
        # --- FIX 1: Remove duplicated "מחלקה" ---
        # This regex looks for the word "מחלקה" repeating 2 or more times (even with weird spaces)
        # and replaces it with a single "מחלקה "
        text = re.sub(r'(מחלקה\s*){2,}', 'מחלקה ', text)
        
        # Standard cleanup: remove quotes and extra trailing/leading spaces
        text = text.replace('"', '').strip()
        
        return text

    # Apply the cleaning function to the Faculty column
    if 'Faculty' in df_cleaned.columns:
        df_cleaned['Faculty'] = df_cleaned['Faculty'].apply(parse_faculty)

    return df_cleaned


