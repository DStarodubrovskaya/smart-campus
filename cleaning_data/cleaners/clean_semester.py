import pandas as pd

def clean_semester_column(df: pd.DataFrame) -> pd.DataFrame:
    # Create a copy to avoid modifying the original dataframe directly
    df_cleaned = df.copy()

    def parse_semester(val):
        # Check for empty values (so NaN doesn't turn into the string "nan")
        if pd.isna(val):
            return [val] 

        text = str(val)
        found_semesters = []
        
        # Search for Semester A
        if "א'" in text:
            found_semesters.append("א'")
            
        # Search for Semester B
        if "ב'" in text:
            found_semesters.append("ב'")
            
        # Search for Summer Semester (קיץ or ג')
        if "ג'" in text or "קיץ" in text:
            found_semesters.append("קיץ")
        
        # If nothing is found, return the original text as a list (so explode doesn't throw an error)
        return found_semesters if found_semesters else [text]

    # Step 1: Convert text into lists. For example: "א', ב'" -> ["א'", "ב'"]
    df_cleaned['Semester'] = df_cleaned['Semester'].apply(parse_semester)

    # Step 2: EXPLODE. 
    # A row with the list ["א'", "ב'"] is duplicated and split into 2 rows.
    # reset_index(drop=True) updates the row numbering after the explosion.
    df_cleaned = df_cleaned.explode('Semester').reset_index(drop=True)

    return df_cleaned